const path = require('node:path');
const fs = require('node:fs');
const { DEFAULT_SERVER_TIMEZONE } = require('./time');
if (fs.existsSync(path.resolve('.env'))) process.loadEnvFile();
function integer(name, fallback, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`);
  return value;
}
const serverTimezone = process.env.SERVER_TIMEZONE?.trim() || DEFAULT_SERVER_TIMEZONE;
try { new Intl.DateTimeFormat('en', { timeZone: serverTimezone }); }
catch { throw new Error(`Invalid SERVER_TIMEZONE: ${serverTimezone}`); }
const originValue = process.env.PUBLIC_ORIGIN?.trim() || (process.env.NODE_ENV === 'production' ? '' : `http://localhost:${integer('PORT', 3000, 65535)}`);
let publicOrigin;
try {
  const url = new URL(originValue);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error();
  publicOrigin = url.origin;
} catch { throw new Error('PUBLIC_ORIGIN must be a public HTTPS origin (or HTTP localhost for development)'); }
module.exports = {
  publicOrigin,
  steamApiKey: process.env.STEAM_API_KEY?.trim() || null,
  serverTimezone,
  serverWipeId: process.env.SERVER_WIPE_ID?.trim() || null,
  port: integer('PORT', 3000, 65535),
  host: process.env.GAME_HOST || '2.28.54.80',
  gamePort: integer('GAME_PORT', 16261, 65535),
  interval: integer('CHECK_INTERVAL', 5000, 2147483647),
  maxKillGainPerCheck: integer('MAX_KILL_GAIN_PER_CHECK', 1000),
  databasePath: path.resolve(process.env.DATABASE_PATH || './data/zomboid.db')
};
