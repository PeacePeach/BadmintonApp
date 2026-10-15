-- Focus: things the user is actively improving, and their progress one period at a time.
-- Same rules as the other user tables: every row has a user_id, a signed-in user can read and write only their
-- own rows, the anon role gets nothing, and deleting the auth user (Delete Account) cascades to all of them.
-- Safe to run more than once.

-- One Focus. The plan columns describe the plan in force now; changing it applies from then on and leaves the
-- periods already recorded in focus_periods as they were.
create table if not exists public.focus_items (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null check (char_length(id) between 1 and 64),
  title             text not null check (char_length(title) between 1 and 120),
  -- 'manual' (made with New Focus) or 'grow' (added from a Grow suggestion).
  source            text not null default 'manual' check (source in ('manual', 'grow')),
  -- practice: sessions per week · match: the next N matches · manual: no schedule.
  type              text not null check (type in ('practice', 'match', 'manual')),
  status            text not null default 'active' check (status in ('active', 'completed')),
  -- 'plan' when the plan ran its course, 'user' when marked complete by hand.
  completed_by      text check (completed_by in ('plan', 'user')),
  completed_at      timestamptz,
  -- Coaching: the sentence under "What to work on", plus short cues.
  goal              text not null default '' check (char_length(goal) <= 1000),
  cues              text[] not null default '{}',
  -- Plan. period_type follows type: week (practice), matches (match), none (manual).
  period_type       text not null check (period_type in ('week', 'matches', 'none')),
  -- Sessions per week (1–7) or the number of matches (1–20); 0 for no schedule.
  target_per_period integer not null default 0 check (target_per_period between 0 and 20),
  -- Weeks in the plan; 0 means ongoing.
  total_periods     integer not null default 0 check (total_periods between 0 and 52),
  -- Local date week 1 starts on; weeks run seven days from it.
  plan_start        date not null,
  -- When the current plan began. A match plan counts matches logged from here.
  plan_started_at   timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, id),
  check ((status = 'completed') = (completed_by is not null))
);

-- One row per week of a practice plan, made once that week has started. Past weeks keep their own target and
-- result even if the plan changes later.
create table if not exists public.focus_periods (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- focus id + '@' + period_start
  id           text not null check (char_length(id) between 1 and 80),
  focus_id     text not null,
  period_start date not null,
  period_end   date not null check (period_end >= period_start),
  target       integer not null check (target between 1 and 7),
  -- One entry per session marker, in order: true = done.
  marks        jsonb not null default '[]'::jsonb check (jsonb_typeof(marks) = 'array'),
  completed    integer not null default 0 check (completed between 0 and target),
  -- open: the current week. complete / partial / missed: how a finished week ended (missed = nothing done).
  -- skipped: set aside on purpose (not offered in the app yet).
  status       text not null default 'open' check (status in ('open', 'complete', 'partial', 'missed', 'skipped')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, focus_id) references public.focus_items (user_id, id) on delete cascade
);

create index if not exists focus_periods_focus_idx on public.focus_periods (user_id, focus_id, period_start);

drop trigger if exists focus_items_touch on public.focus_items;
drop trigger if exists focus_periods_touch on public.focus_periods;
create trigger focus_items_touch   before update on public.focus_items   for each row execute function public.touch_updated_at();
create trigger focus_periods_touch before update on public.focus_periods for each row execute function public.touch_updated_at();

alter table public.focus_items   enable row level security;
alter table public.focus_periods enable row level security;

revoke all on public.focus_items, public.focus_periods from anon;
grant select, insert, update, delete on public.focus_items, public.focus_periods to authenticated;

drop policy if exists "own focus items" on public.focus_items;
drop policy if exists "own focus periods" on public.focus_periods;
create policy "own focus items" on public.focus_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own focus periods" on public.focus_periods for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
