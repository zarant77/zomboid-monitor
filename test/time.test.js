const test=require('node:test');
const assert=require('node:assert/strict');
const {createServerDayClock}=require('../src/time');
test('fixed offsets, named zones and host-independent midnight boundaries',()=>{
  const now=Date.parse('2026-10-06T12:00:00Z');
  for(const [zone,expected] of [['+01:00','2026-10-05T23:00:00.000Z'],['UTC','2026-10-06T00:00:00.000Z'],['Asia/Kolkata','2026-10-05T18:30:00.000Z'],['Europe/Berlin','2026-10-05T22:00:00.000Z']]){
    const start=createServerDayClock(zone);
    assert.equal(start(now),expected);assert.equal(start(now+1000),expected);
    assert.equal(start(Date.parse(expected)),expected);
  }
  assert.throws(()=>createServerDayClock('invalid-zone'),RangeError);
});
test('Berlin calendar days handle spring and autumn DST changes',()=>{
  const start=createServerDayClock('Europe/Berlin');
  const spring=Date.parse(start(Date.parse('2026-03-29T12:00:00Z')));
  const springNext=Date.parse(start(Date.parse('2026-03-30T12:00:00Z')));
  assert.equal((springNext-spring)/3600000,23);
  const autumn=Date.parse(start(Date.parse('2026-10-25T12:00:00Z')));
  const autumnNext=Date.parse(start(Date.parse('2026-10-26T12:00:00Z')));
  assert.equal((autumnNext-autumn)/3600000,25);
});
