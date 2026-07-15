// lib/novel-engine/access.js
// Whether a world is allowed to keep generating chapters (real turns and
// passive ticks alike). Worlds that existed before the paywall shipped are
// grandfathered in permanently (see supabase/migrations/0009); anything
// created after that needs an active or trialing Stripe subscription.
export function hasActiveAccess(world) {
  return !!world.grandfathered || world.subscription_status === 'trialing' || world.subscription_status === 'active';
}
