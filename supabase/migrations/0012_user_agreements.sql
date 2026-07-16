create table if not exists user_agreements (
  user_id uuid primary key,
  terms_version integer not null,
  agreed_at timestamptz not null default now()
);
