CREATE TABLE faction_join_links (
  faction_id INTEGER PRIMARY KEY REFERENCES factions(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK(length(token)=64),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);
-- Legacy invitations cannot be recovered from hashes and must not remain active.
UPDATE faction_invites SET revoked=1;
