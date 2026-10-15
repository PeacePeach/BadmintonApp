create table if not exists public.ai_insights (
  user_id uuid primary key references auth.users(id) on delete cascade,
  input_fingerprint text not null,
  insight_json jsonb not null,
  generated_at timestamptz not null default now()
);

alter table public.ai_insights enable row level security;

revoke all on public.ai_insights from anon;
grant select, insert, update, delete on public.ai_insights to authenticated;

create policy "Users can read own AI insights"
on public.ai_insights for select using (auth.uid() = user_id);

create policy "Users can insert own AI insights"
on public.ai_insights for insert with check (auth.uid() = user_id);

create policy "Users can update own AI insights"
on public.ai_insights for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own AI insights"
on public.ai_insights for delete using (auth.uid() = user_id);
