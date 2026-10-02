CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  current_kills REAL NOT NULL DEFAULT 0,
  max_kills REAL NOT NULL DEFAULT 0,
  online INTEGER NOT NULL DEFAULT 0 CHECK (online IN (0,1)),
  current_session_seconds REAL NOT NULL DEFAULT 0,
  last_session_seconds REAL NOT NULL DEFAULT 0
);
CREATE TABLE player_events (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('join','leave')),
  created_at TEXT NOT NULL,
  kills REAL NOT NULL,
  session_seconds REAL NOT NULL
);
CREATE TABLE server_events (
  id INTEGER PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('server_up','server_down')),
  created_at TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE TABLE server_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  status_json TEXT,
  online INTEGER,
  state_since TEXT,
  last_check TEXT,
  total_checks INTEGER NOT NULL DEFAULT 0,
  failed_checks INTEGER NOT NULL DEFAULT 0,
  ping_sum REAL NOT NULL DEFAULT 0,
  ping_checks INTEGER NOT NULL DEFAULT 0,
  min_ping REAL,
  max_ping REAL,
  peak_players INTEGER NOT NULL DEFAULT 0,
  downtime_seconds REAL NOT NULL DEFAULT 0,
  observed_seconds REAL NOT NULL DEFAULT 0
);
CREATE TABLE server_samples (
  created_at TEXT PRIMARY KEY,
  online INTEGER NOT NULL,
  avg_ping REAL,
  min_ping REAL,
  max_ping REAL,
  avg_players REAL,
  max_players_seen INTEGER,
  server_max_players INTEGER,
  checks INTEGER NOT NULL,
  failed_checks INTEGER NOT NULL,
  ping_sum REAL NOT NULL,
  ping_checks INTEGER NOT NULL,
  players_sum REAL NOT NULL,
  successful_checks INTEGER NOT NULL
);
