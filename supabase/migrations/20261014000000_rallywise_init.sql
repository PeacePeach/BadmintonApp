-- Rallywise cloud storage.
-- Every row belongs to one auth user (user_id). Row-level security lets a signed-in user
-- read and write only their own rows; the anon role gets nothing. Deleting the auth user
-- cascades to all of their rows, which is what delete_account() relies on.

-- Per-account settings. Name and skill level live on the "me" row in players, as in the app.
create table public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  onboarded  boolean not null default false,
  prefs      jsonb   not null default '{}'::jsonb,
  -- Analytics identity: generated once by the database, kept across devices, never the auth id.
  anon_id    uuid    not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The user's own player record has id 'me'; everyone else is a player they added.
create table public.players (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null check (char_length(id) between 1 and 64),
  name       text not null default '' check (char_length(name) <= 120),
  level      text check (level in ('Beginner', 'Intermediate', 'Advanced', 'Competitive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- One logged match. partner/opps hold player ids from the same user's players.
-- created_at is when the match was first logged (the app sends it; edits keep it).
create table public.matches (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null check (char_length(id) between 1 and 64),
  date       date not null,
  type       text not null check (type in ('Singles', 'Doubles')),
  partner    text,
  opps       text[] not null default '{}',
  games      jsonb  not null default '[]'::jsonb check (jsonb_typeof(games) = 'array'),
  wt         text[] not null default '{}',
  lt         text[] not null default '{}',
  worked     text not null default '' check (char_length(worked) <= 4000),
  lost       text not null default '' check (char_length(lost) <= 4000),
  opp_notes  text not null default '' check (char_length(opp_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index matches_user_date_idx on public.matches (user_id, date desc);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger players_touch  before update on public.players  for each row execute function public.touch_updated_at();
create trigger matches_touch  before update on public.matches  for each row execute function public.touch_updated_at();

-- Row-level security: own rows only.
alter table public.profiles enable row level security;
alter table public.players  enable row level security;
alter table public.matches  enable row level security;

revoke all on public.profiles, public.players, public.matches from anon;
grant select, insert, update, delete on public.players, public.matches to authenticated;
-- Clients may read their anon_id but never set or change it. Supabase's default privileges grant
-- whole-table insert/update, which would override column grants, so revoke those first.
revoke insert, update on public.profiles from authenticated;
grant select, delete on public.profiles to authenticated;
grant insert (user_id, onboarded, prefs), update (user_id, onboarded, prefs) on public.profiles to authenticated;

create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own players" on public.players for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own matches" on public.matches for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Delete Account: removes the caller's auth user, and with it every row above (on delete cascade).
-- Runs as the function owner because the client cannot touch auth.users itself; it only ever
-- deletes auth.uid(), so a user can delete no one but themselves.
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
