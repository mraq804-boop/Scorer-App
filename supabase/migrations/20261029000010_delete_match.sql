create or replace function public.delete_match(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
  mid uuid;
begin
  tid := public.lock_owned_team();
  update public.matches m set visibility = 'private', fixture_id = null
  where m.code = p_code and m.team_id = tid
  returning m.id into mid;
  if not found then
    raise exception 'not_team_owner';
  end if;
  update public.fixtures f set match_id = null, status = case when f.status = 'played' then 'scheduled' else f.status end
  where f.match_id = mid and f.team_id = tid;
end $$;

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
      if m.visibility = 'link' then
        update public.fixtures f set status = 'played', match_id = mid
        where f.id = m.fixture_id and f.team_id = m.team_id;
        if not found then
          m.fixture_id := null;
        end if;
      else
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

revoke execute on function public.delete_match(text) from public, anon, authenticated;
grant execute on function public.delete_match(text) to authenticated;
