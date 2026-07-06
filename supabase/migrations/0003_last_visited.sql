-- Tracks the last time a user actually opened a world, so the API can
-- detect a real-world gap and run silent passive ticks to catch the world
-- up before the reader's next chapter -- see lib/novel-engine/passiveTick.js.

alter table worlds add column if not exists last_visited_at timestamptz not null default now();
