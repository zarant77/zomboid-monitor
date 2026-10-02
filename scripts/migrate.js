const config = require('../src/config');
const { openDatabase, migrate } = require('../src/db');
const db = openDatabase(config.databasePath);
try { migrate(db); console.log(`Migrations ready: ${config.databasePath}`); }
finally { db.close(); }
