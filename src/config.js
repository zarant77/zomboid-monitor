const path = require('node:path');
const fs = require('node:fs');
if (fs.existsSync(path.resolve('.env'))) process.loadEnvFile();
function integer(name, fallback, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`);
  return value;
}
module.exports = {
  serverWipeId: process.env.SERVER_WIPE_ID?.trim() || null,
  port: integer('PORT', 3000, 65535),
  host: process.env.GAME_HOST || '2.28.54.80',
  gamePort: integer('GAME_PORT', 16261, 65535),
  interval: integer('CHECK_INTERVAL', 5000, 2147483647),
  databasePath: path.resolve(process.env.DATABASE_PATH || './data/zomboid.db')
};
