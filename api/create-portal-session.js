// api/create-portal-session.js
// Opens Stripe's hosted Customer Portal for one world's subscription --
// self-serve cancellation and payment method updates, no custom UI needed.

import { getWorldById } from '../lib/novel-engine/db.js';
import { requireMatchingUser } from '../lib/novel-engine/auth.js';
import { getStripe } from '../lib/novel-engine/stripe.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, worldId } = req.body || {};
  if (!userId || !worldId) return res.status(400).json({ error: 'userId and worldId are required' });
  if (!(await requireMatchingUser(req, res, userId))) return;

  const world = await getWorldById(worldId);
  if (!world || world.user_id !== userId) return res.status(404).json({ error: 'World not found' });
  if (!world.stripe_customer_id) return res.status(400).json({ error: 'This world has no billing account yet -- subscribe first' });

  const origin = req.headers.origin || ('https://' + req.headers.host);

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: world.stripe_customer_id,
      return_url: origin + '/',
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[stripe/create-portal-session error]', err);
    return res.status(500).json({ error: err.message || 'Could not open billing portal' });
  }
}
