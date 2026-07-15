// api/stripe-webhook.js
// Receives subscription lifecycle events from Stripe and applies them to
// the corresponding world. Requires the raw request body for signature
// verification, so Vercel's default JSON body parser is disabled below.

import { stripe, chapterCapForPrice } from '../lib/novel-engine/stripe.js';
import { updateWorldBilling, updateWorldBillingBySubscriptionId } from '../lib/novel-engine/db.js';

export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Subscription-level events carry worldId in their own metadata (set at
// checkout time via subscription_data.metadata) -- fall back to looking the
// world up by the subscription id we stored on checkout.session.completed,
// in case that metadata is ever missing.
async function applyToWorld(subscription, fields) {
  const worldId = subscription.metadata && subscription.metadata.worldId;
  if (worldId) {
    await updateWorldBilling(worldId, fields);
  } else {
    await updateWorldBillingBySubscriptionId(subscription.id, fields);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const signature = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const worldId = session.client_reference_id || (session.metadata && session.metadata.worldId);
        if (worldId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const priceId = subscription.items.data[0].price.id;
          await updateWorldBilling(worldId, {
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            stripe_price_id: priceId,
            subscription_status: subscription.status,
            chapter_cap: chapterCapForPrice(priceId) || undefined,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const priceId = subscription.items.data[0].price.id;
        const cap = chapterCapForPrice(priceId);
        await applyToWorld(subscription, {
          stripe_price_id: priceId,
          subscription_status: subscription.status,
          chapter_cap: cap || undefined, // only overwrite if the price maps to a known tier
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await applyToWorld(subscription, { subscription_status: 'canceled' });
        break;
      }

      default:
        break; // not a type we act on
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[stripe-webhook] handler error', err);
    // A 500 tells Stripe to retry -- safe here since every update above is
    // idempotent (re-applying the same subscription state is a no-op).
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
