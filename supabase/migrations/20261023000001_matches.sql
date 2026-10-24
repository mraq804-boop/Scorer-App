create domain public.match_event_type as text check (value in (
  'match_created', 'player_added', 'innings_started', 'delivery', 'batter_in', 'bowler_changed',
  'strike_swapped', 'retired', 'settings_changed', 'innings_ended', 'undo', 'correct'
));

create domain public.match_event_payload as jsonb
  check (jsonb_typeof(value) = 'object' and octet_length(value::text) <= 4096);

create table public.matches (
  id uuid primary key,
  code text not null unique check (code ~ '^[a-hjkmnp-z2-9]{8}$'),
  owner_id uuid not null references auth.users on delete cascade,
  scoring_device uuid not null,
  title text not null check (char_length(title) <= 120),
  team_a text not null check (char_length(team_a) between 1 and 40),
  team_b text not null check (char_length(team_b) between 1 and 40),
  rules jsonb not null constraint matches_rules_size check (octet_length(rules::text) <= 4096),
  status text not null check (status in ('in_progress', 'complete')),
  visibility text not null default 'link' check (visibility in ('link', 'private')),
  summary jsonb not null default '{}' constraint matches_summary_size check (octet_length(summary::text) <= 8192),
  last_seq int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matches_owner_idx on public.matches (owner_id);

create table public.match_events (
  id uuid primary key,
  match_id uuid not null references public.matches on delete cascade,
  seq int not null check (seq > 0),
  type public.match_event_type not null,
  payload public.match_event_payload not null,
  client_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (match_id, seq)
);

create table public.match_claims (
  token_hash text primary key,
  from_user uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null
);

do $$
declare t text;
begin
  foreach t in array array['matches', 'match_events', 'match_claims'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy matches_owner_read on public.matches for select to authenticated
  using (owner_id = (select auth.uid()));
create policy match_events_owner_read on public.match_events for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and m.owner_id = (select auth.uid())));

revoke insert, update, delete, truncate on public.matches, public.match_events, public.match_claims from anon, authenticated;
