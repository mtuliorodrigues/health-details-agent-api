drop policy if exists "users read their devices" on public.devices;
drop policy if exists "users read their client samples" on public.client_samples;

alter table public.devices drop constraint if exists devices_owner_id_fkey;
alter table public.devices drop column if exists owner_id;
