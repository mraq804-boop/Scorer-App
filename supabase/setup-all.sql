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

-- ==== 20261027000005_teams.sql ====
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users on delete cascade,
  code text not null unique check (code ~ '^[a-hjkmnp-z2-9]{8}$'),
  name text not null check (char_length(name) between 1 and 40),
  home_ground text check (char_length(home_ground) between 1 and 60),
  time_zone text not null default 'Asia/Karachi' check (char_length(time_zone) between 1 and 64),
  created_at timestamptz not null default now()
);

create table public.team_scorers (
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_scorers_user_idx on public.team_scorers (user_id);

create table public.team_invites (
  token_hash text primary key,
  team_id uuid not null references public.teams on delete cascade,
  expires_at timestamptz not null
);
create index team_invites_team_idx on public.team_invites (team_id);

create table public.squad_players (
  team_id uuid not null references public.teams on delete cascade,
  id uuid not null,
  name text not null check (char_length(name) between 1 and 40),
  role text check (role in ('batter', 'bowler', 'allrounder', 'keeper')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (team_id, id)
);

create table public.seasons (
  id uuid primary key,
  team_id uuid not null references public.teams on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  starts_on date not null,
  ends_on date not null,
  check (ends_on >= starts_on)
);
create index seasons_team_idx on public.seasons (team_id);

create table public.fixtures (
  id uuid primary key,
  team_id uuid not null references public.teams on delete cascade,
  starts_at timestamptz not null,
  opponent text not null check (char_length(opponent) between 1 and 40),
  ground text check (char_length(ground) between 1 and 60),
  home_away text check (home_away in ('home', 'away')),
  overs int check (overs between 1 and 100),
  notes text check (char_length(notes) between 1 and 280),
  status text not null default 'scheduled' check (status in ('scheduled', 'played', 'cancelled')),
  match_id uuid references public.matches on delete set null
);
create index fixtures_team_idx on public.fixtures (team_id, starts_at);

alter table public.matches
  add column team_id uuid references public.teams on delete set null,
  add column team_side text check (team_side in ('A', 'B')),
  add column fixture_id uuid references public.fixtures on delete set null,
  add column player_stats jsonb constraint matches_player_stats_size check (octet_length(player_stats::text) <= 16384),
  add column potm_player_id uuid,
  add column result_override text check (result_override is null or result_override = 'no_result');
create index matches_team_idx on public.matches (team_id, created_at) where team_id is not null;
create index matches_fixture_idx on public.matches (fixture_id) where fixture_id is not null;

do $$
declare t text;
begin
  foreach t in array array['teams', 'team_scorers', 'team_invites', 'squad_players', 'seasons', 'fixtures'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke insert, update, delete, truncate
  on public.teams, public.team_scorers, public.team_invites, public.squad_players, public.seasons, public.fixtures
  from anon, authenticated;

create or replace function public.my_team_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.teams t where t.owner_id = (select auth.uid())
  union
  select s.team_id from public.team_scorers s where s.user_id = (select auth.uid());
$$;

create policy teams_member_read on public.teams for select to authenticated
  using (id in (select public.my_team_ids()));
create policy team_scorers_member_read on public.team_scorers for select to authenticated
  using (user_id = (select auth.uid()) or team_id in (select t.id from public.teams t where t.owner_id = (select auth.uid())));
create policy squad_players_member_read on public.squad_players for select to authenticated
  using (team_id in (select public.my_team_ids()));
create policy seasons_member_read on public.seasons for select to authenticated
  using (team_id in (select public.my_team_ids()));
create policy fixtures_member_read on public.fixtures for select to authenticated
  using (team_id in (select public.my_team_ids()));

create or replace function public.lock_owned_team() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
begin
  if (select (auth.jwt() ->> 'is_anonymous')::boolean) is not true then
    select t.id into tid from public.teams t where t.owner_id = (select auth.uid()) for no key update;
  end if;
  if tid is null then
    raise exception 'not_team_owner';
  end if;
  return tid;
end $$;

create or replace function public.team_squad_json(p_team uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role, 'active', p.active) order by p.created_at, p.name, p.id),
    '[]'::jsonb
  )
  from public.squad_players p
  where p.team_id = p_team;
$$;

create or replace function public.team_seasons_json(p_team uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'startsOn', s.starts_on, 'endsOn', s.ends_on) order by s.starts_on, s.id),
    '[]'::jsonb
  )
  from public.seasons s
  where s.team_id = p_team;
$$;

create or replace function public.fixture_json(f public.fixtures) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', f.id,
    'startsAt', to_char(f.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'opponent', f.opponent,
    'ground', f.ground,
    'homeAway', f.home_away,
    'overs', f.overs,
    'status', f.status,
    'matchCode', (select m.code from public.matches m where m.id = f.match_id and m.visibility = 'link')
  );
$$;

create or replace function public.create_team(p_name text, p_home_ground text, p_time_zone text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  uid uuid := (select auth.uid());
  zone text := coalesce(p_time_zone, 'Asia/Karachi');
  bytes bytea;
  new_code text;
begin
  if uid is null or (select (auth.jwt() ->> 'is_anonymous')::boolean) is true then
    raise exception 'not_team_owner';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = zone) then
    raise exception 'invalid_time_zone';
  end if;
  loop
    bytes := sha256(uuid_send(gen_random_uuid()));
    select string_agg(substr(alphabet, get_byte(bytes, i) % 31 + 1, 1), '' order by i) into new_code
    from generate_series(0, 7) i;
    insert into public.teams (owner_id, code, name, home_ground, time_zone)
    values (uid, new_code, p_name, nullif(p_home_ground, ''), zone)
    on conflict do nothing;
    exit when found;
    if exists (select 1 from public.teams t where t.owner_id = uid) then
      raise exception 'team_exists';
    end if;
  end loop;
  return new_code;
end $$;

create or replace function public.upsert_squad_players(p_team uuid, p_players jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  max_squad constant int := 60;
  is_owner boolean;
  written int;
begin
  select t.owner_id = (select auth.uid()) into is_owner
  from public.teams t
  where t.id = p_team and t.id in (select public.my_team_ids())
  for no key update;
  if is_owner is null then
    raise exception 'not_team_owner';
  end if;
  insert into public.squad_players as s (team_id, id, name, role, active)
  select distinct on (x.id) p_team, x.id, x.name, x.role, coalesce(x.active, true)
  from rows from (jsonb_to_recordset(p_players) as (id uuid, name text, role text, active boolean))
    with ordinality as x(id, name, role, active, n)
  order by x.id, x.n desc
  on conflict (team_id, id) do update set name = excluded.name, role = excluded.role, active = excluded.active
  where is_owner
    and (s.name, s.role, s.active) is distinct from (excluded.name, excluded.role, excluded.active);
  get diagnostics written = row_count;
  if (select count(*) from public.squad_players p where p.team_id = p_team) > max_squad then
    raise exception 'quota_exceeded';
  end if;
  return written;
end $$;

create or replace function public.upsert_season(p_season jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  max_seasons constant int := 30;
  tid uuid;
  sid uuid;
begin
  tid := public.lock_owned_team();
  insert into public.seasons as s (id, team_id, name, starts_on, ends_on)
  select coalesce(x.id, gen_random_uuid()), tid, x.name, x."startsOn", x."endsOn"
  from jsonb_to_record(p_season) as x(id uuid, name text, "startsOn" date, "endsOn" date)
  on conflict (id) do update set name = excluded.name, starts_on = excluded.starts_on, ends_on = excluded.ends_on
  where s.team_id = excluded.team_id
  returning s.id into sid;
  if sid is null then
    raise exception 'not_team_owner';
  end if;
  if (select count(*) from public.seasons s where s.team_id = tid) > max_seasons then
    raise exception 'quota_exceeded';
  end if;
  return sid;
end $$;

create or replace function public.upsert_fixture(p_fixture jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  max_fixtures constant int := 300;
  tid uuid;
  fid uuid;
begin
  tid := public.lock_owned_team();
  insert into public.fixtures as f (id, team_id, starts_at, opponent, ground, home_away, overs, notes, status)
  select coalesce(x.id, gen_random_uuid()), tid, x."startsAt", x.opponent, nullif(x.ground, ''), x."homeAway", x.overs,
         nullif(x.notes, ''), coalesce(x.status, 'scheduled')
  from jsonb_to_record(p_fixture)
    as x(id uuid, "startsAt" timestamptz, opponent text, ground text, "homeAway" text, overs int, notes text, status text)
  on conflict (id) do update set starts_at = excluded.starts_at, opponent = excluded.opponent, ground = excluded.ground,
    home_away = excluded.home_away, overs = excluded.overs, notes = excluded.notes, status = excluded.status
  where f.team_id = excluded.team_id
  returning f.id into fid;
  if fid is null then
    raise exception 'not_team_owner';
  end if;
  if (select count(*) from public.fixtures f where f.team_id = tid) > max_fixtures then
    raise exception 'quota_exceeded';
  end if;
  return fid;
end $$;

create or replace function public.set_potm(p_code text, p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
  xi jsonb;
begin
  tid := public.lock_owned_team();
  select m.player_stats -> 'xi' into xi from public.matches m where m.code = p_code and m.team_id = tid for update;
  if not found then
    raise exception 'not_team_owner';
  end if;
  if p_player is not null and not coalesce(xi ? p_player::text, false) then
    raise exception 'not_in_xi';
  end if;
  update public.matches m set potm_player_id = p_player where m.code = p_code;
end $$;

create or replace function public.set_result_override(p_code text, p_no_result boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
begin
  tid := public.lock_owned_team();
  update public.matches m set result_override = case when p_no_result then 'no_result' end
  where m.code = p_code and m.team_id = tid;
  if not found then
    raise exception 'not_team_owner';
  end if;
end $$;

create or replace function public.create_scorer_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  max_live_invites constant int := 5;
  max_scorers constant int := 10;
  tid uuid;
  token text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  tid := public.lock_owned_team();
  delete from public.team_invites i where i.expires_at <= now();
  if (select count(*) from public.team_invites i where i.team_id = tid) >= max_live_invites
     or (select count(*) from public.team_scorers s where s.team_id = tid) >= max_scorers then
    raise exception 'quota_exceeded';
  end if;
  insert into public.team_invites (token_hash, team_id, expires_at)
  values (encode(sha256(convert_to(token, 'UTF8')), 'hex'), tid, now() + interval '7 days');
  return token;
end $$;

create or replace function public.accept_scorer_invite(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  max_scorers constant int := 10;
  uid uuid := (select auth.uid());
  tid uuid;
  team_code text;
begin
  if uid is null or (select (auth.jwt() ->> 'is_anonymous')::boolean) is true then
    raise exception 'invite_invalid';
  end if;
  delete from public.team_invites i
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and i.expires_at > now()
  returning i.team_id into tid;
  select t.code into team_code from public.teams t where t.id = tid and t.owner_id <> uid for no key update;
  if team_code is null then
    raise exception 'invite_invalid';
  end if;
  if not exists (select 1 from public.team_scorers s where s.team_id = tid and s.user_id = uid)
     and (select count(*) from public.team_scorers s where s.team_id = tid) >= max_scorers then
    raise exception 'quota_exceeded';
  end if;
  insert into public.team_scorers (team_id, user_id) values (tid, uid) on conflict do nothing;
  return team_code;
end $$;

create or replace function public.remove_scorer(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
begin
  tid := public.lock_owned_team();
  delete from public.team_scorers s where s.team_id = tid and s.user_id = p_user;
end $$;

create or replace function public.get_my_team() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  t public.teams;
  is_owner boolean;
begin
  select tm.* into t
  from public.teams tm
  left join public.team_scorers s on s.team_id = tm.id and s.user_id = uid
  where tm.owner_id = uid or s.user_id is not null
  order by tm.owner_id = uid desc, s.added_at desc
  limit 1;
  if not found then
    return null;
  end if;
  is_owner := t.owner_id = uid;
  return jsonb_build_object(
    'role', case when is_owner then 'owner' else 'scorer' end,
    'team', jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name, 'homeGround', t.home_ground, 'timeZone', t.time_zone),
    'squad', public.team_squad_json(t.id),
    'seasons', public.team_seasons_json(t.id),
    'fixtures', coalesce(
      (select jsonb_agg(public.fixture_json(f) || jsonb_build_object('notes', f.notes) order by f.starts_at, f.id)
       from public.fixtures f
       where f.team_id = t.id and f.starts_at >= now() - interval '30 days'),
      '[]'::jsonb
    )
  ) || case when is_owner then jsonb_build_object('scorers', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'userId', s.user_id,
                'addedAt', to_char(s.added_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
              ) order by s.added_at, s.user_id)
       from public.team_scorers s
       where s.team_id = t.id),
      '[]'::jsonb
    )) else '{}'::jsonb end;
end $$;

create or replace function public.get_team_page(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'team', jsonb_build_object('code', t.code, 'name', t.name, 'homeGround', t.home_ground, 'timeZone', t.time_zone),
    'squad', public.team_squad_json(t.id),
    'seasons', public.team_seasons_json(t.id),
    'fixtures', coalesce(
      (select jsonb_agg(public.fixture_json(f) order by f.starts_at, f.id)
       from public.fixtures f
       where f.team_id = t.id and f.status <> 'cancelled'),
      '[]'::jsonb
    ),
    'matches', coalesce(
      (select jsonb_agg(x.match order by x.created_at desc, x.id)
       from (
         select m.id, m.created_at, jsonb_build_object(
           'code', m.code,
           'status', m.status,
           'summary', m.summary,
           'resultOverride', m.result_override,
           'potmPlayerId', m.potm_player_id,
           'record', m.player_stats,
           'title', m.title
         ) as match
         from public.matches m
         where m.team_id = t.id and m.visibility = 'link'
         order by m.created_at desc, m.id
         limit 500
       ) x),
      '[]'::jsonb
    )
  )
  from public.teams t
  where t.code = p_code;
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
  max_record_bytes constant int := 16384;
  team_ref jsonb := p_match -> 'team';
  prev_team uuid;
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

  prev_team := m.team_id;
  if jsonb_typeof(team_ref) = 'object' then
    begin
      m.team_id := (team_ref ->> 'id')::uuid;
      m.fixture_id := (team_ref ->> 'fixtureId')::uuid;
    exception when others then
      m.team_id := null;
    end;
    if m.team_id is not null and team_ref ->> 'side' in ('A', 'B') and m.team_id in (select public.my_team_ids()) then
      m.team_side := team_ref ->> 'side';
      m.player_stats := case
        when jsonb_typeof(team_ref -> 'record') = 'object'
             and octet_length((team_ref -> 'record')::text) <= max_record_bytes then team_ref -> 'record'
      end;
      update public.fixtures f set status = 'played', match_id = mid
      where f.id = m.fixture_id and f.team_id = m.team_id;
      if not found then
        m.fixture_id := null;
      end if;
    else
      m.team_id := null;
      m.team_side := null;
      m.fixture_id := null;
      m.player_stats := null;
    end if;
  end if;
  if m.team_id is distinct from prev_team then
    m.potm_player_id := null;
    m.result_override := null;
  end if;

  update public.matches
  set status = p_match ->> 'status', summary = coalesce(p_match -> 'summary', '{}'), last_seq = m.last_seq, updated_at = now(),
      team_id = m.team_id, team_side = m.team_side, fixture_id = m.fixture_id, player_stats = m.player_stats,
      potm_player_id = m.potm_player_id, result_override = m.result_override
  where id = mid;
  return m.last_seq;
end $$;

revoke execute on function
  public.my_team_ids(),
  public.lock_owned_team(),
  public.team_squad_json(uuid),
  public.team_seasons_json(uuid),
  public.fixture_json(public.fixtures),
  public.create_team(text, text, text),
  public.upsert_squad_players(uuid, jsonb),
  public.upsert_season(jsonb),
  public.upsert_fixture(jsonb),
  public.set_potm(text, uuid),
  public.set_result_override(text, boolean),
  public.create_scorer_invite(),
  public.accept_scorer_invite(text),
  public.remove_scorer(uuid),
  public.get_my_team(),
  public.get_team_page(text),
  public.push_match_events(jsonb, uuid, jsonb)
from public, anon, authenticated;

grant execute on function
  public.my_team_ids(),
  public.create_team(text, text, text),
  public.upsert_squad_players(uuid, jsonb),
  public.upsert_season(jsonb),
  public.upsert_fixture(jsonb),
  public.set_potm(text, uuid),
  public.set_result_override(text, boolean),
  public.create_scorer_invite(),
  public.accept_scorer_invite(text),
  public.remove_scorer(uuid),
  public.get_my_team(),
  public.push_match_events(jsonb, uuid, jsonb)
to authenticated;

grant execute on function public.get_team_page(text) to anon, authenticated;

-- ==== 20261027000006_scorer_names.sql ====
alter table public.team_scorers add column display_name text check (char_length(display_name) between 1 and 80);

create or replace function public.google_display_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select left(coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), '')
  ), 80)
  from auth.users u
  where u.id = p_user;
$$;

update public.team_scorers s set display_name = public.google_display_name(s.user_id) where s.display_name is null;

create or replace function public.accept_scorer_invite(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  max_scorers constant int := 10;
  uid uuid := (select auth.uid());
  tid uuid;
  team_code text;
begin
  if uid is null or (select (auth.jwt() ->> 'is_anonymous')::boolean) is true then
    raise exception 'invite_invalid';
  end if;
  delete from public.team_invites i
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and i.expires_at > now()
  returning i.team_id into tid;
  select t.code into team_code from public.teams t where t.id = tid and t.owner_id <> uid for no key update;
  if team_code is null then
    raise exception 'invite_invalid';
  end if;
  if not exists (select 1 from public.team_scorers s where s.team_id = tid and s.user_id = uid)
     and (select count(*) from public.team_scorers s where s.team_id = tid) >= max_scorers then
    raise exception 'quota_exceeded';
  end if;
  insert into public.team_scorers as s (team_id, user_id, display_name)
  values (tid, uid, public.google_display_name(uid))
  on conflict (team_id, user_id) do update set display_name = coalesce(excluded.display_name, s.display_name);
  return team_code;
end $$;

create or replace function public.get_my_team() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  t public.teams;
  is_owner boolean;
begin
  select tm.* into t
  from public.teams tm
  left join public.team_scorers s on s.team_id = tm.id and s.user_id = uid
  where tm.owner_id = uid or s.user_id is not null
  order by tm.owner_id = uid desc, s.added_at desc
  limit 1;
  if not found then
    return null;
  end if;
  is_owner := t.owner_id = uid;
  return jsonb_build_object(
    'role', case when is_owner then 'owner' else 'scorer' end,
    'team', jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name, 'homeGround', t.home_ground, 'timeZone', t.time_zone),
    'squad', public.team_squad_json(t.id),
    'seasons', public.team_seasons_json(t.id),
    'fixtures', coalesce(
      (select jsonb_agg(public.fixture_json(f) || jsonb_build_object('notes', f.notes) order by f.starts_at, f.id)
       from public.fixtures f
       where f.team_id = t.id and f.starts_at >= now() - interval '30 days'),
      '[]'::jsonb
    )
  ) || case when is_owner then jsonb_build_object('scorers', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'userId', s.user_id,
                'name', s.display_name,
                'addedAt', to_char(s.added_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
              ) order by s.added_at, s.user_id)
       from public.team_scorers s
       where s.team_id = t.id),
      '[]'::jsonb
    )) else '{}'::jsonb end;
end $$;

revoke execute on function
  public.google_display_name(uuid),
  public.accept_scorer_invite(text),
  public.get_my_team()
from public, anon, authenticated;

grant execute on function
  public.accept_scorer_invite(text),
  public.get_my_team()
to authenticated;

-- ==== 20261027000007_update_team.sql ====
create or replace function public.update_team(p_name text, p_home_ground text, p_time_zone text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
begin
  tid := public.lock_owned_team();
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_time_zone) then
    raise exception 'invalid_time_zone';
  end if;
  update public.teams t
  set name = p_name, home_ground = nullif(p_home_ground, ''), time_zone = p_time_zone
  where t.id = tid;
end $$;

revoke execute on function public.update_team(text, text, text) from public, anon, authenticated;
grant execute on function public.update_team(text, text, text) to authenticated;

-- ==== 20261028000008_team_brand.sql ====
alter table public.teams
  add column colour text check (colour in ('emerald', 'ocean', 'royal', 'violet', 'crimson', 'tangerine', 'magenta', 'teal', 'sky', 'charcoal')),
  add column logo_version int check (logo_version > 0);

alter table public.squad_players add column photo_version int check (photo_version > 0);

create or replace function public.set_team_colour(p_colour text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
begin
  tid := public.lock_owned_team();
  update public.teams t set colour = p_colour where t.id = tid;
end $$;

create or replace function public.set_team_logo(p_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
begin
  tid := public.lock_owned_team();
  update public.teams t set logo_version = p_version where t.id = tid;
end $$;

create or replace function public.set_player_photo(p_player uuid, p_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
begin
  tid := public.lock_owned_team();
  update public.squad_players p set photo_version = p_version where p.team_id = tid and p.id = p_player;
  if not found then
    raise exception 'not_team_owner';
  end if;
end $$;

create or replace function public.owned_team_code() returns text
language sql stable security definer set search_path = '' as $$
  select t.code
  from public.teams t
  where t.owner_id = (select auth.uid())
    and (select (auth.jwt() ->> 'is_anonymous')::boolean) is not true;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-media', 'team-media', true, 307200, '{image/jpeg}')
on conflict (id) do update
set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy team_media_owner_select on storage.objects for select to authenticated
  using (
    bucket_id = 'team-media'
    and (storage.foldername(name))[1] = 'teams'
    and (storage.foldername(name))[2] = (select public.owned_team_code())
  );

create policy team_media_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-media'
    and (storage.foldername(name))[1] = 'teams'
    and (storage.foldername(name))[2] = (select public.owned_team_code())
  );

create policy team_media_owner_update on storage.objects for update to authenticated
  using (
    bucket_id = 'team-media'
    and (storage.foldername(name))[1] = 'teams'
    and (storage.foldername(name))[2] = (select public.owned_team_code())
  )
  with check (
    bucket_id = 'team-media'
    and (storage.foldername(name))[1] = 'teams'
    and (storage.foldername(name))[2] = (select public.owned_team_code())
  );

create policy team_media_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'team-media'
    and (storage.foldername(name))[1] = 'teams'
    and (storage.foldername(name))[2] = (select public.owned_team_code())
  );

create or replace function public.team_squad_json(p_team uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role, 'active', p.active)
        || case when p.photo_version is null then '{}'::jsonb else jsonb_build_object('photoVersion', p.photo_version) end
      order by p.created_at, p.name, p.id
    ),
    '[]'::jsonb
  )
  from public.squad_players p
  where p.team_id = p_team;
$$;

create or replace function public.get_team_page(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'team', jsonb_build_object(
      'code', t.code,
      'name', t.name,
      'homeGround', t.home_ground,
      'timeZone', t.time_zone,
      'colour', t.colour,
      'logoVersion', t.logo_version
    ),
    'squad', public.team_squad_json(t.id),
    'seasons', public.team_seasons_json(t.id),
    'fixtures', coalesce(
      (select jsonb_agg(public.fixture_json(f) order by f.starts_at, f.id)
       from public.fixtures f
       where f.team_id = t.id and f.status <> 'cancelled'),
      '[]'::jsonb
    ),
    'matches', coalesce(
      (select jsonb_agg(x.match order by x.created_at desc, x.id)
       from (
         select m.id, m.created_at, jsonb_build_object(
           'code', m.code,
           'status', m.status,
           'summary', m.summary,
           'resultOverride', m.result_override,
           'potmPlayerId', m.potm_player_id,
           'record', m.player_stats,
           'title', m.title
         ) as match
         from public.matches m
         where m.team_id = t.id and m.visibility = 'link'
         order by m.created_at desc, m.id
         limit 500
       ) x),
      '[]'::jsonb
    )
  )
  from public.teams t
  where t.code = p_code;
$$;

create or replace function public.get_my_team() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  t public.teams;
  is_owner boolean;
begin
  select tm.* into t
  from public.teams tm
  left join public.team_scorers s on s.team_id = tm.id and s.user_id = uid
  where tm.owner_id = uid or s.user_id is not null
  order by tm.owner_id = uid desc, s.added_at desc
  limit 1;
  if not found then
    return null;
  end if;
  is_owner := t.owner_id = uid;
  return jsonb_build_object(
    'role', case when is_owner then 'owner' else 'scorer' end,
    'team', jsonb_build_object(
      'id', t.id,
      'code', t.code,
      'name', t.name,
      'homeGround', t.home_ground,
      'timeZone', t.time_zone,
      'colour', t.colour,
      'logoVersion', t.logo_version
    ),
    'squad', public.team_squad_json(t.id),
    'seasons', public.team_seasons_json(t.id),
    'fixtures', coalesce(
      (select jsonb_agg(public.fixture_json(f) || jsonb_build_object('notes', f.notes) order by f.starts_at, f.id)
       from public.fixtures f
       where f.team_id = t.id and f.starts_at >= now() - interval '30 days'),
      '[]'::jsonb
    )
  ) || case when is_owner then jsonb_build_object('scorers', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'userId', s.user_id,
                'name', s.display_name,
                'addedAt', to_char(s.added_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
              ) order by s.added_at, s.user_id)
       from public.team_scorers s
       where s.team_id = t.id),
      '[]'::jsonb
    )) else '{}'::jsonb end;
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
      'updatedAt', to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'team', (
        select jsonb_build_object(
          'code', t.code,
          'name', t.name,
          'colour', t.colour,
          'logoVersion', t.logo_version,
          'side', m.team_side,
          'potmPlayerId', m.potm_player_id,
          'resultOverride', m.result_override,
          'xi', coalesce(m.player_stats -> 'xi', '[]'::jsonb),
          'photos', coalesce(
            (select jsonb_object_agg(p.id::text, p.photo_version)
             from public.squad_players p
             where p.team_id = t.id
               and p.photo_version is not null
               and coalesce(m.player_stats -> 'xi', '[]'::jsonb) ? p.id::text),
            '{}'::jsonb
          )
        )
        from public.teams t
        where t.id = m.team_id
      )
    ),
    'events', coalesce(
      (select jsonb_agg(public.match_event_json(e) order by e.seq) from public.match_events e where e.match_id = m.id),
      '[]'::jsonb
    )
  )
  from public.matches m
  where m.code = p_code and m.visibility = 'link';
$$;

revoke execute on function
  public.set_team_colour(text),
  public.set_team_logo(int),
  public.set_player_photo(uuid, int),
  public.owned_team_code(),
  public.team_squad_json(uuid),
  public.get_team_page(text),
  public.get_my_team(),
  public.get_live_match(text)
from public, anon, authenticated;

grant execute on function
  public.set_team_colour(text),
  public.set_team_logo(int),
  public.set_player_photo(uuid, int),
  public.owned_team_code(),
  public.get_my_team()
to authenticated;

grant execute on function public.get_team_page(text), public.get_live_match(text) to anon, authenticated;
