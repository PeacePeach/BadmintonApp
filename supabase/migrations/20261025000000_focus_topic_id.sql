-- Growth Insights Engine V2: a stable topic for each Focus, the same id Grow's Build Next sends with each
-- recommendation ("tag:Defence" for a Skill Tag, "text:<normalised name>" otherwise).
-- Grow uses it to leave out active Focus topics and to bring a completed one back only with new evidence.
--
-- Additive and safe to run more than once: one nullable column, no backfill, no change to existing rows.
-- Rows without a topic_id keep working: the engine and the app work the topic out from the title
-- (the Skill Tag in either language, or the Grow recommendation it was added from).
-- Apps from before this column never send it, so they keep saving as they do now.
--
-- Rollback (drops only this column; every other Focus field is untouched):
--   alter table public.focus_items drop column if exists topic_id;

alter table public.focus_items
  add column if not exists topic_id text
  check (topic_id is null or (char_length(topic_id) between 5 and 80 and topic_id ~ '^(tag|text):'));

comment on column public.focus_items.topic_id is
  'Grow topic this Focus is about (tag:<Skill Tag> or text:<normalised name>); null = derive from title.';
