CREATE TABLE player_kill_changes (
  player_id INTEGER NOT NULL REFERENCES players(id),
  created_at TEXT NOT NULL,
  delta REAL NOT NULL,
  PRIMARY KEY (player_id, created_at)
);
CREATE INDEX player_kill_changes_recent ON player_kill_changes(created_at);
