// lib/novel-engine/stripe.js
// Shared Stripe client plus the price -> tier mapping. Each world is its
// own independently billed subscription (terms.html section 4), not a
// single account-wide plan.

import Stripe from 'stripe';

// Constructing Stripe with a missing/empty key throws synchronously -- if
// that happened at module load (the old top-level `new Stripe(...)`), it
// crashed the entire serverless function before our own try/catch ever ran,
// and Vercel's crash page isn't JSON, so the frontend's res.json() choked
// with a confusing "not valid JSON" error instead of a real message. Lazy
// construction turns a missing STRIPE_SECRET_KEY into a normal, catchable
// error inside the request handler instead.
let _stripe = null;
export function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
  return _stripe;
}

// Price ID (not Product ID) -> daily chapter cap for that tier. Both env
// vars must be set to the recurring Price IDs created in the Stripe
// Dashboard for this to resolve correctly.
export function tierChapterCaps() {
  return {
    [process.env.STRIPE_PRICE_TIER_ONE]: 3,
    [process.env.STRIPE_PRICE_TIER_TWO]: 6,
  };
}

export function chapterCapForPrice(priceId) {
  return tierChapterCaps()[priceId] || null;
}
