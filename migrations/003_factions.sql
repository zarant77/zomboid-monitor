CREATE TABLE factions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL
);
CREATE TABLE faction_members (
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY(faction_id,user_id)
);
CREATE UNIQUE INDEX faction_one_owner ON faction_members(faction_id) WHERE role='owner';
CREATE INDEX faction_members_user ON faction_members(user_id);
CREATE TABLE faction_invites (
  id INTEGER PRIMARY KEY,
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 100),
  uses INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE faction_items (
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('book','magazine','tape','other')),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 1000000),
  updated_by INTEGER NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(faction_id,item_key)
);
CREATE TABLE faction_item_changes (
  id INTEGER PRIMARY KEY,
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
