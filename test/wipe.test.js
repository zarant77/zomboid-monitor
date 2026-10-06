const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrate, applyServerWipe } = require('../src/db');
const { Repository } = require('../src/repository');
const config = { host: 'test', gamePort: 16261, interval: 5000 };
const state = kills => ({ online: true, ping: 60, players: 1, maxPlayers: 30,
  playerList: [{ name: 'Ryder', kills, sessionSeconds: 20 }], mods: ['old-mod'] });

test('wipe resets all observations once per ID and fresh tracking starts normally', t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec('PRAGMA foreign_keys=ON'); migrate(db);
  let r = new Repository(db, config);
  r.record(state(100)); r.record(state(0));
  const migrations = db.prepare('SELECT * FROM schema_migrations').all();
  assert.equal(applyServerWipe(db, null), false);
  assert.equal(r.players()[0].deaths, 1);
  assert.equal(applyServerWipe(db, 'wipe-1'), true);
  for (const table of ['player_kill_changes', 'players', 'player_events', 'server_events', 'server_samples', 'server_state']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  }
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations').all(), migrations);
  r = new Repository(db, config);
  assert.equal(r.status().online, null); assert.equal(r.stats().totalChecks, 0);
  assert.deepEqual(r.mods().mods, []);
  r.record(state(70));
  assert.equal(r.players()[0].deaths, 0); assert.equal(r.players()[0].trackedKillGain, 0);
  assert.equal(applyServerWipe(db, 'wipe-1'), false);
  assert.equal(applyServerWipe(db, null), false);
  assert.equal(applyServerWipe(db, ''), false);
  assert.equal(applyServerWipe(db, 'wipe-1'), false);
  assert.equal(r.stats().totalChecks, 1); assert.equal(r.players().length, 1);
  assert.equal(applyServerWipe(db, 'wipe-2'), true);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('failed wipe rolls back both data deletion and wipe ID', t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  migrate(db); applyServerWipe(db, 'wipe-1');
  const r = new Repository(db, config); r.record(state(100));
  db.exec("CREATE TRIGGER prevent_reset BEFORE DELETE ON server_samples BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  assert.throws(() => applyServerWipe(db, 'wipe-2'), /test failure/);
  assert.equal(r.players().length, 1); assert.equal(r.events(200).length, 2);
  assert.equal(r.stats().totalChecks, 1);
  assert.equal(db.prepare("SELECT value FROM monitor_metadata WHERE key='server_wipe_id'").get().value, 'wipe-1');
  db.exec('DROP TRIGGER prevent_reset');
  assert.equal(applyServerWipe(db, 'wipe-2'), true);
});
