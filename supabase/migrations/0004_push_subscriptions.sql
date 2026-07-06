-- Web Push subscriptions, one row per browser/device a reader has enabled
-- notifications on. Timezone is captured once at subscribe time so the
-- flash-notification scheduler can figure out "morning/lunch/evening" in
-- the reader's own local time, not the server's.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  timezone text not null default 'UTC',
  last_morning_sent_date date,
  last_lunch_sent_date date,
  last_evening_sent_date date,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

create policy "Users manage their own push subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
