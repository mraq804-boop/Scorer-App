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
