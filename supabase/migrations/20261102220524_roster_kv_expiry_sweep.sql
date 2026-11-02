-- Expired roster_kv rows read back as missing (lib/kv.ts) but were never
-- deleted, so activity, audit, metric, rate-limit, session and reset rows
-- piled up. A daily pg_cron job now removes them.
--
-- Safe to delete: every reader already treats a row past expires_at as absent,
-- and rows with no expiry (accounts, notes, settings, ...) are never touched.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

-- Daily at 09:00 UTC (early morning US time). cron.schedule with a job name
-- replaces any existing job of that name, so re-running this is harmless.
select cron.schedule(
  'roster-kv-expiry-sweep',
  '0 9 * * *',
  $$delete from public.roster_kv where expires_at is not null and expires_at < now()$$
);

-- Clear the backlog now rather than waiting for the first run.
delete from public.roster_kv where expires_at is not null and expires_at < now();
