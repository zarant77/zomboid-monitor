function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function flag(value) { return value === undefined ? null : String(value) === '1'; }
function normalize(state, config) {
  const raw = state.raw || {}, rules = raw.rules || {};
  const tags = Array.isArray(raw.tags) ? raw.tags.join(';') : String(raw.tags || '');
  const mods = [...new Set(String(rules.mods || '').split(';').map(s => s.trim()).filter(Boolean))];
  const description = Object.entries(rules).filter(([k]) => /^description:\d+\/\d+$/.test(k))
    .sort(([a], [b]) => Number(a.split(':')[1].split('/')[0]) - Number(b.split(':')[1].split('/')[0]))
    .map(([, v]) => v).join('').replaceAll('<LINE>', '\n').replace(/<RGB:[^>]*>/gi, '').trim();
  const playerList = Array.isArray(raw.players) ? [...new Map(raw.players
    .filter(p => typeof p.name === 'string' && p.name.length > 0)
    .map(p => [p.name, { name: p.name, kills: number(p.score) ?? 0, sessionSeconds: number(p.time) ?? 0 }])).values()] : null;
  return {
    online: true, name: state.name || 'Project Zomboid', host: config.host, port: config.gamePort,
    ping: number(state.ping), players: number(state.numplayers) ?? playerList?.length ?? null,
    maxPlayers: number(state.maxplayers), version: rules.version || tags.match(/VERSION:([^;]+)/)?.[1] || state.version || null,
    modded: tags ? /(?:^|;)modded(?:;|$)/i.test(tags) : null,
    modCount: number(rules.modCount), modsReported: mods.length, mods,
    pvp: flag(rules.pvp), open: flag(rules.open), public: flag(rules.public),
    secure: raw.secure === undefined ? null : Number(raw.secure) === 1,
    password: typeof state.password === 'boolean' ? state.password : null,
    environment: ({ l: 'Linux', w: 'Windows', m: 'macOS' })[raw.environment] || raw.environment || null,
    description, playerList, playersReported: playerList?.length ?? null, error: null
  };
}
module.exports = { normalize };
