-- Scoring format per match (Han 2026-10-26): every game of a match is played to 11, 15 or 21 points.
-- The app saves the format chosen in Match Results (default 21, or the one said in a voice log) and shows it in
-- Match Detail and Edit.
--
-- Additive and safe to run more than once: one nullable column, no backfill, no change to existing rows.
-- Matches saved before this column keep scoring null; the app never guesses a format for them.
-- Apps from before this column never send it, and the app sends it only once it has seen the column.
--
-- Rollback (drops only this column; every other match field is untouched):
--   alter table public.matches drop column if exists scoring;

alter table public.matches
  add column if not exists scoring smallint
  check (scoring is null or scoring in (11, 15, 21));

comment on column public.matches.scoring is
  'Points per game for every game of the match: 11, 15 or 21; null = saved before formats were stored.';
