// lib/novel-engine/access.js
// Whether a world is allowed to keep generating chapters (real turns and
// passive ticks alike). Worlds that existed before the paywall shipped are
// grandfathered in permanently (see supabase/migrations/0009); anything
// created after that needs an active or trialing Stripe subscription --
// unless it still has free preview chapters left (see below).
export function hasActiveAccess(world) {
  return !!world.grandfathered || world.subscription_status === 'trialing' || world.subscription_status === 'active';
}

// New, non-subscribed worlds get a handful of real, interactive chapters
// before the paywall -- a full "day" at tier one's cap, so the free preview
// mirrors the actual subscribed experience (including the day-ending close)
// rather than cutting off mid-story. At ~4-6 cents in LLM cost per chapter,
// this is cheap enough to hand out to every signup, not just converters.
export const FREE_PREVIEW_CHAPTERS = 3;

export function hasFreePreviewRemaining(world) {
  return (world.free_preview_turns_used || 0) < FREE_PREVIEW_CHAPTERS;
}
