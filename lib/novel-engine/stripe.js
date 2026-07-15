// lib/novel-engine/stripe.js
// Shared Stripe client plus the price -> tier mapping. Each world is its
// own independently billed subscription (terms.html section 4), not a
// single account-wide plan.

import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

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
