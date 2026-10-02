class Repository {
  constructor(db, config) {
    this.db = db; this.config = config; this.previousCheckTime = null;
    db.prepare('INSERT OR IGNORE INTO server_state(id,host,port) VALUES(1,?,?)').run(config.host, config.gamePort);
    const target = this.state();
    if (target.host !== config.host || target.port !== config.gamePort) {
      throw new Error('Database belongs to another game server. Use a different DATABASE_PATH.');
    }
  }
  state() { return this.db.prepare('SELECT * FROM server_state WHERE id=1').get(); }
  record(result, at = new Date().toISOString()) {
    const db = this.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      const old = this.state(), online = result.online ? 1 : 0;
      const elapsed = this.previousCheckTime === null ? 0 : Math.max(0, (Date.parse(at) - this.previousCheckTime) / 1000);
      const status = result.online ? { ...result, updatedAt: at, metadataUpdatedAt: at } : {
        ...JSON.parse(old.status_json || '{}'), online: false, ping: null, players: null,
        playerList: [], host: this.config.host, port: this.config.gamePort, updatedAt: at, error: result.error
      };
      if (old.online !== online) db.prepare('INSERT INTO server_events(event_type,created_at,message) VALUES(?,?,?)')
        .run(online ? 'server_up' : 'server_down', at, online ? 'Server responding' : result.error);
      const previous = db.prepare('SELECT * FROM players WHERE online=1').all();
      const list = online ? result.playerList : [];
      if (list !== null) {
        const seen = new Set(list.map(p => p.name));
        for (const p of list) {
          const existing = db.prepare('SELECT * FROM players WHERE name=?').get(p.name);
          db.prepare(`INSERT INTO players(name,first_seen,last_seen,current_kills,max_kills,online,current_session_seconds)
            VALUES(?,?,?,?,?,1,?) ON CONFLICT(name) DO UPDATE SET last_seen=excluded.last_seen,
            current_kills=excluded.current_kills,max_kills=MAX(players.max_kills,excluded.max_kills),
            online=1,current_session_seconds=excluded.current_session_seconds`).run(p.name, at, at, p.kills, p.kills, p.sessionSeconds);
          if (!existing?.online) {
            const id = existing?.id ?? db.prepare('SELECT id FROM players WHERE name=?').get(p.name).id;
            db.prepare('INSERT INTO player_events(player_id,event_type,created_at,kills,session_seconds) VALUES(?,?,?,?,?)')
              .run(id, 'join', at, p.kills, p.sessionSeconds);
          }
        }
        for (const p of previous.filter(p => !seen.has(p.name))) {
          db.prepare('UPDATE players SET online=0,last_session_seconds=current_session_seconds WHERE id=?').run(p.id);
          db.prepare('INSERT INTO player_events(player_id,event_type,created_at,kills,session_seconds) VALUES(?,?,?,?,?)')
            .run(p.id, 'leave', at, p.current_kills, p.current_session_seconds);
        }
      }
      const ping = online ? result.ping : null;
      db.prepare(`UPDATE server_state SET status_json=?,online=?,state_since=?,last_check=?,
        total_checks=total_checks+1,failed_checks=failed_checks+?,ping_sum=ping_sum+?,ping_checks=ping_checks+?,
        min_ping=CASE WHEN ? IS NULL THEN min_ping WHEN min_ping IS NULL THEN ? ELSE MIN(min_ping,?) END,
        max_ping=CASE WHEN ? IS NULL THEN max_ping WHEN max_ping IS NULL THEN ? ELSE MAX(max_ping,?) END,
        peak_players=MAX(peak_players,?),downtime_seconds=downtime_seconds+?,observed_seconds=observed_seconds+? WHERE id=1`)
        .run(JSON.stringify(status), online, old.online === online ? old.state_since : at, at,
          1-online, ping ?? 0, ping === null ? 0 : 1, ping, ping, ping, ping, ping, ping,
          online ? result.players ?? 0 : 0, old.online === 0 ? elapsed : 0, elapsed);
      const bucket = at.slice(0, 16) + ':00.000Z';
      const sample = db.prepare('SELECT * FROM server_samples WHERE created_at=?').get(bucket);
      const checks = (sample?.checks || 0) + 1, failed = (sample?.failed_checks || 0) + 1-online;
      const pingSum = (sample?.ping_sum || 0) + (ping ?? 0), pingChecks = (sample?.ping_checks || 0) + (ping === null ? 0 : 1);
      const hasPlayers = online && result.players !== null;
      const playersSum = (sample?.players_sum || 0) + (hasPlayers ? result.players : 0);
      const successes = (sample?.successful_checks || 0) + (hasPlayers ? 1 : 0);
      const minPing = ping === null ? sample?.min_ping ?? null : Math.min(sample?.min_ping ?? ping, ping);
      const maxPing = ping === null ? sample?.max_ping ?? null : Math.max(sample?.max_ping ?? ping, ping);
      db.prepare(`INSERT OR REPLACE INTO server_samples VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        bucket, online, pingChecks ? pingSum / pingChecks : null, minPing, maxPing,
        successes ? playersSum / successes : null,
        hasPlayers ? Math.max(sample?.max_players_seen ?? 0, result.players) : sample?.max_players_seen ?? null,
        online ? result.maxPlayers : sample?.server_max_players ?? null,
        checks, failed, pingSum, pingChecks, playersSum, successes);
      db.exec('COMMIT'); this.previousCheckTime = Date.parse(at);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  status() {
    const row = this.state();
    const result = JSON.parse(row.status_json || '{}');
    const { mods, playerList, ...status } = result;
    return { online: null, name: 'Project Zomboid', host: this.config.host, port: this.config.gamePort,
      updatedAt: null, ...status, stale: !row.last_check || Date.now() - Date.parse(row.last_check) > this.config.interval + 15000 };
  }
  players(onlineOnly = false) {
    return this.db.prepare(`SELECT * FROM players ${onlineOnly ? 'WHERE online=1' : ''} ORDER BY max_kills DESC,name`).all().map(p => ({
      name: p.name, currentKills: p.current_kills, maxKills: p.max_kills, online: Boolean(p.online),
      firstSeen: p.first_seen, lastSeen: p.last_seen, currentSessionSeconds: p.current_session_seconds, lastSessionSeconds: p.last_session_seconds
    }));
  }
  stats() {
    const s = this.state(), status = this.status();
    return { ...status, totalChecks: s.total_checks, failedChecks: s.failed_checks,
      availability: s.total_checks ? (s.total_checks-s.failed_checks)/s.total_checks*100 : null,
      minPing: s.min_ping, avgPing: s.ping_checks ? s.ping_sum/s.ping_checks : null, maxPing: s.max_ping,
      peakPlayers: s.peak_players, trackedPlayers: this.db.prepare('SELECT COUNT(*) AS n FROM players').get().n,
      stateSince: s.state_since, currentStateSeconds: s.state_since ? Math.max(0,(Date.now()-Date.parse(s.state_since))/1000) : 0,
      uptimeCurrentStateSeconds: s.online === 1 && s.state_since ? Math.max(0,(Date.now()-Date.parse(s.state_since))/1000) : 0,
      downtimeSeconds: s.downtime_seconds, observedSeconds: s.observed_seconds,
      recentSamples: this.db.prepare('SELECT created_at AS createdAt, online, avg_ping AS avgPing, avg_players AS avgPlayers, checks, failed_checks AS failedChecks FROM server_samples ORDER BY created_at DESC LIMIT 60').all().reverse()
    };
  }
  mods() {
    const status = JSON.parse(this.state().status_json || '{}'), mods = status.mods || [];
    return { reportedCount: mods.length, totalCount: status.modCount ?? null,
      complete: status.modCount != null && mods.length === status.modCount, mods, updatedAt: status.metadataUpdatedAt ?? null };
  }
  events(limit) {
    return this.db.prepare(`SELECT 'server' AS source,id,event_type AS eventType,created_at AS createdAt,message,NULL AS player,NULL AS kills,NULL AS sessionSeconds FROM server_events
      UNION ALL SELECT 'player',e.id,e.event_type,e.created_at,p.name || CASE e.event_type WHEN 'join' THEN ' joined' ELSE ' left' END,p.name,e.kills,e.session_seconds
      FROM player_events e JOIN players p ON p.id=e.player_id ORDER BY createdAt DESC,id DESC LIMIT ?`).all(limit);
  }
}
module.exports = { Repository };
