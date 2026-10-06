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
module.exports = {
  serverTimezone,
  serverWipeId: process.env.SERVER_WIPE_ID?.trim() || null,
  port: integer('PORT', 3000, 65535),
  host: process.env.GAME_HOST || '2.28.54.80',
  gamePort: integer('GAME_PORT', 16261, 65535),
  interval: integer('CHECK_INTERVAL', 5000, 2147483647),
  databasePath: path.resolve(process.env.DATABASE_PATH || './data/zomboid.db')
};
