const config = require('./src/config');
const { openDatabase, migrate, applyServerWipe } = require('./src/db');
const { Repository } = require('./src/repository');
const { Monitor } = require('./src/monitor');
const { createServer } = require('./src/http');
const db = openDatabase(config.databasePath);
migrate(db);
if (applyServerWipe(db, config.serverWipeId)) console.log(`Database reset for server wipe: ${config.serverWipeId}`);
const repository = new Repository(db, config);
const monitor = new Monitor(repository, config);
const server = createServer(repository, monitor);
let stopping = false;
async function shutdown(reason, code = 0) {
  if (stopping) return;
  stopping = true;
  console.log(`Shutting down: ${reason}`);
  const deadline = setTimeout(() => process.exit(1), 15000).unref();
  try {
    await Promise.all([monitor.stop(), new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); })]);
    db.close(); clearTimeout(deadline); process.exitCode = code;
  } catch (error) { console.error(error); process.exitCode = 1; }
}
monitor.onFatal = () => { void shutdown('database failure', 1); };
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
server.on('error', error => { console.error(error); void shutdown('HTTP server error', 1); });
server.listen(config.port, '0.0.0.0', () => {
  console.log(`Monitor: http://localhost:${config.port}; game ${config.host}:${config.gamePort}`);
  monitor.start();
});
