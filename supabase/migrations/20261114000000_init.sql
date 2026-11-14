-- Overlap — initial schema.
-- Applied by the Supabase GitHub integration on merge to main, or manually
-- with `supabase db push`. Never edit an applied migration: add a new file.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- hosts ---

create table communities (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
create index communities_owner_idx on communities (owner_id);

create table events (
  id                 uuid primary key default gen_random_uuid(),
  community_id       uuid not null references communities(id) on delete cascade,
  owner_id           uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  slug               text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$' and slug <> 'demo'),
  pool               text not null default 'went' check (pool in ('went', 'all')),
  price_cents        integer not null default 500,
  sheet_filename     text,
  sheet_uploaded_at  timestamptz,
  created_at         timestamptz not null default now()
);
create index events_community_idx on events (community_id);

-- ------------------------------------------------------------- people ---

create table attendees (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  name          text not null,
  linkedin_url  text,
  went          boolean not null default false,
  self_added    boolean not null default false,
  role          text,
  bio           text,
  skills        text[] not null default '{}',
  extra         jsonb not null default '{}',  -- any other sheet columns
  created_at    timestamptz not null default now()
);
create index attendees_event_name_idx on attendees (event_id, lower(name));

-- Agent 1 output: facts with sources. Reruns skip people who already have findings.
create table research_findings (
  id            uuid primary key default gen_random_uuid(),
  attendee_id   uuid not null references attendees(id) on delete cascade,
  fact          text not null,
  source_url    text,
  collected_at  timestamptz not null default now(),
  status        text not null default 'ok'
);
create index research_findings_attendee_idx on research_findings (attendee_id);

-- Agent 2 output. Every need is an inference with evidence + confidence.
create table enriched_profiles (
  attendee_id   uuid primary key references attendees(id) on delete cascade,
  first_name    text,
  role          text,
  org           text,
  headline      text,
  background    text,
  needs         jsonb not null default '[]',  -- [{text, evidence, confidence}]
  offers        jsonb not null default '[]',  -- [text]
  summary       text,
  sources_used  text not null default 'Sheet only',
  updated_at    timestamptz not null default now()
);

-- Agent 3 output, from the viewer's (attendee_a) side.
create table matches (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  attendee_a    uuid not null references attendees(id) on delete cascade,
  attendee_b    uuid not null references attendees(id) on delete cascade,
  benefit_to_a  text,
  benefit_to_b  text,
  score         numeric(4,3) not null,
  jev           jsonb not null default '{}',
  explanation   text,
  evidence      jsonb not null default '[]',  -- [{fact, source_url}]
  unique (attendee_a, attendee_b)
);

-- What the viewer sees. The blurb is anonymous; the rest is unlock-only.
create table match_blurbs (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  match_id    uuid not null references matches(id) on delete cascade,
  viewer_id   uuid not null references attendees(id) on delete cascade,
  other_id    uuid not null references attendees(id) on delete cascade,
  rank        smallint not null,
  need        text not null,
  blurb       text not null,
  headline    text,
  why         text,
  shared      text[] not null default '{}',
  offer       text,
  between     text,
  openers     text[] not null default '{}',
  unique (viewer_id, other_id)
);
create index match_blurbs_viewer_idx on match_blurbs (viewer_id, rank);

-- -------------------------------------------------------------- jobs ---

-- stage = index of the step in progress: 0 search, 1 linkedin, 2 enrich,
-- 3 match, 4 blurbs, 5 done.
create table research_jobs (
  attendee_id   uuid primary key references attendees(id) on delete cascade,
  event_id      uuid not null references events(id) on delete cascade,
  stage         smallint not null default 0,
  status        text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error         text,
  retries       smallint not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
create index research_jobs_event_idx on research_jobs (event_id, status, stage);

-- Atomically claim up to `max_jobs` jobs so parallel runners never overlap.
create or replace function claim_jobs(p_event uuid, p_max int, p_max_stage int, p_lock_seconds int default 240)
returns setof research_jobs
language sql
as $$
  update research_jobs j
     set status = 'running', locked_until = now() + make_interval(secs => p_lock_seconds), updated_at = now()
   where j.attendee_id in (
     select attendee_id from research_jobs
      where event_id = p_event
        and status in ('queued', 'running')
        and stage <= p_max_stage
        and (locked_until is null or locked_until < now())
      order by stage, updated_at
      limit p_max
      for update skip locked
   )
  returning j.*;
$$;

create or replace function claim_job(p_attendee uuid, p_lock_seconds int default 280)
returns setof research_jobs
language sql
as $$
  update research_jobs
     set status = 'running', locked_until = now() + make_interval(secs => p_lock_seconds), updated_at = now()
   where attendee_id = p_attendee
     and status in ('queued', 'running')
     and (locked_until is null or locked_until < now())
  returning *;
$$;

-- ------------------------------------------------------------ payments ---

-- Simulated $5 "find my people" payment. One per attendee.
create table unlocks (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  viewer_id     uuid not null unique references attendees(id) on delete cascade,
  amount_cents  integer not null,
  paid          boolean not null default true,
  simulated     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table intro_requests (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  viewer_id   uuid not null references attendees(id) on delete cascade,
  blurb_id    uuid not null references match_blurbs(id) on delete cascade,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  unique (viewer_id, blurb_id)
);

-- ------------------------------------------------------------ security ---
-- The browser never queries tables directly. Route handlers on Vercel use the
-- secret key server-side and check ownership in code. Owner policies below
-- are a second line of defense for any signed-in client access.

alter table communities       enable row level security;
alter table events            enable row level security;
alter table attendees         enable row level security;
alter table research_findings enable row level security;
alter table enriched_profiles enable row level security;
alter table matches           enable row level security;
alter table match_blurbs      enable row level security;
alter table research_jobs     enable row level security;
alter table unlocks           enable row level security;
alter table intro_requests    enable row level security;

create policy "owners manage communities" on communities
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage events" on events
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke execute on function claim_jobs(uuid, int, int, int) from public, anon, authenticated;
revoke execute on function claim_job(uuid, int) from public, anon, authenticated;
