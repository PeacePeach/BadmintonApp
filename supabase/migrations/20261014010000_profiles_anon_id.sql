-- Brings a database set up from the first version of 20261014000000_rallywise_init.sql up to date.
-- That version had no profiles.anon_id and let clients write every profiles column. Safe to run on a
-- database that already has both changes: every statement below is a no-op there.

alter table public.profiles add column if not exists anon_id uuid not null default gen_random_uuid();

-- Same name the init migration's unique constraint gives its index, so this is skipped where that exists.
create unique index if not exists profiles_anon_id_key on public.profiles (anon_id);

-- Clients may read their anon_id but never set or change it.
revoke insert, update on public.profiles from authenticated;
grant select, delete on public.profiles to authenticated;
grant insert (user_id, onboarded, prefs), update (user_id, onboarded, prefs) on public.profiles to authenticated;
