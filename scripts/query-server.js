const fs = require('node:fs');
const { inspect } = require('node:util');
const { GameDig } = require('gamedig');

async function main() {
  if (fs.existsSync('.env')) process.loadEnvFile();
  const [host = process.env.GAME_HOST || '2.28.54.80', portValue = process.env.GAME_PORT || '16261', ...extra] = process.argv.slice(2);
  const port = Number(portValue);
  if (!host.trim() || !Number.isSafeInteger(port) || port < 1 || port > 65535 || extra.length) {
    throw new Error('Usage: node scripts/query-server.js [host] [query-port]');
  }
  console.log(`Querying Project Zomboid at ${host}:${port} (A2S info, players, rules)…`);
  const result = await GameDig.query({
    type: 'projectzomboid', host, port,
    requestPlayers: true, requestPlayersRequired: false,
    requestRules: true, requestRulesRequired: false,
    givenPortOnly: true, socketTimeout: 5000, attemptTimeout: 15000, maxRetries: 0
  });
  console.log(inspect(result, {
    depth: null, maxArrayLength: null, maxStringLength: null,
    colors: Boolean(process.stdout.isTTY), compact: false, customInspect: false
  }));
  if (!result.raw?.rules || Object.keys(result.raw.rules).length === 0) {
    console.log('No rules returned. The server may disable A2S_RULES or the rules request may have timed out.');
  }
}
main().catch(error => {
  console.error('Server query failed:', error.message);
  process.exitCode = 1;
});
