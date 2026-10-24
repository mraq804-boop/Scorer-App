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
  uid uuid := (select auth.uid());
  mid uuid;
  m public.matches;
  ev record;
  malformed boolean;
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
    select bool_or(x.id is null or x.seq is null or x.seq < 1 or x.at is null or x.type is null or x.payload is null)
    into malformed
    from jsonb_to_recordset(p_events)
      as x(id uuid, seq int, at timestamptz, type public.match_event_type, payload public.match_event_payload);
  exception when others then
    malformed := true;
  end;
  if malformed then
    raise exception 'invalid_event';
  end if;

  mid := (p_match ->> 'id')::uuid;
  select * into m from public.matches where id = mid for update;
  if not found then
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

create or replace function public.get_live_events(p_code text, p_after int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.event order by x.seq), '[]'::jsonb)
  from (
    select public.match_event_json(e) as event, e.seq
    from public.match_events e
    join public.matches m on m.id = e.match_id
    where m.code = p_code and m.visibility = 'link' and e.seq > p_after
    order by e.seq
    limit 1000
  ) x;
$$;

revoke execute on function
  public.match_event_json(public.match_events),
  public.push_match_events(jsonb, uuid, jsonb),
  public.take_over_scoring(uuid, uuid),
  public.create_claim_token(),
  public.claim_matches(text),
  public.get_live_match(text),
  public.get_live_events(text, int)
from public, anon, authenticated;

grant execute on function
  public.push_match_events(jsonb, uuid, jsonb),
  public.take_over_scoring(uuid, uuid),
  public.create_claim_token(),
  public.claim_matches(text)
to authenticated;

grant execute on function public.get_live_match(text), public.get_live_events(text, int) to anon, authenticated;
