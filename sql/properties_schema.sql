-- Property-Market Intelligence — schema of record.
--
-- Applied to the shared Supabase project (ref xrmjzglsabnnqqeyubgh) via the
-- Supabase MCP apply_migration. This file is the checked-in copy; the repo has
-- no formal migrations runner, so keep this in sync when the schema changes.
--
-- Conventions mirror public.tasks: id text PK, updated_at via the existing
-- set_updated_at() trigger function, deleted_at soft-delete + a partial index on
-- live rows, CHECK constraints for domain rules, and RLS "allow all" to PUBLIC
-- (so the anon key works from both the browser and the serverless functions).
--
-- Three tables:
--   properties        one row per PHYSICAL house, permanent identity (P###).
--   property_listings one row per source listing (a house can have several).
--   property_events   append-only history — the market-memory "moat".

-- ─── properties ────────────────────────────────────────────────────────────────
create table if not exists public.properties (
  id                  text primary key,                 -- 'P156'
  pnum                integer not null,                 -- 156 (ordering / minting)
  area                text not null default 'slough',   -- multi-area key (future overlay)
  address             text,
  postcode            text,
  lat                 double precision,
  lng                 double precision,

  -- physical (best-known)
  bedrooms            integer,
  bathrooms           integer,
  floor_area_sqft     numeric,
  house_type          text,
  tenure              text,
  parking             boolean,
  garage              boolean,
  garden              boolean,
  plot_sqft           numeric,
  epc                 text,
  council_tax         text,

  -- factor columns (drive the interactive model)
  nearest_school_m    numeric,
  nearest_station_m   numeric,
  extension_potential smallint,                          -- 0..3 none/loft/rear/large

  -- market rollup (denormalized latest)
  asking_price        numeric,
  first_seen_price    numeric,
  status              text not null default 'available',
  primary_agent       text,
  listed_date         date,
  floor_area_source   text,
  data_quality        jsonb not null default '{}'::jsonb,

  -- personal decision layer (persistent)
  decision_state      text not null default 'unreviewed',
  notes               text,
  decided_at          timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  constraint properties_pnum_positive  check (pnum > 0),
  constraint properties_status_chk     check (status in ('available','under_offer','sold_stc','withdrawn')),
  constraint properties_decision_chk   check (decision_state in ('unreviewed','watch','shortlist','viewing','offer','pass')),
  constraint properties_extension_chk  check (extension_potential is null or extension_potential between 0 and 3),
  constraint properties_house_type_chk check (house_type is null or house_type in
                                              ('detached','semi_detached','terraced','end_terrace','flat','bungalow','other'))
);
create unique index if not exists properties_pnum_uk   on public.properties (pnum);
create index        if not exists properties_live_idx  on public.properties (area) where deleted_at is null;
create index        if not exists properties_pcode_idx on public.properties (postcode) where deleted_at is null;

-- ─── property_listings ─────────────────────────────────────────────────────────
create table if not exists public.property_listings (
  id                text primary key,                   -- 'rightmove:12345'
  property_id       text not null references public.properties(id) on delete cascade,
  source            text not null,
  source_listing_id text,
  url               text,
  price             numeric,
  status            text,
  agent             text,
  first_seen        timestamptz not null default now(),
  last_seen         timestamptz not null default now(),
  raw               jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint listings_source_chk check (source in ('rightmove','zoopla','onthemarket'))
);
create index if not exists listings_property_idx on public.property_listings (property_id) where deleted_at is null;

-- ─── property_events (append-only history) ─────────────────────────────────────
create table if not exists public.property_events (
  id          text primary key,
  property_id text not null references public.properties(id) on delete cascade,
  type        text not null,
  from_val    text,
  to_val      text,
  source      text,
  occurred_at timestamptz not null default now(),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint events_type_chk check (type in
    ('new_listing','price_change','reduced','increased','status_change','sold_stc',
     'relisted','agent_change','floor_area_found','portal_added','withdrawn'))
);
create index if not exists events_property_idx on public.property_events (property_id, occurred_at desc);

-- ─── updated_at triggers (reuse existing set_updated_at) ───────────────────────
drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

drop trigger if exists listings_set_updated_at on public.property_listings;
create trigger listings_set_updated_at before update on public.property_listings
  for each row execute function public.set_updated_at();

-- ─── RLS: allow all to PUBLIC (matches tasks/app_data posture) ─────────────────
alter table public.properties        enable row level security;
alter table public.property_listings enable row level security;
alter table public.property_events   enable row level security;

drop policy if exists "allow all" on public.properties;
drop policy if exists "allow all" on public.property_listings;
drop policy if exists "allow all" on public.property_events;
create policy "allow all" on public.properties        for all to public using (true) with check (true);
create policy "allow all" on public.property_listings for all to public using (true) with check (true);
create policy "allow all" on public.property_events   for all to public using (true) with check (true);

-- ─── realtime: publish properties so the browser useProperties() hook wakes ────
do $$
begin
  begin
    alter publication supabase_realtime add table public.properties;
  exception when duplicate_object then null;
  end;
end $$;
