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
