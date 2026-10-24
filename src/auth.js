const { GameClock } = require('./game-clock');
const { randomBytes, createHash } = require('node:crypto');
const ENDPOINT = 'https://steamcommunity.com/openid/login';
const NS = 'http://specs.openid.net/auth/2.0';
const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('hex');
const SESSION_SECONDS = 30 * 24 * 3600;
function cookie(req, name) {
  const values = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : '';
}
function createAuth(db, { publicOrigin, adminSteamIds = [] }, fetchSteam = fetch, profiles = null) {
  const admins = new Set(adminSteamIds);
  const secure = publicOrigin.startsWith('https:');
  const sessionName = secure ? '__Host-zm_session' : 'zm_session';
  const attemptName = secure ? '__Host-zm_login' : 'zm_login';
  const setCookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  function cleanup() {
    const now = Date.now();
    for (const table of ['auth_sessions', 'auth_attempts', 'auth_nonces']) db.prepare(`DELETE FROM ${table} WHERE expires_at<=?`).run(now);
  }
  function currentUser(req) {
    const value = cookie(req, sessionName);
    if (!/^[a-f0-9]{64}$/.test(value)) return null;
    const row = db.prepare(`SELECT u.id, u.steam_id AS steamId, u.display_name AS displayName, u.avatar_url AS avatarUrl, u.created_at AS createdAt, u.last_login_at AS lastLoginAt
      FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`).get(hash(value), Date.now());
    return row ? { ...row, isAdmin: admins.has(row.steamId), profileUrl: `https://steamcommunity.com/profiles/${row.steamId}` } : null;
  }
  function redirect(res, location) { res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' }); res.end(); }
  async function handle(req, res, url, json) {
    if (url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/')) {
      const user = currentUser(req);
      if (!user) { json(res,401,{ error:'Authentication required' }); return true; }
      if (!user.isAdmin) { json(res,403,{ error:'Administrator access required' }); return true; }
      if (url.pathname !== '/api/admin/settings') { json(res,404,{ error:'Not found' }); return true; }
      if (req.method === 'PUT') {
        if (req.headers.origin !== publicOrigin) { json(res,403,{error:'Invalid origin'}); return true; }
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { json(res,415,{error:'JSON required'}); return true; }
        const chunks=[]; let size=0;
        for await (const chunk of req) { size+=chunk.length; if(size>4096) { json(res,413,{error:'Request too large'}); return true; } chunks.push(Buffer.from(chunk)); }
        let data;
        try { data=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json(res,400,{error:'Invalid JSON'}); return true; }
        if (!currentUser(req)?.isAdmin) { json(res,403,{error:'Administrator access required'}); return true; }
        if (!data || typeof data !== 'object' || Array.isArray(data)) { json(res,400,{error:'Invalid settings'}); return true; }
        try { const gameClock=new GameClock(db).configure(data.dayMinutes,data.time,user.id); json(res,200,{settings:{gameClock}}); }
        catch(error) { if (!(error instanceof RangeError)) throw error; json(res,400,{error:error.message}); }
        return true;
      }
      if (req.method !== 'GET') { res.setHeader('Allow','GET, PUT'); json(res,405,{ error:'Method not allowed' }); return true; }
      json(res,200,{ settings:{gameClock:new GameClock(db).read()} }); return true;
    }
    if (!['/auth/steam', '/auth/steam/callback', '/auth/logout', '/api/me', '/api/account'].includes(url.pathname)) return false;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const method = url.pathname === '/auth/logout' ? 'POST' : 'GET';
    if (req.method !== method) { res.setHeader('Allow', method); json(res, 405, { error: 'Method not allowed' }); return true; }
    if (url.pathname === '/api/me' || url.pathname === '/api/account') {
      let user = currentUser(req);
      if (user && profiles) { await profiles.refresh([user.id]); user = currentUser(req); }
      json(res, url.pathname === '/api/account' && !user ? 401 : 200, user ? { user } : url.pathname === '/api/me' ? { user: null } : { error: 'Authentication required' });
      return true;
    }
    if (url.pathname === '/auth/logout') {
      if (req.headers.origin !== publicOrigin) { json(res, 403, { error: 'Invalid origin' }); return true; }
      db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash(cookie(req, sessionName)));
      res.setHeader('Set-Cookie', setCookie(sessionName, '', 0)); json(res, 200, { user: null }); return true;
    }
    cleanup();
    if (url.pathname === '/auth/steam') {
      const state = token();
      const old = cookie(req, attemptName);
      db.prepare('DELETE FROM auth_attempts WHERE token_hash=?').run(hash(old));
      db.prepare('INSERT INTO auth_attempts VALUES (?,?)').run(hash(state), Date.now() + 10 * 60 * 1000);
      res.setHeader('Set-Cookie', setCookie(attemptName, state, 600));
      const login = new URL(ENDPOINT);
      for (const [key, value] of Object.entries({ ns: NS, mode: 'checkid_setup', realm: `${publicOrigin}/`, return_to: `${publicOrigin}/auth/steam/callback?state=${state}`, identity: `${NS}/identifier_select`, claimed_id: `${NS}/identifier_select` })) login.searchParams.set(`openid.${key}`, value);
      redirect(res, login.href); return true;
    }
    const state = url.searchParams.get('state');
    const attempt = cookie(req, attemptName);
    res.setHeader('Set-Cookie', setCookie(attemptName, '', 0));
    const validAttempt = /^[a-f0-9]{64}$/.test(state || '') && state === attempt &&
      db.prepare('DELETE FROM auth_attempts WHERE token_hash=? AND expires_at>? RETURNING token_hash').get(hash(state), Date.now());
    if (!validAttempt) { redirect(res, '/?auth=failed'); return true; }
    if (url.searchParams.get('openid.mode') === 'cancel') { redirect(res, '/?auth=cancelled'); return true; }
    const p = url.searchParams;
    const identity = p.get('openid.claimed_id') || '';
    const match = identity.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/);
    const nonce = p.get('openid.response_nonce') || '';
    const nonceTime = Date.parse(nonce.slice(0, 20));
    const signed = new Set((p.get('openid.signed') || '').split(','));
    const duplicate = [...new Set(p.keys())].some(key => p.getAll(key).length !== 1);
    if (duplicate || !match || p.get('openid.identity') !== identity || p.get('openid.ns') !== NS || p.get('openid.mode') !== 'id_res' ||
        p.get('openid.op_endpoint') !== ENDPOINT || p.get('openid.return_to') !== `${publicOrigin}/auth/steam/callback?state=${state}` ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z.+$/.test(nonce) || !Number.isFinite(nonceTime) || Math.abs(Date.now() - nonceTime) > 600000 ||
        !['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'].every(key => signed.has(key)) ||
        db.prepare('SELECT 1 FROM auth_nonces WHERE nonce=?').get(nonce)) {
      redirect(res, '/?auth=failed'); return true;
    }
    const body = new URLSearchParams([...p].filter(([key]) => key.startsWith('openid.')));
    body.set('openid.mode', 'check_authentication');
    let verified = false;
    try {
      const response = await fetchSteam(ENDPOINT, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(10000) });
      verified = response.ok && /^is_valid:true\r?$/m.test(await response.text());
    } catch { /* Steam outages must not authenticate users. */ }
    if (!verified) { redirect(res, '/?auth=failed'); return true; }
    const session = token(), now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      // A second concurrent verification must not reuse the same assertion.
      db.prepare('INSERT INTO auth_nonces VALUES (?,?)').run(nonce, Date.now() + 600000);
      const user = db.prepare(`INSERT INTO users(steam_id,created_at,last_login_at) VALUES (?,?,?)
        ON CONFLICT(steam_id) DO UPDATE SET last_login_at=excluded.last_login_at RETURNING id`).get(match[1], now, now);
      db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash(cookie(req, sessionName)));
      db.prepare('INSERT INTO auth_sessions VALUES (?,?,?)').run(hash(session), user.id, Date.now() + SESSION_SECONDS * 1000);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    if (profiles) {
      const user = db.prepare('SELECT id FROM users WHERE steam_id=?').get(match[1]);
      await profiles.refresh([user.id], true);
    }
    res.setHeader('Set-Cookie', [setCookie(attemptName, '', 0), setCookie(sessionName, session, SESSION_SECONDS)]);
    redirect(res, '/#monitoring'); return true;
  }
  return { handle, currentUser };
}
module.exports = { createAuth };
