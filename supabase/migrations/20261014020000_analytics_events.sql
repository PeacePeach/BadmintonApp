-- Beta analytics (see the Rallywise Beta Analytics Plan). One row per event, keyed by profiles.anon_id,
-- never by the auth user id. Clients may only insert, and only under their own anon_id; nobody but the
-- database owner (SQL Editor, service role) can read, change or delete rows.
-- Safe to run more than once.

create table if not exists public.analytics_events (
  -- Made by the app when the event happens, so a retried send can never store the same event twice.
  id          uuid primary key,
  anon_id     uuid not null,
  event       text not null check (event in ('signup_completed', 'onboarding_completed', 'player_added', 'match_log_started',
                'match_logged', 'match_edited', 'match_deleted', 'insights_viewed', 'grow_viewed', 'app_opened')),
  ts          timestamptz not null,
  session_id  uuid not null,
  app_version text not null check (char_length(app_version) <= 40),
  platform    text not null check (platform in ('ios', 'android', 'web')),
  props       jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 2048),
  received_at timestamptz not null default now()
);

create index if not exists analytics_events_anon_ts_idx  on public.analytics_events (anon_id, ts);
create index if not exists analytics_events_event_ts_idx on public.analytics_events (event, ts);

alter table public.analytics_events enable row level security;

-- Insert only. Supabase's default privileges grant everything to anon and authenticated, so take it all back first.
revoke all on public.analytics_events from anon, authenticated;
grant insert on public.analytics_events to authenticated;

drop policy if exists "insert own anon_id" on public.analytics_events;
create policy "insert own anon_id" on public.analytics_events for insert to authenticated
  with check (anon_id = (select p.anon_id from public.profiles p where p.user_id = (select auth.uid())));

-- Delete Account now also removes the caller's analytics events, then the auth user (which cascades to
-- profiles, players and matches as before). Same rules as before: it only ever acts on auth.uid().
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.analytics_events where anon_id = (select anon_id from public.profiles where user_id = uid);
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
