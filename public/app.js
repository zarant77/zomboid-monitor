const $ = id => document.getElementById(id);
function escapeHtml(value) {
  return String(value ?? '—').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function duration(value) {
  const seconds = Math.floor(value || 0);
  return seconds >= 3600 ? `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m` : `${Math.floor(seconds/60)}m ${seconds%60}s`;
}
const when = value => value ? new Date(value).toLocaleString() : '—';
const bool = value => value == null ? 'Unknown' : value ? 'Yes' : 'No';
const ping = value => value == null ? '—' : `${Math.round(value)} ms`;
function metrics(id, values) {
  $(id).innerHTML = values.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}
function rows(id, values, columns) {
  $(id).innerHTML = values.length ? values.join('') : `<tr><td colspan="${columns}" class="muted">No data yet</td></tr>`;
}
async function get(endpoint) {
  const response = await fetch(`/api/${endpoint}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
  return response.json();
}
async function update() {
  try {
    const [s, players, board, stats, events, mods] = await Promise.all(['status','players','leaderboard','stats','events?limit=50','mods'].map(get));
    $('name').textContent = s.name;
    $('address').textContent = `${s.host}:${s.port}`;
    $('status').textContent = s.stale ? 'STALE' : s.online == null ? 'WAITING' : s.online ? 'ONLINE' : 'OFFLINE';
    $('status').className = `badge ${s.online && !s.stale ? 'online' : 'offline'}`;
    $('error').textContent = s.error || (s.stale ? 'Waiting for a fresh monitor check.' : '');
    metrics('server-metrics', [['Players', s.players == null ? '—' : `${s.players}/${s.maxPlayers ?? '—'}`],['Ping',ping(s.ping)],['Version',s.version],['Mods',s.modCount],['PvP',bool(s.pvp)],['Public',bool(s.public)],['Open',bool(s.open)],['Secure',bool(s.secure)]]);
    rows('players', players.map(p => `<tr class="online"><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.currentKills)}</td><td>${escapeHtml(duration(p.currentSessionSeconds))}</td></tr>`),3);
    $('online-count').textContent = `(${players.length} tracked)`;
    $('players-note').textContent = s.online && s.playersReported == null ? 'Player list was not returned; showing last known presence.' : s.online && s.players > players.length ? 'Server count exceeds reported names; only named players can be tracked.' : '';
    rows('leaderboard', board.map((p,i) => `<tr class="${p.online ? 'online' : 'offline'}"><td>${i+1}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.maxKills)}</td><td>${p.online ? 'Online' : 'Offline'}</td><td>${escapeHtml(when(p.lastSeen))}</td></tr>`),5);
    metrics('stats', [['Availability',stats.availability == null ? '—' : `${stats.availability.toFixed(2)}%`],['Peak players',stats.peakPlayers],['Average ping',ping(stats.avgPing)],['Min ping',ping(stats.minPing)],['Max ping',ping(stats.maxPing)],['Tracked players',stats.trackedPlayers],['Total checks',stats.totalChecks],['Failures',stats.failedChecks]]);
    $('state-time').textContent = `${s.online ? 'Current uptime' : 'Current state'}: ${duration(stats.currentStateSeconds)} · Observed downtime: ${duration(stats.downtimeSeconds)}`;
    const peak = Math.max(1, ...stats.recentSamples.map(sample => sample.avgPlayers || 0));
    $('history').replaceChildren(...stats.recentSamples.map(sample => {
      const bar = document.createElement('div'); bar.className = `bar${sample.failedChecks ? ' failed' : ''}`;
      bar.style.height = `${Math.max(5,(sample.avgPlayers || 0)/peak*100)}%`;
      bar.title = `${when(sample.createdAt)} · ${sample.avgPlayers?.toFixed(1) ?? '—'} players · ${sample.failedChecks}/${sample.checks} failures`;
      return bar;
    }));
    rows('events', events.map(e => `<tr><td>${escapeHtml(when(e.createdAt))}</td><td>${escapeHtml(e.eventType)}</td><td>${escapeHtml(e.message)}</td></tr>`),3);
    $('mods-count').textContent = `${mods.totalCount ?? 'Unknown number of'} mods`;
    $('mods-note').textContent = `${mods.reportedCount} reported by server · ${mods.complete ? 'Complete list' : 'Incomplete list; server does not report all IDs or total is unknown.'}`;
    $('mods').innerHTML = mods.mods.map(mod => `<span class="tag">${escapeHtml(mod)}</span>`).join('');
    $('description').textContent = s.description || 'No description reported.';
    $('info-details').textContent = `OS: ${s.environment ?? 'Unknown'} · Password: ${bool(s.password)} · Modded: ${bool(s.modded)} · Metadata last received: ${when(s.metadataUpdatedAt)}`;
    $('refresh').textContent = `Last check: ${when(s.updatedAt)} · ${s.stale ? 'Data is stale' : 'Refreshing every 5 seconds'}`;
  } catch (error) {
    $('refresh').textContent = `Monitor connection failed: ${error.message}. Retrying…`;
    $('status').textContent = 'STALE'; $('status').className = 'badge offline';
  } finally { setTimeout(update,5000); }
}
update();
