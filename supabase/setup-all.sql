-- Combined from supabase/migrations in order. Paste into Supabase → SQL Editor and run once on a new project.

-- ==== 20261023000001_matches.sql ====
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

-- ==== 20261023000002_rpc.sql ====
create or replace function public.match_event_json(e public.match_events) returns jsonb
language sql stable security definer set search_path = '' as $$
  select e.payload || jsonb_build_object(
    'id', e.id,
    'seq', e.seq,
    'at', to_char(e.client_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'type', e.type
  );
$$;

create or replace function public.push_match_events(p_match jsonb, p_device uuid, p_events jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  max_seq constant int := 5000;
  max_new_matches_per_day constant int := 20;
  uid uuid := (select auth.uid());
  mid uuid;
  m public.matches;
  ev record;
  malformed boolean;
  top_seq int;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'invalid_event';
  end if;
  if jsonb_array_length(p_events) > 500 then
    raise exception 'too_many_events';
  end if;
  begin
    select bool_or(x.id is null or x.seq is null or x.seq < 1 or x.at is null or x.type is null or x.payload is null),
           max(x.seq)
    into malformed, top_seq
    from jsonb_to_recordset(p_events)
      as x(id uuid, seq int, at timestamptz, type public.match_event_type, payload public.match_event_payload);
  exception when others then
    malformed := true;
  end;
  if malformed then
    raise exception 'invalid_event';
  end if;
  if top_seq > max_seq then
    raise exception 'quota_exceeded';
  end if;

  mid := (p_match ->> 'id')::uuid;
  select * into m from public.matches where id = mid for update;
  if not found then
    perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
    if (select count(*) from public.matches
        where owner_id = uid and id <> mid and created_at > now() - interval '24 hours') >= max_new_matches_per_day then
      raise exception 'quota_exceeded';
    end if;
    insert into public.matches (id, code, owner_id, scoring_device, title, team_a, team_b, rules, status, summary)
    values (mid, p_match ->> 'code', uid, p_device, p_match ->> 'title', p_match ->> 'teamA', p_match ->> 'teamB',
            p_match -> 'rules', p_match ->> 'status', coalesce(p_match -> 'summary', '{}'))
    on conflict do nothing;
    select * into m from public.matches where id = mid for update;
    if not found then
      raise exception 'code_taken';
    end if;
  end if;
  if m.owner_id is distinct from uid then
    raise exception 'not_owner';
  end if;
  if m.scoring_device is distinct from p_device then
    raise exception 'scoring_moved';
  end if;

  for ev in
    select x.* from jsonb_to_recordset(p_events)
      as x(id uuid, seq int, at timestamptz, type public.match_event_type, payload public.match_event_payload)
    order by x.seq
  loop
    continue when exists (select 1 from public.match_events e where e.id = ev.id);
    if exists (select 1 from public.match_events e where e.match_id = mid and e.seq = ev.seq) then
      raise exception 'invalid_event';
    end if;
    exit when ev.seq <> m.last_seq + 1;
    insert into public.match_events (id, match_id, seq, type, payload, client_at)
    values (ev.id, mid, ev.seq, ev.type, ev.payload, ev.at);
    m.last_seq := ev.seq;
  end loop;

  update public.matches
  set status = p_match ->> 'status', summary = coalesce(p_match -> 'summary', '{}'), last_seq = m.last_seq, updated_at = now()
  where id = mid;
  return m.last_seq;
end $$;

create or replace function public.take_over_scoring(p_match uuid, p_device uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  synced int;
begin
  update public.matches set scoring_device = p_device
  where id = p_match and owner_id = (select auth.uid())
  returning last_seq into synced;
  if not found then
    raise exception 'not_owner';
  end if;
  return synced;
end $$;

create or replace function public.create_claim_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  token text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  insert into public.match_claims (token_hash, from_user, expires_at)
  values (encode(sha256(convert_to(token, 'UTF8')), 'hex'), (select auth.uid()), now() + interval '1 hour');
  return token;
end $$;

create or replace function public.claim_matches(p_token text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  guest uuid;
  moved int;
begin
  if uid is null or (select (auth.jwt() ->> 'is_anonymous')::boolean) is true then
    raise exception 'claim_invalid';
  end if;
  delete from public.match_claims
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and expires_at > now()
  returning from_user into guest;
  if guest is null then
    raise exception 'claim_invalid';
  end if;
  update public.matches set owner_id = uid where owner_id = guest;
  get diagnostics moved = row_count;
  return moved;
end $$;

create or replace function public.get_live_match(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'match', jsonb_build_object(
      'id', m.id,
      'code', m.code,
      'title', m.title,
      'teamA', m.team_a,
      'teamB', m.team_b,
      'status', m.status,
      'updatedAt', to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'events', coalesce(
      (select jsonb_agg(public.match_event_json(e) order by e.seq) from public.match_events e where e.match_id = m.id),
      '[]'::jsonb
    )
  )
  from public.matches m
  where m.code = p_code and m.visibility = 'link';
$$;

create or replace function public.match_events_after(p_match uuid, p_after int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.event order by x.seq), '[]'::jsonb)
  from (
    select public.match_event_json(e) as event, e.seq
    from public.match_events e
    where e.match_id = p_match and e.seq > p_after
    order by e.seq
    limit 1000
  ) x;
$$;

create or replace function public.get_live_events(p_code text, p_after int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select public.match_events_after(m.id, p_after) from public.matches m where m.code = p_code and m.visibility = 'link'),
    '[]'::jsonb
  );
$$;

create or replace function public.get_owner_events(p_match uuid, p_after int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.matches m where m.id = p_match and m.owner_id = (select auth.uid())) then
    raise exception 'not_owner';
  end if;
  return public.match_events_after(p_match, p_after);
end $$;

revoke execute on function
  public.match_event_json(public.match_events),
  public.match_events_after(uuid, int),
  public.push_match_events(jsonb, uuid, jsonb),
  public.take_over_scoring(uuid, uuid),
  public.create_claim_token(),
  public.claim_matches(text),
  public.get_live_match(text),
  public.get_live_events(text, int),
  public.get_owner_events(uuid, int)
from public, anon, authenticated;

grant execute on function
  public.push_match_events(jsonb, uuid, jsonb),
  public.take_over_scoring(uuid, uuid),
  public.create_claim_token(),
  public.claim_matches(text),
  public.get_owner_events(uuid, int)
to authenticated;

grant execute on function public.get_live_match(text), public.get_live_events(text, int) to anon, authenticated;

-- ==== 20261023000003_realtime.sql ====
create or replace function public.broadcast_match_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(public.match_event_json(new), 'event', 'match:' || new.match_id::text, true);
  return null;
end $$;

create trigger match_events_broadcast after insert on public.match_events
  for each row execute function public.broadcast_match_event();

create or replace function public.match_topic_readable(topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if topic is null or topic !~ '^match:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from public.matches m where m.id = substr(topic, 7)::uuid and m.visibility = 'link'
  );
end $$;

create policy match_topic_read on realtime.messages for select to anon, authenticated
  using (public.match_topic_readable((select realtime.topic())));

revoke execute on function public.broadcast_match_event(), public.match_topic_readable(text) from public, anon, authenticated;
grant execute on function public.match_topic_readable(text) to anon, authenticated;

-- ==== 20261023000004_claim_purge.sql ====
create or replace function public.create_claim_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  token text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  delete from public.match_claims
  where from_user = (select auth.uid()) or expires_at <= now();
  insert into public.match_claims (token_hash, from_user, expires_at)
  values (encode(sha256(convert_to(token, 'UTF8')), 'hex'), (select auth.uid()), now() + interval '1 hour');
  return token;
end $$;

revoke execute on function public.create_claim_token() from public, anon, authenticated;
grant execute on function public.create_claim_token() to authenticated;
