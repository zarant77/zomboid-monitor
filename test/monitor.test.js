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
  assert.equal(r.events(200).filter(e => e.source==='player').length,4);
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
test('tracked gain is net change from baseline, keeps maximum and session metrics', t => {
  const r=setup(t);
  const start='2026-10-03T00:00:';
  for(const [i,kills] of [100,120,150,5,25].entries())r.record(state(kills,20+i*10),`${start}${String(i*5).padStart(2,'0')}.000Z`);
  const p=r.players()[0];assert.equal(p.trackedKillGain,0);assert.equal(p.maxKills,150);
  assert.equal(p.currentKills,25);assert.equal(p.longestSessionSeconds,60);assert.equal(p.joinCount,1);
  r.record({online:false,error:'timeout'},'2026-10-03T00:01:00.000Z');
  r.record(state(30,10),'2026-10-03T00:01:10.000Z');
  const detail=r.player(p.id);assert.equal(detail.joinCount,2);assert.equal(detail.longestSessionSeconds,60);
  assert.equal(detail.trackedKillGain,0);assert.equal(detail.joinedAt,'2026-10-03T00:01:10.000Z');
  assert.equal(detail.events.length,4);
});
test('new migration preserves old records and backfills only known session data', t => {
  const fs=require('node:fs'),path=require('node:path');
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
  for(const name of ['001_initial.sql','002_indexes.sql']){
    db.exec(fs.readFileSync(path.join(__dirname,'../migrations',name),'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(name,'2026-10-01T00:00:00.000Z');
  }
  db.prepare('INSERT INTO players(name,first_seen,last_seen,current_kills,max_kills,current_session_seconds,last_session_seconds) VALUES(?,?,?,?,?,?,?)').run('Legacy', '2026-10-01T00:00:00.000Z','2026-10-01T01:00:00.000Z',3000,4000,100,200);
  db.prepare('INSERT INTO player_events(player_id,event_type,created_at,kills,session_seconds) VALUES(1,?,?,?,?)').run('join','2026-10-01T00:00:00.000Z',3000,10);
  db.prepare('INSERT INTO player_events(player_id,event_type,created_at,kills,session_seconds) VALUES(1,?,?,?,?)').run('leave','2026-10-01T01:00:00.000Z',4000,3600);
  migrate(db);migrate(db);const p=new Repository(db,config).players()[0];
  assert.equal(p.deaths,0);assert.equal(p.name,'Legacy');assert.equal(p.maxKills,4000);assert.equal(p.currentKills,3000);
  assert.equal(p.longestSessionSeconds,3600);assert.equal(p.joinCount,1);assert.equal(p.trackedKillGain,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM player_events').get().n,2);
});
test('history downsampling is bounded and weighted, zero players and failures are distinct', t => {
  const r=setup(t),now=Date.parse('2026-10-03T01:00:00.000Z');
  assert.deepEqual(r.history('24h',now).samples,[]);
  const s=normalize({raw:{players:[]},numplayers:0,maxplayers:30,ping:60},config);
  r.record(s,'2026-10-03T00:00:00.000Z');
  r.record({...s,ping:120,players:4},'2026-10-03T00:01:00.000Z');
  r.record({online:false,error:'offline'},'2026-10-03T00:02:00.000Z');
  const h=r.history('24h',now);assert.equal(h.samples.length,1);assert.equal(h.samples[0].avgPlayers,2);
  assert.equal(h.samples[0].avgPing,90);assert.equal(h.summary.totalChecks,3);assert.equal(h.summary.failedChecks,1);
  assert.equal(h.summary.peakPlayers,4);
  for(let i=0;i<500;i++)r.record(s,new Date(now-30*86400000+i*60*60000).toISOString());
  assert.ok(r.history('30d',now).samples.length<=181);assert.ok(r.history('7d',now).samples.length<=169);
  assert.throws(()=>r.history('1y',now),RangeError);
});
test('long names and HTML characters are retained as data', t => {
  const r=setup(t),name='<img src=x onerror=alert(1)> & "very long player name"';
  const s=normalize({ping:80,numplayers:1,raw:{players:[{name,score:3001,time:5}]}},config);
  r.record(s);assert.equal(r.players()[0].name,name);assert.equal(r.player(r.players()[0].id).name,name);
});

test('death and journal restoration use latest kills and do not inflate net gain', t => {
  const r=setup(t);
  for(const [i,kills] of [3400,3500,0,3000,3100,3500,3510].entries()){
    r.record(state(kills),new Date(Date.UTC(2026,9,4,0,0,i*5)).toISOString());
    assert.equal(r.players()[0].currentKills,kills);
    assert.equal(r.players()[0].trackedKillGain,Math.max(0,kills-3400));
  }
  r.record(state(3000));
  const other=state(3200);other.playerList[0].name='Other';r.record(other);
  assert.deepEqual(r.players().map(p=>p.name),['Other','Ryder']);
  assert.equal(r.player(r.players()[1].id).maxKills,3510);
  const restarted=new Repository(r.db,config);restarted.record(state(3100));
  assert.equal(restarted.players().find(p=>p.name==='Ryder').trackedKillGain,0);
});
test('gain correction migration preserves history and resets only unreliable gain once',t=>{
  const r=setup(t);r.record(state(3000));
  r.db.exec("UPDATE players SET tracked_kill_gain=9000,max_kills=3500; ALTER TABLE players DROP COLUMN kill_gain_baseline; DELETE FROM schema_migrations WHERE name='004_kill_gain_baseline.sql'");
  migrate(r.db);const p=r.players()[0];assert.equal(p.trackedKillGain,0);assert.equal(p.maxKills,3500);assert.equal(r.player(p.id).events.length,1);
  r.record(state(3010));migrate(r.db);assert.equal(r.players()[0].trackedKillGain,10);
});

 test('deaths count each decrease once, survive restarts and appear in events', t => {
  let r=setup(t);
  for (const [i,kills] of [1000,0,0,700,710,497].entries()) {
    r.record(state(kills),new Date(Date.UTC(2026,9,6,0,0,i*5)).toISOString());
  }
  const p=r.players()[0];
  assert.equal(p.deaths,2);
  assert.equal(r.player(p.id).events.filter(e=>e.eventType==='death').length,2);
  const deaths=r.events(200).filter(e=>e.eventType==='death');
  assert.equal(deaths.length,2);assert.equal(deaths[0].player,'Ryder');
  assert.equal(deaths[0].kills,497);assert.equal(deaths[0].message,'Ryder died');
  r=new Repository(r.db,config);r.record(state(497));assert.equal(r.players()[0].deaths,2);
  r.record({online:false,error:'timeout'});r.record(state(10));
  assert.equal(r.players()[0].deaths,3);
  assert.equal(r.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('session kill records preserve peaks across deaths, restores and monitor restarts', t => {
  let r=setup(t);
  for(const [i,kills] of [1000,1100,0,770,1100,1120].entries()) {
    r.record(state(kills,20+i*5),new Date(Date.UTC(2026,9,6,0,0,i*5)).toISOString());
  }
  assert.equal(r.players()[0].bestSessionKills,120);
  r=new Repository(r.db,config);r.record(state(1130,55));
  assert.equal(r.player(r.players()[0].id).bestSessionKills,130);
  r.record({online:false,error:'timeout'});r.record(state(1130,10));r.record(state(1140,15));
  assert.equal(r.players()[0].bestSessionKills,130);
  r.record(state(1140,5));r.record(state(1340,10));
  assert.equal(r.players()[0].bestSessionKills,200);
});
