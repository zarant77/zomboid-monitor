UPDATE faction_book_series SET localized_name=NULL, mod_name=NULL;
INSERT INTO faction_book_volumes(series_id,faction_id,volume,item_key)
SELECT s.id,s.faction_id,v.volume,'CustomBook.' || lower(hex(randomblob(16))) || '_' || v.volume
FROM faction_book_series s CROSS JOIN (SELECT 1 AS volume UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) v
WHERE NOT EXISTS (SELECT 1 FROM faction_book_volumes b WHERE b.series_id=s.id AND b.volume=v.volume);
