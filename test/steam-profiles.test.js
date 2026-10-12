const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../src/db');
const { createSteamProfiles, safeAvatar } = require('../src/steam-profiles');
const avatar = 'https://avatars.steamstatic.com/' + 'a'.repeat(40) + '_medium.jpg';
function setup(t) {
  const db = new DatabaseSync(':memory:'); migrate(db); migrate(db); t.after(() => db.close());
  for (let id=1;id<=2;id++) db.prepare('INSERT INTO users(id,steam_id,created_at,last_login_at) VALUES (?,?,?,?)').run(id, '7656119800000000'+id, 'now', 'now');
  return db;
}
test('fetches batched profiles, caches them, deduplicates concurrent refreshes and updates renamed users', async t => {
  const db=setup(t); let calls=0, name='Survivor';
  const service=createSteamProfiles(db,{steamApiKey:'test-key'},async url=>{
    calls++; assert.equal(url.origin,'https://api.steampowered.com'); assert.equal(url.searchParams.get('key'),'test-key');
    return {ok:true,json:async()=>({response:{players:url.searchParams.get('steamids').split(',').map(steamid=>({steamid,personaname:name,avatarmedium:avatar}))}})};
  });
  await Promise.all([service.refresh([1,2]),service.refresh([1,2])]);
  assert.equal(calls,1); assert.equal(db.prepare('SELECT display_name,avatar_url FROM users WHERE id=1').get().display_name,'Survivor');
  await service.refresh([1]); assert.equal(calls,1);
  name='New name'; await service.refresh([1],true); assert.equal(calls,2);
  assert.equal(db.prepare('SELECT display_name FROM users WHERE id=1').get().display_name,'New name');
});
test('missing key and provider failures keep login-independent cached profiles and back off retries', async t => {
  const db=setup(t); let calls=0;
  db.prepare('UPDATE users SET display_name=?,avatar_url=? WHERE id=1').run('Cached name',avatar);
  await createSteamProfiles(db,{},async()=>{throw new Error('should not fetch');}).refresh([1]);
  const service=createSteamProfiles(db,{steamApiKey:'test-key'},async()=>{calls++;throw new Error('offline');});
  await service.refresh([1]); await service.refresh([1]); assert.equal(calls,1);
  const row=db.prepare('SELECT display_name,avatar_url FROM users WHERE id=1').get(); assert.equal(row.display_name,'Cached name'); assert.equal(row.avatar_url,avatar);
  db.exec('UPDATE users SET profile_checked_at=0'); await service.refresh([1]); assert.equal(calls,2);
});
test('matches returned Steam IDs and refuses unsafe avatar URLs', async t=>{
  const db=setup(t);
  const service=createSteamProfiles(db,{steamApiKey:'test-key'},async()=>({ok:true,json:async()=>({response:{players:[{steamid:'76561198000000002',personaname:'Other account',avatarmedium:'https://evil.example/avatar.jpg'},{steamid:'76561198000000001',personaname:'<b>Name</b>\u0000',avatarmedium:avatar}]}})}));
  await service.refresh([1]); assert.equal(db.prepare('SELECT display_name FROM users WHERE id=2').get().display_name,null);
  assert.equal(db.prepare('SELECT display_name FROM users WHERE id=1').get().display_name,'<b>Name</b>');
  assert.equal(safeAvatar(avatar),avatar);
  for(const url of ['http://avatars.steamstatic.com/'+'a'.repeat(40)+'.jpg','https://evil.example/avatar.jpg','https://avatars.steamstatic.com.evil.example/avatar.jpg','javascript:alert(1)','https://avatars.steamstatic.com/x.svg']) assert.equal(safeAvatar(url),null);
});
