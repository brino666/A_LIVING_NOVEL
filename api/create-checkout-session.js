// api/create-checkout-session.js
// Starts a Stripe Checkout session for an existing world's subscription.
// Each world is its own independently billed subscription -- see
// terms.html section 4 -- so this always targets one specific worldId,
// never an account as a whole.

import { getWorldById } from '../lib/novel-engine/db.js';
import { requireMatchingUser } from '../lib/novel-engine/auth.js';
import { stripe } from '../lib/novel-engine/stripe.js';

const TIER_PRICE_ENV = { tier_one: 'STRIPE_PRICE_TIER_ONE', tier_two: 'STRIPE_PRICE_TIER_TWO' };

// Matches terms.html section 4's stated free trial.
const TRIAL_DAYS = 2;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, worldId, tier, userEmail } = req.body || {};
  if (!userId || !worldId || !TIER_PRICE_ENV[tier]) {
    return res.status(400).json({ error: 'userId, worldId, and a valid tier ("tier_one" or "tier_two") are required' });
  }
  if (!(await requireMatchingUser(req, res, userId))) return;

  const world = await getWorldById(worldId);
  if (!world || world.user_id !== userId) return res.status(404).json({ error: 'World not found' });

  const priceId = process.env[TIER_PRICE_ENV[tier]];
  if (!priceId) return res.status(500).json({ error: 'Stripe price is not configured for this tier yet' });

  const origin = req.headers.origin || ('https://' + req.headers.host);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: worldId,
      // Reuse the existing Stripe customer for this world if it already
      // has one (e.g. switching tiers after a cancellation); otherwise let
      // Checkout create one from the email.
      customer: world.stripe_customer_id || undefined,
      customer_email: world.stripe_customer_id ? undefined : (userEmail || undefined),
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { worldId, userId, tier },
      },
      metadata: { worldId, userId, tier },
      success_url: origin + '/?checkout=success',
      cancel_url: origin + '/?checkout=cancelled',
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[stripe/create-checkout-session error]', err);
    return res.status(500).json({ error: err.message || 'Could not start checkout' });
  }
}
