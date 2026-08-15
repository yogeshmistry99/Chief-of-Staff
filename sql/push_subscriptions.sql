-- Web push subscriptions for the journal evening reminder.
--
-- Keyed by endpoint, not by a device id: the endpoint IS the identity a push
-- service gives a browser, it is what we send to, and it is what comes back as
-- gone when the subscription dies. A device that reinstalls the app gets a new
-- endpoint and therefore a new row, which is correct.
--
-- RLS matches the existing posture (allow all to PUBLIC), same as tasks,
-- app_data and journal_entries. Noted, not silently accepted: this is the
-- standing no-authentication P1, unchanged by this table.

create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Failure state is recorded rather than acted on immediately. A 404/410 from
  -- the push service means the subscription is permanently gone and the row is
  -- deleted outright; anything else is transient and must NOT unsubscribe the
  -- only device the user has, so it lands here and the row survives.
  last_error   text,
  failed_at    timestamptz,
  last_sent_at timestamptz
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "allow all" on public.push_subscriptions;
create policy "allow all" on public.push_subscriptions
  for all using (true) with check (true);
