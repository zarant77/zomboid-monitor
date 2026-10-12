-- Preserve every collection. Keep the earliest membership per account and
-- prefer a leadership membership when upgrading from multiple factions.
DELETE FROM faction_members WHERE rowid NOT IN (
  SELECT rowid FROM (
    SELECT rowid, ROW_NUMBER() OVER (
      PARTITION BY user_id ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, joined_at, faction_id
    ) AS position FROM faction_members
  ) WHERE position=1
);
-- Reassign leadership in factions whose previous leader kept another faction.
UPDATE faction_members SET role='owner' WHERE rowid IN (
  SELECT m.rowid FROM faction_members m
  WHERE NOT EXISTS (SELECT 1 FROM faction_members o WHERE o.faction_id=m.faction_id AND o.role='owner')
    AND m.user_id=(SELECT n.user_id FROM faction_members n WHERE n.faction_id=m.faction_id ORDER BY joined_at,user_id LIMIT 1)
);
CREATE UNIQUE INDEX faction_single_membership ON faction_members(user_id);
