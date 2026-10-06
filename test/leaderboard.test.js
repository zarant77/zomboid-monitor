const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={ZM:{},Intl};
vm.runInNewContext(fs.readFileSync('public/js/players.js','utf8'),context);
const sort=context.ZM.sortLeaderboard;
const players=[
  {id:1,name:'Beta',currentKills:100,deaths:2,online:false,lastSeen:'2026-10-06T12:00:00Z',firstSeen:'2026-10-01T00:00:00Z',longestSessionSeconds:90,trackedKillGain:5},
  {id:2,name:'Alpha',currentKills:200,deaths:1,online:true,lastSeen:'2026-10-06T11:00:00Z',firstSeen:'2026-10-02T00:00:00Z',longestSessionSeconds:60,trackedKillGain:10},
  {id:3,name:'Gamma',currentKills:50,deaths:3,online:false,lastSeen:'2026-10-06T13:00:00Z',firstSeen:'2026-10-03T00:00:00Z',longestSessionSeconds:120,trackedKillGain:0}
];
const ids=(key,direction)=>Array.from(sort(players,key,direction,'en'),p=>p.id);
test('leaderboard sorts each column by underlying values in both directions',()=>{
  const ascending={rank:[2,1,3],name:[2,1,3],currentKills:[3,1,2],deaths:[2,1,3],online:[1,3,2],lastSeen:[1,3,2],firstSeen:[1,2,3],longestSessionSeconds:[2,1,3],trackedKillGain:[3,1,2]};
  for(const [key,expected] of Object.entries(ascending)){
    assert.deepEqual(ids(key,'asc'),expected,key);
    // Equal statuses use a stable alphabetical tie-break in both directions.
    assert.deepEqual(ids(key,'desc'),key==='online'?[2,1,3]:expected.slice().reverse(),key);
  }
  assert.deepEqual(players.map(p=>p.id),[1,2,3]);
});
test('missing metrics stay last and ties are deterministic',()=>{
  const list=[{id:1,name:'Zed',deaths:2},{id:2,name:'Amy',deaths:2},{id:3,name:'Unknown'}];
  for(const direction of ['asc','desc'])assert.deepEqual(Array.from(sort(list,'deaths',direction,'en'),p=>p.id),[2,1,3]);
});
