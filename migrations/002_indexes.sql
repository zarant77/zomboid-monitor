CREATE INDEX players_leaderboard ON players(max_kills DESC, name);
CREATE INDEX players_online ON players(online);
CREATE INDEX player_events_recent ON player_events(created_at DESC);
CREATE INDEX server_events_recent ON server_events(created_at DESC);
