ALTER TABLE players ADD COLUMN death_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE player_events_new (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('join','leave','death')),
  created_at TEXT NOT NULL,
  kills REAL NOT NULL,
  session_seconds REAL NOT NULL
);
INSERT INTO player_events_new SELECT * FROM player_events;
DROP TABLE player_events;
ALTER TABLE player_events_new RENAME TO player_events;
CREATE INDEX player_events_recent ON player_events(created_at DESC);
CREATE INDEX player_events_player_recent ON player_events(player_id, created_at DESC, id DESC);
