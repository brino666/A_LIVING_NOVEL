-- Each world is its own independently billed subscription (terms.html
-- section 4), so these live on worlds, not on a per-account users table.
alter table worlds add column if not exists stripe_customer_id text;
alter table worlds add column if not exists stripe_subscription_id text;
alter table worlds add column if not exists stripe_price_id text;
-- 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | null
-- (null = never started checkout for this world)
alter table worlds add column if not exists subscription_status text;

create unique index if not exists worlds_stripe_subscription_id_idx
  on worlds (stripe_subscription_id) where stripe_subscription_id is not null;
