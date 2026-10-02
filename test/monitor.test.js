const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../src/db');
const { Repository } = require('../src/repository');
const { normalize } = require('../src/utils');
const { Monitor } = require('../src/monitor');
const config = { host: 'test', gamePort: 16261, interval: 10 };
function setup(t) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); migrate(db); migrate(db);
  t.after(() => db.close()); return new Repository(db, config);
}
const state = (kills, time = 20) => normalize({ name: 'Test', ping: 60, numplayers: 1, maxplayers: 30,
  raw: { players: [{ name: 'Ryder', score: kills, time }], rules: { version: '42.21', modCount: '43', mods: 'a;b' } } }, config);
test('player reset, leaves, rejoins, state transitions, counters and minute aggregation', t => {
  const r = setup(t);
  r.record(state(522), '2026-10-02T10:00:00.000Z');
  r.record(state(2,30), '2026-10-02T10:00:05.000Z');
  assert.equal(r.players()[0].maxKills,522); assert.equal(r.players()[0].currentKills,2);
  r.record({ online:false,error:'timeout' }, '2026-10-02T10:00:10.000Z');
  r.record({ online:false,error:'timeout' }, '2026-10-02T10:00:15.000Z');
  assert.equal(r.players()[0].lastSessionSeconds,30); assert.equal(r.players(true).length,0);
  r.record(state(3), '2026-10-02T10:01:00.000Z');
  assert.equal(r.events(200).filter(e => e.source==='server').length,3);
  assert.equal(r.events(200).filter(e => e.source==='player').length,3);
  assert.equal(r.stats().availability,60); assert.equal(r.stats().downtimeSeconds,50);
  const samples = r.db.prepare('SELECT * FROM server_samples ORDER BY created_at').all();
  assert.equal(samples.length,2); assert.equal(samples[0].checks,4); assert.equal(samples[0].avg_ping,60);
  assert.deepEqual(r.mods().mods,['a','b']); assert.equal(r.mods().complete,false);
  const restarted = new Repository(r.db,config);
  assert.equal(restarted.players()[0].maxKills,522);
  assert.equal(restarted.stats().totalChecks,5);
});
test('missing player list does not generate leaves, confirmed empty list does', t => {
  const r = setup(t); r.record(state(10));
  r.record(normalize({ raw:{}, ping:80 },config)); assert.equal(r.players(true).length,1);
  r.record(normalize({ raw:{players:[]}, numplayers:0, ping:80 },config)); assert.equal(r.players(true).length,0);
});
test('description numeric ordering and rules version precedence', () => {
  const s = normalize({raw:{tags:[';modded;VERSION:wrong'],rules:{version:'42.21','description:10/10':'end','description:2/10':'<LINE>two','description:1/10':'<RGB:1,2,3>one'}}},config);
  assert.equal(s.description,'one\ntwoend'); assert.equal(s.version,'42.21'); assert.equal(s.pvp,null);
});
test('query failure is recorded and sequential loop continues', async t => {
  const r=setup(t); let active=0, max=0, calls=0;
  const m=new Monitor(r,config,async () => {
    active++; max=Math.max(max,active); calls++;
    await new Promise(resolve=>setTimeout(resolve,15)); active--;
    if(calls===1) throw new Error('test timeout'); return {raw:{players:[]},ping:10,numplayers:0};
  });
  m.start(); await new Promise(resolve=>setTimeout(resolve,90)); await m.stop();
  assert.equal(max,1); assert.ok(calls>=2); assert.equal(r.stats().failedChecks,1);
  const checks=r.stats().totalChecks; await new Promise(resolve=>setTimeout(resolve,30)); assert.equal(r.stats().totalChecks,checks);
});
test('offline leaderboard survives closing and reopening a SQLite file', t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { openDatabase } = require('../src/db');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zomboid-test-'));
  t.after(() => fs.rmSync(directory, { recursive:true, force:true }));
  const filename = path.join(directory,'history.db');
  let db = openDatabase(filename); migrate(db);
  let r = new Repository(db,config);
  r.record(state(522)); r.record({online:false,error:'timeout'}); db.close();
  db = openDatabase(filename);
  try {
    migrate(db); r = new Repository(db,config);
    assert.equal(r.players()[0].online,false); assert.equal(r.players()[0].maxKills,522);
    assert.equal(r.players(true).length,0); assert.equal(r.stats().totalChecks,2);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  } finally { db.close(); }
});
