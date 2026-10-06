ALTER TABLE players ADD COLUMN session_kill_baseline REAL NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN best_session_kills REAL NOT NULL DEFAULT 0;
UPDATE players SET session_kill_baseline=current_kills;
