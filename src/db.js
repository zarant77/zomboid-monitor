const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
function openDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  return db;
}
function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const directory = path.join(__dirname, '../migrations');
  for (const name of fs.readdirSync(directory).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(name)) {
        db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
        db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(name, new Date().toISOString());
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}
module.exports = { openDatabase, migrate };
