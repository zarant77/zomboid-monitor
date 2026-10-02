ALTER TABLE players ADD COLUMN tracked_kill_gain REAL NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN longest_session_seconds REAL NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN join_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN gain_tracked_since TEXT;
UPDATE players SET
  longest_session_seconds = MAX(current_session_seconds, last_session_seconds,
    COALESCE((SELECT MAX(session_seconds) FROM player_events WHERE player_id=players.id), 0)),
  join_count = (SELECT COUNT(*) FROM player_events WHERE player_id=players.id AND event_type='join'),
  gain_tracked_since = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE INDEX player_events_player_recent ON player_events(player_id, created_at DESC, id DESC);
