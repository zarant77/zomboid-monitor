CREATE TABLE game_clock (
  id INTEGER PRIMARY KEY CHECK(id=1),
  day_minutes REAL NOT NULL DEFAULT 90,
  game_minutes REAL,
  observed_at INTEGER,
  synced_at INTEGER,
  updated_by INTEGER REFERENCES users(id)
);
INSERT INTO game_clock(id) VALUES(1);
