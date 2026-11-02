-- Every list read in the app is `where key like 'prefix:%'` (lib/kv.ts
-- kvEntries). The primary-key index on roster_kv.key can't serve a LIKE
-- unless the database collation is "C", so those reads were sequential scans.
-- text_pattern_ops makes prefix LIKEs index lookups regardless of collation.
create index if not exists roster_kv_key_prefix_idx on roster_kv (key text_pattern_ops);
