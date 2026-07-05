-- Living Novel Engine: World State schema (V1)
-- Apply with `supabase db push` or by running this file directly in the
-- Supabase SQL editor of whichever project you point this app at.
--
-- Design: one row per world in `worlds`, owned by a Supabase auth user.
-- Everything else hangs off world_id. `story_state` and `user_character`
-- are 1:1 with a world (world_id is their primary key).

create extension if not exists pgcrypto;

-- ── worlds ──────────────────────────────────────────────────────────
create table if not exists worlds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  genre text not null default 'general',
  world_hours bigint not null default 0, -- hours elapsed since world start
  interaction_count integer not null default 0,
  tone_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists worlds_user_id_idx on worlds(user_id);

-- ── locations ───────────────────────────────────────────────────────
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  name text not null,
  description text not null default '',
  type text not null default 'other', -- city / building / rural / etc
  status text not null default 'open' -- open / closed / changed
);

create index if not exists locations_world_id_idx on locations(world_id);

-- ── characters ──────────────────────────────────────────────────────
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  name text not null,
  role text not null default 'neutral' check (role in ('ally', 'antagonist', 'neutral', 'unknown')),
  personality jsonb not null default '{}'::jsonb,
  goals text[] not null default '{}',
  relationships jsonb not null default '{}'::jsonb,
  location_id uuid references locations(id) on delete set null,
  alive boolean not null default true,
  memory_summary text not null default '',
  last_seen_time bigint not null default 0
);

create index if not exists characters_world_id_idx on characters(world_id);

-- ── events ──────────────────────────────────────────────────────────
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  type text not null default 'random', -- mystery / romance / conflict / discovery / random
  description text not null,
  participants uuid[] not null default '{}',
  resolved boolean not null default false,
  created_time bigint not null default 0
);

create index if not exists events_world_id_idx on events(world_id);

-- ── story_state (1:1 with world) ───────────────────────────────────
create table if not exists story_state (
  world_id uuid primary key references worlds(id) on delete cascade,
  main_plot_threads jsonb not null default '[]'::jsonb,
  user_relationship_map jsonb not null default '{}'::jsonb,
  active_hooks jsonb not null default '[]'::jsonb,
  narrative_pressure real not null default 0.2 check (narrative_pressure >= 0 and narrative_pressure <= 1),
  last_scene_summary text not null default ''
);

-- ── user_character (1:1 with world) ────────────────────────────────
create table if not exists user_character (
  world_id uuid primary key references worlds(id) on delete cascade,
  name text not null,
  traits jsonb not null default '{}'::jsonb,
  inventory jsonb not null default '[]'::jsonb,
  current_location uuid references locations(id) on delete set null,
  emotional_state jsonb not null default '{}'::jsonb,
  memory text not null default ''
);

-- ── Row Level Security ──────────────────────────────────────────────
-- worlds is the only table with a direct user_id; every child table is
-- scoped through it via subquery. The API server uses the Supabase
-- service-role key (bypasses RLS) so these policies are a defense-in-depth
-- backstop, not the enforcement path -- ownership is also checked in code.

alter table worlds enable row level security;
alter table locations enable row level security;
alter table characters enable row level security;
alter table events enable row level security;
alter table story_state enable row level security;
alter table user_character enable row level security;

create policy worlds_owner on worlds
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy locations_owner on locations
  for all using (world_id in (select id from worlds where user_id = auth.uid()))
  with check (world_id in (select id from worlds where user_id = auth.uid()));

create policy characters_owner on characters
  for all using (world_id in (select id from worlds where user_id = auth.uid()))
  with check (world_id in (select id from worlds where user_id = auth.uid()));

create policy events_owner on events
  for all using (world_id in (select id from worlds where user_id = auth.uid()))
  with check (world_id in (select id from worlds where user_id = auth.uid()));

create policy story_state_owner on story_state
  for all using (world_id in (select id from worlds where user_id = auth.uid()))
  with check (world_id in (select id from worlds where user_id = auth.uid()));

create policy user_character_owner on user_character
  for all using (world_id in (select id from worlds where user_id = auth.uid()))
  with check (world_id in (select id from worlds where user_id = auth.uid()));
