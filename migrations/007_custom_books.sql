CREATE TABLE faction_book_series (
  id INTEGER PRIMARY KEY,
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  localized_name TEXT,
  mod_name TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(faction_id,name),
  UNIQUE(id,faction_id)
);
CREATE TABLE faction_book_volumes (
  series_id INTEGER NOT NULL,
  faction_id INTEGER NOT NULL,
  volume INTEGER NOT NULL CHECK(volume BETWEEN 1 AND 5),
  item_key TEXT NOT NULL,
  PRIMARY KEY(series_id,volume),
  UNIQUE(faction_id,item_key),
  FOREIGN KEY(series_id,faction_id) REFERENCES faction_book_series(id,faction_id) ON DELETE CASCADE
);
