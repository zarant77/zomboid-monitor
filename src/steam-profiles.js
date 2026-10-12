const TTL = 6 * 3600000, RETRY = 10 * 60000;
const AVATAR_HOSTS = new Set(['avatars.steamstatic.com', 'avatars.fastly.steamstatic.com', 'steamcdn-a.akamaihd.net']);
function safeAvatar(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !AVATAR_HOSTS.has(url.hostname) || url.port || url.username || url.password || url.search || url.hash ||
      !/^\/(?:steamcommunity\/public\/images\/avatars\/[a-f0-9]{2}\/)?[a-f0-9]{40}(?:_medium|_full)?\.jpg$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
function createSteamProfiles(db, { steamApiKey }, fetchSteam = fetch) {
  const pending = new Map();
  async function fetchBatch(rows) {
    let players = [];
    try {
      const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
      url.searchParams.set('key', steamApiKey); url.searchParams.set('steamids', rows.map(row => row.steam_id).join(','));
      const response = await fetchSteam(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.response?.players)) players = data.response.players;
      }
    } catch { /* Keep cached names and avatars; never log the URL containing the key. */ }
    const now = Date.now();
    for (const row of rows) {
      const profile = players.find(player => player?.steamid === row.steam_id);
      const name = typeof profile?.personaname === 'string' ? profile.personaname.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160) : '';
      if (name) db.prepare('UPDATE users SET display_name=?,avatar_url=?,profile_updated_at=?,profile_checked_at=? WHERE id=?').run(name, safeAvatar(profile.avatarmedium || profile.avatarfull || profile.avatar), now, now, row.id);
      else db.prepare('UPDATE users SET profile_checked_at=? WHERE id=?').run(now, row.id);
    }
  }
  async function refresh(userIds, force = false) {
    if (!steamApiKey) return;
    const rows = [...new Set(userIds)].map(id => db.prepare('SELECT id,steam_id,profile_updated_at,profile_checked_at FROM users WHERE id=?').get(id)).filter(Boolean);
    const needed = rows.filter(row => force || !row.profile_checked_at || Date.now() - row.profile_checked_at >= (row.profile_updated_at === row.profile_checked_at ? TTL : RETRY));
    const waits = needed.filter(row => pending.has(row.id)).map(row => pending.get(row.id));
    const fresh = needed.filter(row => !pending.has(row.id));
    for (let start = 0; start < fresh.length; start += 100) {
      const batch = fresh.slice(start, start + 100);
      const promise = fetchBatch(batch).finally(() => { for (const row of batch) pending.delete(row.id); });
      for (const row of batch) pending.set(row.id, promise);
      waits.push(promise);
    }
    await Promise.all(waits);
  }
  return { refresh };
}
module.exports = { createSteamProfiles, safeAvatar };
