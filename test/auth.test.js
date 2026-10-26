const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrate, applyServerWipe } = require('../src/db');
const { createAuth } = require('../src/auth');
const { createServer } = require('../src/http');
const origin = 'https://helper.example';
async function setup(t, valid = true) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); migrate(db); migrate(db);
  let calls = 0;
  const auth = createAuth(db, { publicOrigin: origin }, async (url, options) => {
    calls++; assert.equal(url, 'https://steamcommunity.com/openid/login');
    assert.equal(options.body.get('openid.mode'), 'check_authentication');
    return { ok: true, text: async () => `ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n` };
  });
  const server = createServer({}, {}, auth);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options });
  async function begin() {
    const response = await request('/auth/steam'); assert.equal(response.status, 303);
    const login = new URL(response.headers.get('location'));
    assert.equal(login.origin, 'https://steamcommunity.com');
    assert.equal(login.searchParams.get('openid.realm'), origin + '/');
    return { cookie: response.headers.get('set-cookie').split(';')[0], returnTo: login.searchParams.get('openid.return_to') };
  }
  function callback(attempt, changes = {}) {
    const url = new URL(attempt.returnTo);
    const identity = 'https://steamcommunity.com/openid/id/76561198000000001';
    for (const [key, value] of Object.entries({ ns: 'http://specs.openid.net/auth/2.0', mode: 'id_res', op_endpoint: 'https://steamcommunity.com/openid/login', claimed_id: identity, identity, return_to: attempt.returnTo, response_nonce: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') + Math.random(), assoc_handle: 'handle', signed: 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle', sig: 'signature', ...changes })) url.searchParams.set('openid.' + key, value);
    return url.pathname + url.search;
  }
  return { db, request, begin, callback, calls: () => calls };
}
test('Steam login creates persistent user, rotates session, protects account and logout; wipe preserves users', async t => {
  const s = await setup(t);
  assert.deepEqual(await (await s.request('/api/me')).json(), { user: null });
  assert.equal((await s.request('/api/account')).status, 401);
  const attempt = await s.begin(), path = s.callback(attempt);
  const response = await s.request(path, { headers: { cookie: attempt.cookie } });
  assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/#monitoring');
  const cookies = response.headers.getSetCookie();
  const session = cookies.find(v => v.startsWith('__Host-zm_session='));
  assert.match(session, /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  const cookie = session.split(';')[0];
  const user = (await (await s.request('/api/account', { headers: { cookie } })).json()).user;
  assert.equal(user.steamId, '76561198000000001');
  assert.equal(s.db.prepare('SELECT token_hash FROM auth_sessions').get().token_hash.includes(cookie.split('=')[1]), false);
  assert.equal((await s.request(path, { headers: { cookie: attempt.cookie } })).headers.get('location'), '/?auth=failed');
  assert.equal(s.calls(), 1);
  applyServerWipe(s.db, 'wipe-auth-test');
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  const again = await s.begin();
  const next = await s.request(s.callback(again), { headers: { cookie: again.cookie + '; ' + cookie } });
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  assert.equal((await (await s.request('/api/me', { headers: { cookie } })).json()).user, null);
  const nextCookie = next.headers.getSetCookie().find(v => v.startsWith('__Host-zm_session=')).split(';')[0];
  assert.equal((await s.request('/auth/logout')).status, 405);
  assert.equal((await s.request('/auth/logout', { method: 'POST', headers: { cookie: nextCookie, origin: 'https://evil.example' } })).status, 403);
  assert.equal((await s.request('/auth/logout', { method: 'POST', headers: { cookie: nextCookie, origin } })).status, 200);
  assert.equal((await s.request('/api/account', { headers: { cookie: nextCookie } })).status, 401);
});
test('invalid provider verification never creates a user', async t => {
  const s = await setup(t, false), attempt = await s.begin();
  assert.equal((await s.request(s.callback(attempt), { headers: { cookie: attempt.cookie } })).headers.get('location'), '/?auth=failed');
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});
test('rejects missing state cookie, unsigned identity, bad return URL, stale nonce and duplicate parameters before verification', async t => {
  const s = await setup(t);
  for (const changes of [{ signed: 'op_endpoint' }, { return_to: 'https://evil.example/' }, { response_nonce: '2020-01-01T00:00:00Zold' }, { identity: 'https://steamcommunity.com/openid/id/76561198000000002' }, { op_endpoint: 'https://evil.example/' }]) {
    const attempt = await s.begin();
    assert.equal((await s.request(s.callback(attempt, changes), { headers: { cookie: attempt.cookie } })).headers.get('location'), '/?auth=failed');
  }
  const attempt = await s.begin();
  assert.equal((await s.request(s.callback(attempt))).headers.get('location'), '/?auth=failed');
  assert.equal((await s.request(s.callback(attempt) + '&openid.mode=id_res', { headers: { cookie: attempt.cookie } })).headers.get('location'), '/?auth=failed');
  assert.equal(s.calls(), 0);
});
test('cancelled and expired attempts do not authenticate; expired sessions are rejected', async t => {
  const s = await setup(t), attempt = await s.begin();
  assert.equal((await s.request(s.callback(attempt, { mode: 'cancel' }), { headers: { cookie: attempt.cookie } })).headers.get('location'), '/?auth=cancelled');
  const expired = await s.begin(); s.db.exec('UPDATE auth_attempts SET expires_at=0');
  assert.equal((await s.request(s.callback(expired), { headers: { cookie: expired.cookie } })).headers.get('location'), '/?auth=failed');
  const fresh = await s.begin(), response = await s.request(s.callback(fresh), { headers: { cookie: fresh.cookie } });
  const cookie = response.headers.getSetCookie().find(v => v.startsWith('__Host-zm_session=')).split(';')[0];
  s.db.exec('UPDATE auth_sessions SET expires_at=0');
  assert.equal((await s.request('/api/account', { headers: { cookie } })).status, 401);
});
test('accounts are isolated and an already used Steam nonce cannot authenticate another attempt', async t => {
  const s = await setup(t);
  const first = await s.begin(), firstPath = s.callback(first);
  const firstResponse = await s.request(firstPath, { headers: { cookie: first.cookie } });
  const firstCookie = firstResponse.headers.getSetCookie().find(v => v.startsWith('__Host-zm_session=')).split(';')[0];
  const replay = await s.begin();
  const nonce = new URL(firstPath, origin).searchParams.get('openid.response_nonce');
  assert.equal((await s.request(s.callback(replay, { response_nonce: nonce }), { headers: { cookie: replay.cookie } })).headers.get('location'), '/?auth=failed');
  assert.equal(s.calls(), 1);
  const second = await s.begin(), identity = 'https://steamcommunity.com/openid/id/76561198000000002';
  const secondResponse = await s.request(s.callback(second, { identity, claimed_id: identity }), { headers: { cookie: second.cookie } });
  const secondCookie = secondResponse.headers.getSetCookie().find(v => v.startsWith('__Host-zm_session=')).split(';')[0];
  const a = (await (await s.request('/api/account', { headers: { cookie: firstCookie } })).json()).user;
  const b = (await (await s.request('/api/account', { headers: { cookie: secondCookie } })).json()).user;
  assert.notEqual(a.id, b.id); assert.equal(b.steamId, '76561198000000002');
  await s.request('/auth/logout', { method: 'POST', headers: { cookie: firstCookie, origin } });
  assert.equal((await s.request('/api/account', { headers: { cookie: secondCookie } })).status, 200);
});
