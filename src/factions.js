const vanillaSkills = require('../public/js/books').skills;
const vanillaBookIds = new Set(vanillaSkills.flatMap(skill => skill.volumes.map(book => book.itemKey)));
const vanillaBookNames = new Set(vanillaSkills.map(skill => skill.name.toLowerCase()));
const { randomBytes } = require('node:crypto');
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
function text(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `Invalid ${field}`);
  return value.trim();
}
function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, 'Invalid number'); return value; }
async function readBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'JSON required');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) fail(413, 'Request too large'); chunks.push(Buffer.from(chunk)); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { fail(400, 'Invalid JSON'); }
}
function createFactions(db, auth, { publicOrigin }, profiles = null) {
  function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } }
  function membership(factionId, userId, owner = false) {
    const row = db.prepare('SELECT role FROM faction_members WHERE faction_id=? AND user_id=?').get(factionId, userId);
    if (!row) fail(404, 'Faction not found');
    if (owner && row.role !== 'owner') fail(403, 'Owner required');
    return row;
  }
  function leaveCurrent(userId) {
    const current = db.prepare('SELECT faction_id,role FROM faction_members WHERE user_id=?').get(userId);
    if (!current) return;
    db.prepare('DELETE FROM faction_members WHERE user_id=?').run(userId);
    if (current.role === 'owner') {
      db.prepare('UPDATE faction_join_links SET enabled=0 WHERE faction_id=?').run(current.faction_id);
      const next = db.prepare('SELECT user_id FROM faction_members WHERE faction_id=? ORDER BY joined_at,user_id LIMIT 1').get(current.faction_id);
      if (next) db.prepare("UPDATE faction_members SET role='owner' WHERE faction_id=? AND user_id=?").run(current.faction_id, next.user_id);
      else db.prepare('DELETE FROM factions WHERE id=?').run(current.faction_id);
    }
  }
  function invite(value) {
    if (!/^[a-f0-9]{64}$/.test(value || '')) fail(404, 'Invitation unavailable');
    const row = db.prepare(`SELECT i.*, f.name FROM faction_join_links i JOIN factions f ON f.id=i.faction_id WHERE token=?`).get(value);
    if (!row || !row.enabled) fail(404, 'Invitation unavailable');
    return row;
  }
  async function handle(req, res, url, json) {
    if (!/^\/api\/(factions(?:\/|$)|faction-invites(?:\/|$))/.test(url.pathname)) return false;
    try {
      const user = auth.currentUser(req); if (!user) fail(401, 'Authentication required');
      if (req.method !== 'GET' && req.headers.origin !== publicOrigin) fail(403, 'Invalid origin');
      const route = url.pathname;
      if (route === '/api/factions' && req.method === 'GET') {
        json(res, 200, { factions: db.prepare(`SELECT f.id,f.name,f.created_at AS createdAt,m.role FROM factions f JOIN faction_members m ON m.faction_id=f.id WHERE m.user_id=? ORDER BY f.name,f.id`).all(user.id) }); return true;
      }
      if (route === '/api/factions' && req.method === 'POST') {
        const body = await readBody(req), name = text(body.name, 80, 'name'), now = new Date().toISOString();
        const faction = transaction(() => {
          leaveCurrent(user.id);
          const row = db.prepare('INSERT INTO factions(name,created_at) VALUES (?,?) RETURNING id,name').get(name, now);
          db.prepare("INSERT INTO faction_members VALUES (?,?,'owner',?)").run(row.id, user.id, now); return row;
        }); json(res, 201, { faction }); return true;
      }
      const inviteRoute = route.match(/^\/api\/faction-invites\/([a-f0-9]{64})(\/accept)?$/);
      if (inviteRoute && ((!inviteRoute[2] && req.method === 'GET') || (inviteRoute[2] && req.method === 'POST'))) {
        const result = transaction(() => {
          const row = invite(inviteRoute[1]);
          if (inviteRoute[2] && !db.prepare('SELECT 1 FROM faction_members WHERE faction_id=? AND user_id=?').get(row.faction_id, user.id)) {
            leaveCurrent(user.id);
            db.prepare("INSERT INTO faction_members VALUES (?,?,'member',?)").run(row.faction_id, user.id, new Date().toISOString());
          }
          return { id: row.faction_id, name: row.name };
        }); json(res, 200, { faction: result }); return true;
      }
      const match = route.match(/^\/api\/factions\/(\d+)(?:\/(members|invites|items|leader|custom-books)(?:\/([^/]+))?)?$/);
      if (!match) fail(404, 'Not found');
      const id = integer(Number(match[1]), 1, Number.MAX_SAFE_INTEGER), section = match[2], key = match[3];
      membership(id, user.id);
      if (!section && req.method === 'DELETE') {
        transaction(() => { membership(id, user.id, true); db.prepare('DELETE FROM factions WHERE id=?').run(id); });
        json(res, 200, { ok: true }); return true;
      }
      if (section === 'leader' && !key && req.method === 'POST') {
        const body = await readBody(req), target = integer(body.userId, 1, Number.MAX_SAFE_INTEGER);
        transaction(() => {
          membership(id, user.id, true); membership(id, target);
          if (target === user.id) fail(400, 'Choose another member');
          db.prepare("UPDATE faction_members SET role='member' WHERE faction_id=? AND user_id=?").run(id, user.id);
          db.prepare("UPDATE faction_members SET role='owner' WHERE faction_id=? AND user_id=?").run(id, target);
          db.prepare('UPDATE faction_join_links SET enabled=0 WHERE faction_id=?').run(id);
        }); json(res, 200, { ok: true }); return true;
      }
      if (section === 'members' && !key && req.method === 'GET') {
        if (profiles) {
          const ids = db.prepare('SELECT user_id FROM faction_members WHERE faction_id=?').all(id).map(row => row.user_id);
          await profiles.refresh(ids);
          membership(id, user.id);
        }
        json(res, 200, { members: db.prepare(`SELECT m.user_id AS id,u.steam_id AS steamId,u.display_name AS displayName,u.avatar_url AS avatarUrl,m.role,m.joined_at AS joinedAt FROM faction_members m JOIN users u ON u.id=m.user_id WHERE faction_id=? ORDER BY m.role DESC,u.id`).all(id) }); return true;
      }
      if (section === 'members' && key && req.method === 'DELETE') {
        const target = integer(Number(key), 1, Number.MAX_SAFE_INTEGER);
        if (target !== user.id) membership(id, user.id, true);
        transaction(() => {
          membership(id, target);
          if (target === user.id) leaveCurrent(user.id);
          else db.prepare('DELETE FROM faction_members WHERE faction_id=? AND user_id=?').run(id, target);
        }); json(res, 200, { ok: true }); return true;
      }
      if (section === 'invites' && !key) {
        membership(id, user.id, true);
        const response = () => {
          const row = db.prepare('SELECT token,enabled FROM faction_join_links WHERE faction_id=?').get(id);
          return { invite: { enabled: Boolean(row?.enabled), url: row ? `${publicOrigin}/#invite=${row.token}` : null } };
        };
        if (req.method === 'GET') { json(res, 200, response()); return true; }
        if (req.method === 'POST') {
          const body = await readBody(req);
          if (typeof body.enabled !== 'boolean') fail(400, 'Invalid link state');
          transaction(() => {
            membership(id, user.id, true);
            db.prepare(`INSERT INTO faction_join_links(faction_id,token,enabled) VALUES (?,?,?)
              ON CONFLICT(faction_id) DO UPDATE SET enabled=excluded.enabled`).run(id, randomBytes(32).toString('hex'), Number(body.enabled));
          }); json(res, 200, response()); return true;
        }
      }
      if (section === 'custom-books') {
        if (!key && req.method === 'GET') {
          const series = db.prepare('SELECT id,name,localized_name AS localizedName,mod_name AS modName FROM faction_book_series WHERE faction_id=? ORDER BY name,id').all(id);
          for (const row of series) row.volumes = db.prepare('SELECT volume,item_key AS itemKey FROM faction_book_volumes WHERE faction_id=? AND series_id=? ORDER BY volume').all(id,row.id);
          json(res, 200, { series }); return true;
        }
        if (!key && req.method === 'POST') {
          const body = await readBody(req), name = text(body.name,160,'book name');
          if (vanillaBookNames.has(name.toLowerCase())) fail(409,'This book already exists');
          const localizedName = null;
          const modName = null;
          if (body.volumes === undefined) {
            const key = randomBytes(16).toString('hex');
            body.volumes = [1,2,3,4,5].map(volume => ({ volume, itemKey:`CustomBook.${key}_${volume}` }));
          }
          if (!Array.isArray(body.volumes) || body.volumes.length < 1 || body.volumes.length > 5) fail(400,'Add at least one volume');
          const volumes = body.volumes.map(book => {
            if (!book || typeof book !== 'object') fail(400,'Invalid volume');
            const volume = integer(book.volume,1,5), itemKey = text(book.itemKey,160,'item key');
            if (!/^\S+\.\S+$/.test(itemKey)) fail(400,'Use a full game item ID');
            if (vanillaBookIds.has(itemKey)) fail(409,'This book already exists');
            return { volume,itemKey };
          });
          if (new Set(volumes.map(v=>v.volume)).size !== volumes.length || new Set(volumes.map(v=>v.itemKey)).size !== volumes.length) fail(400,'Duplicate volume or item ID');
          const series = transaction(() => {
            membership(id,user.id);
            if (db.prepare('SELECT 1 FROM faction_book_series WHERE faction_id=? AND name=?').get(id,name) ||
              volumes.some(v=>db.prepare('SELECT 1 FROM faction_book_volumes WHERE faction_id=? AND item_key=?').get(id,v.itemKey))) fail(409,'This book already exists');
            const row = db.prepare('INSERT INTO faction_book_series(faction_id,name,localized_name,mod_name,created_by,created_at) VALUES (?,?,?,?,?,?) RETURNING id').get(id,name,localizedName,modName,user.id,new Date().toISOString());
            for (const book of volumes) db.prepare('INSERT INTO faction_book_volumes VALUES (?,?,?,?)').run(row.id,id,book.volume,book.itemKey);
            return { id:row.id };
          }); json(res,201,{ series }); return true;
        }
        if (key && req.method === 'DELETE') {
          const seriesId = integer(Number(key),1,Number.MAX_SAFE_INTEGER);
          transaction(() => {
            membership(id,user.id);
            if (!db.prepare('SELECT 1 FROM faction_book_series WHERE id=? AND faction_id=?').get(seriesId,id)) fail(404,'Book not found');
            // Removing a custom row leaves its recorded inventory intact.
            db.prepare('DELETE FROM faction_book_series WHERE id=? AND faction_id=?').run(seriesId,id);
          }); json(res,200,{ ok:true }); return true;
        }
      }
      if (section === 'items') {
        if (!key && req.method === 'GET') { json(res, 200, { items: db.prepare('SELECT item_key AS itemKey,name,category,quantity,updated_by AS updatedBy,updated_at AS updatedAt FROM faction_items WHERE faction_id=? ORDER BY category,name,item_key').all(id) }); return true; }
        if (key && ['PUT', 'DELETE'].includes(req.method)) {
          const itemKey = text(decodeURIComponent(key), 160, 'item key');
          let data;
          if (req.method === 'PUT') {
            const body = await readBody(req);
            data = { name: text(body.name, 160, 'name'), category: body.category, quantity: integer(body.quantity, 0, 1000000) };
            if (!['book', 'magazine', 'tape', 'other'].includes(data.category)) fail(400, 'Invalid category');
          }
          transaction(() => {
            // Recheck after reading the asynchronous request body.
            membership(id, user.id);
            const now = new Date().toISOString();
            if (data) db.prepare(`INSERT INTO faction_items VALUES (?,?,?,?,?,?,?) ON CONFLICT(faction_id,item_key) DO UPDATE SET name=excluded.name,category=excluded.category,quantity=excluded.quantity,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(id, itemKey, data.name, data.category, data.quantity, user.id, now);
            else db.prepare('DELETE FROM faction_items WHERE faction_id=? AND item_key=?').run(id, itemKey);
            db.prepare('INSERT INTO faction_item_changes(faction_id,item_key,user_id,action,data,created_at) VALUES (?,?,?,?,?,?)').run(id, itemKey, user.id, data ? 'set' : 'delete', JSON.stringify(data || {}), now);
          }); json(res, 200, { ok: true }); return true;
        }
      }
      res.setHeader('Allow', section === 'items' && key ? 'PUT, DELETE' : 'GET, POST'); fail(405, 'Method not allowed');
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      json(res, error.status, { error: error.message });
    }
    return true;
  }
  return { handle };
}
module.exports = { createFactions };
