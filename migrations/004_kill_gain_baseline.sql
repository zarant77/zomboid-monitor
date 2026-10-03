-- Historical positive deltas include journal restores and cannot be repaired reliably.
ALTER TABLE players ADD COLUMN kill_gain_baseline REAL NOT NULL DEFAULT 0;
UPDATE players SET kill_gain_baseline=current_kills,tracked_kill_gain=0,
  gain_tracked_since=strftime('%Y-%m-%dT%H:%M:%fZ','now');
