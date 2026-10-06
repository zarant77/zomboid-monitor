const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {migrate,applyServerWipe}=require('../src/db');
const {Repository}=require('../src/repository');
const config={host:'test',gamePort:16261,interval:5000};
const base=Date.parse('2026-10-06T00:00:00Z'),hour=3600000;
function setup(t){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');migrate(db);t.after(()=>db.close());return new Repository(db,config);}
function record(r,kills,h){r.record({online:true,ping:10,players:1,maxPlayers:30,playerList:[{name:'Ryder',kills,sessionSeconds:h*3600}]},new Date(base+h*hour).toISOString());}
function gain(r,h){return r.players(false,base+h*hour)[0].killGain24h;}
test('24h gain excludes initial kills and rolls forward while offline',t=>{
  const r=setup(t);record(r,3000,0);record(r,4000,1);record(r,4100,2);
  assert.equal(gain(r,0),0);assert.equal(gain(r,1),1000);assert.equal(gain(r,2),1100);
  r.record({online:false,error:'timeout'},new Date(base+3*hour).toISOString());
  assert.equal(gain(r,24.5),1100);
  assert.equal(gain(r,25),100);assert.equal(gain(r,26),0);
  assert.equal(r.player(r.players()[0].id,base+25*hour).killGain24h,100);
});
test('deaths and journal restores use signed changes and survive restarting',t=>{
  let r=setup(t);record(r,3000,0);record(r,4000,1);record(r,0,2);record(r,2800,3);
  assert.equal(gain(r,1),1000);assert.equal(gain(r,2),0);assert.equal(gain(r,3),0);
  r=new Repository(r.db,config);record(r,3200,4);assert.equal(gain(r,4),200);
  record(r,3200,4);assert.equal(gain(r,4),200);
  assert.equal(r.db.prepare('SELECT COUNT(*) AS n FROM player_kill_changes').get().n,4);
  r.record({online:false,error:'timeout'},new Date(base+5*hour).toISOString());
  record(r,3300,6);assert.equal(gain(r,6),300);
  applyServerWipe(r.db,'wipe-daily');
  assert.equal(r.db.prepare('SELECT COUNT(*) AS n FROM player_kill_changes').get().n,0);
});
test('pruning drops expired changes and keeps rolling results',t=>{
  const r=setup(t);record(r,100,0);record(r,110,1);record(r,120,2);record(r,130,50);
  assert.equal(r.db.prepare('SELECT COUNT(*) AS n FROM player_kill_changes').get().n,1);
  assert.equal(gain(r,50),10);
});

test('calendar-day gain resets at midnight GMT+1 for online and offline players',t=>{
  const r=setup(t);record(r,3000,0);record(r,4000,1);record(r,4100,22.999);
  assert.equal(r.players(false,base+22.999*hour)[0].killGainToday,1100);
  assert.equal(r.players(false,base+23*hour)[0].killGainToday,0);
  record(r,4200,23);
  assert.equal(r.players(false,base+23*hour)[0].killGainToday,100);
  const id=r.players()[0].id;
  assert.equal(r.player(id,base+23*hour).killGainToday,100);
  r.record({online:false,error:'timeout'},new Date(base+24*hour).toISOString());
  assert.equal(r.players(false,base+46.999*hour)[0].killGainToday,100);
  assert.equal(r.players(false,base+47*hour)[0].killGainToday,0);
});
