const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {migrate,applyServerWipe}=require('../src/db');
const {Repository}=require('../src/repository');
const {GameClock}=require('../src/game-clock');
function setup(t){const db=new DatabaseSync(':memory:');migrate(db);t.after(()=>db.close());return {db,clock:new GameClock(db)};}
const at=seconds=>new Date(Date.UTC(2026,9,24)+seconds*1000).toISOString();
test('successful checks confirm liveness without resetting accumulated time',t=>{
  const {db,clock}=setup(t);
  clock.configure(90,'12:00',null,Date.parse(at(0)));
  clock.observe(at(7),7,true,true);
  clock.observe(at(19),12,true,true);
  clock.observe(at(60),41,true,false);
  assert.equal(db.prepare('SELECT game_minutes FROM game_clock').get().game_minutes,736);
  clock.observe(at(600),540,false,false);
  clock.observe(at(900),300,false,true);
  assert.equal(clock.read().time,'12:16');
  clock.observe(at(960),60,true,true);
  assert.equal(clock.read().time,'12:32');
});
test('clock starts unconfigured and advances using real elapsed time with midnight wrap',t=>{
  const {clock}=setup(t);assert.equal(clock.read().time,null);assert.equal(clock.read().dayMinutes,90);
  clock.configure(90,'23:59',null,Date.parse(at(0)));
  clock.observe(at(5),5,true,true);assert.equal(clock.read().time,'00:00');
  clock.observe(at(90*60),90*60-5,true,true);assert.equal(clock.read().time,'23:59');
});
test('offline checks freeze clock; first observation after restart establishes a new baseline',t=>{
  const {db,clock}=setup(t),config={host:'test',gamePort:16261,interval:5000};
  clock.configure(90,'12:00',null,Date.parse(at(0)));
  let repo=new Repository(db,config);
  const online=require('../src/utils').normalize({name:'test',ping:20,numplayers:0,maxplayers:32,raw:{players:[],rules:{}}},config);
  repo.record(online,at(0));repo.record(online,at(5));assert.equal(clock.read().time,'12:01');
  repo.record({online:false,error:'offline'},at(10));repo.record({online:false,error:'offline'},at(900));
  repo.record(online,at(1000));assert.equal(clock.read().time,'12:02');
  repo=new Repository(db,config);repo.record(online,at(5000));assert.equal(clock.read().time,'12:02');
  repo.record(online,at(5005));assert.equal(clock.read().time,'12:04');
});
test('resynchronization excludes elapsed time before the admin saved the new time',t=>{
  const {clock}=setup(t);
  clock.configure(90,'18:00',null,Date.parse(at(3)));
  clock.observe(at(5),5,true,true);assert.equal(clock.read().time,'18:00');
  clock.observe(at(10),5,true,true);assert.equal(clock.read().time,'18:01');
  for(const [day,time] of [[0,'12:00'],[Infinity,'12:00'],[90,'24:00'],[90,'7:00'],['90','12:00']]) assert.throws(()=>clock.configure(day,time,null),RangeError);
});
test('20:50 survives server downtime and a database reopen, then resumes automatically',t=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'zomboid-clock-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const filename=path.join(folder,'clock.db'),config={host:'test',gamePort:16261,interval:5000};
  let db=new DatabaseSync(filename);migrate(db);
  new GameClock(db).configure(90,'20:50',null,Date.parse(at(0)));
  let repo=new Repository(db,config);
  const online=require('../src/utils').normalize({name:'test',ping:20,numplayers:0,maxplayers:32,raw:{players:[],rules:{}}},config);
  repo.record(online,at(0));repo.record({online:false,error:'offline'},at(5));
  assert.equal(repo.gameClock.read().time,'20:51');db.close();
  db=new DatabaseSync(filename);t.after(()=>db.close());migrate(db);repo=new Repository(db,config);
  repo.record({online:false,error:'offline'},at(1000));
  repo.record(online,at(2000));assert.equal(repo.gameClock.read().time,'20:51');
  repo.record(online,at(2005));assert.equal(repo.gameClock.read().time,'20:52');
  repo.record(online,at(2010));assert.equal(repo.gameClock.read().time,'20:54');
});
