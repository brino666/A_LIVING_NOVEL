-- Daily chapter cap: caps how many chapters a world can generate per rolling
-- 24h window. chapter_cap is per-world (not a global constant) so a future
-- subscription tier can raise it for a given user without a schema change.

alter table worlds add column if not exists chapter_cap integer not null default 4;
alter table worlds add column if not exists chapters_in_window integer not null default 0;
alter table worlds add column if not exists chapter_window_start timestamptz not null default now();

alter table worlds add constraint chapter_cap_positive check (chapter_cap > 0);
