-- last_scene_summary is overwritten with a *compressed* memory summary every
-- 4th chapter (see lib/novel-engine/memory.js) so the Director's context
-- doesn't balloon over time -- but that means a reader who refreshes the
-- page right after a consolidation turn was seeing a few-sentence summary
-- instead of the actual chapter they just read. These two new columns are
-- for display only, always the real rendered prose, never compressed:
-- last_chapter_text is what's on screen now, previous_chapter_text is the
-- one before it, kept one chapter deep so a reader can still look back
-- before it's gone for good.
alter table story_state add column if not exists last_chapter_text text not null default '';
alter table story_state add column if not exists previous_chapter_text text;

-- Best-effort backfill for existing worlds -- last_scene_summary may
-- already be a compressed summary rather than the real last chapter for
-- some of them, but it's the closest thing available.
update story_state set last_chapter_text = last_scene_summary where last_chapter_text = '';
