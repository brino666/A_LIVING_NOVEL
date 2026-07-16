create table if not exists user_agreements (
  user_id uuid primary key,
  terms_version integer not null,
  agreed_at timestamptz not null default now()
);

-- Defense-in-depth, same as every other table in 0001_living_novel_engine.sql
-- -- the API server uses the service-role key (bypasses RLS) as the real
-- enforcement path, but this stops the publicly-visible anon key from being
-- able to read or write other users' agreement rows directly.
alter table user_agreements enable row level security;

create policy user_agreements_owner on user_agreements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
