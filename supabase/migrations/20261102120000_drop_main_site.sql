-- The main site (weekly devotional, events, parent page, /admin) was removed;
-- only /roster remains, and it uses none of these. The week-images and
-- event-images buckets were emptied and deleted through the Storage API
-- (Supabase blocks deleting storage objects from SQL), so only their
-- policies are left to drop here.

drop table if exists analytics_events, days, events, weeks, settings cascade;

drop policy if exists "Public read week images" on storage.objects;
drop policy if exists "Authenticated can manage week images" on storage.objects;
drop policy if exists "Public read event images" on storage.objects;
drop policy if exists "Authenticated can manage event images" on storage.objects;
