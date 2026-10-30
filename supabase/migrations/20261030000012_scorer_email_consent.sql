drop function public.accept_email_invites();

alter table public.squad_scorer_emails drop constraint squad_scorer_emails_email_check;
alter table public.squad_scorer_emails add constraint squad_scorer_emails_email_check
  check (char_length(email) <= 254 and email ~ '^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$');

create or replace function public.verified_google_users(p_email text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct i.user_id
  from auth.identities i
  where i.provider = 'google'
    and i.email = p_email
    and i.identity_data -> 'email_verified' = 'true'::jsonb;
$$;

create or replace function public.my_google_emails() returns setof text
language sql stable security definer set search_path = '' as $$
  select distinct i.email
  from auth.identities i
  where (select (auth.jwt() ->> 'is_anonymous')::boolean) is not true
    and i.user_id = (select auth.uid())
    and i.provider = 'google'
    and i.identity_data -> 'email_verified' = 'true'::jsonb;
$$;

create or replace function public.set_player_scorer_email(p_player uuid, p_email text, p_can_score boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
  normal text := nullif(lower(btrim(p_email)), '');
  allowed boolean := coalesce(p_can_score, false);
  previous text;
  was_allowed boolean;
begin
  tid := public.lock_owned_team();
  if not exists (select 1 from public.squad_players p where p.team_id = tid and p.id = p_player) then
    raise exception 'not_team_owner';
  end if;
  if normal is not null and (char_length(normal) > 254 or normal !~ '^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$') then
    raise exception 'invalid_email';
  end if;
  if normal is not null and exists (
    select 1 from public.squad_scorer_emails e where e.team_id = tid and e.email = normal and e.player_id <> p_player
  ) then
    raise exception 'email_taken';
  end if;

  select e.email, e.can_score into previous, was_allowed
  from public.squad_scorer_emails e where e.team_id = tid and e.player_id = p_player;
  if was_allowed and (previous is distinct from normal or not allowed) then
    delete from public.team_scorers s
    where s.team_id = tid and s.user_id in (select public.verified_google_users(previous));
  end if;

  if normal is null then
    delete from public.squad_scorer_emails e where e.team_id = tid and e.player_id = p_player;
    return;
  end if;
  insert into public.squad_scorer_emails as e (team_id, player_id, email, can_score)
  values (tid, p_player, normal, allowed)
  on conflict (team_id, player_id) do update set email = excluded.email, can_score = excluded.can_score, updated_at = now();
end $$;

create or replace function public.get_email_invites() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'colour', t.colour, 'logoVersion', t.logo_version) order by t.name, t.code),
    '[]'::jsonb
  )
  from public.teams t
  where t.owner_id <> (select auth.uid())
    and exists (
      select 1 from public.squad_scorer_emails e
      where e.team_id = t.id and e.can_score and e.email in (select public.my_google_emails())
    )
    and not exists (select 1 from public.team_scorers s where s.team_id = t.id and s.user_id = (select auth.uid()));
$$;

create or replace function public.accept_email_invite(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  max_scorers constant int := 10;
  uid uuid := (select auth.uid());
  tid uuid;
begin
  select t.id into tid
  from public.teams t
  where t.code = p_code
    and t.owner_id <> uid
    and exists (
      select 1 from public.squad_scorer_emails e
      where e.team_id = t.id and e.can_score and e.email in (select public.my_google_emails())
    )
  for no key update;
  if tid is null then
    raise exception 'invite_invalid';
  end if;
  if not exists (select 1 from public.team_scorers s where s.team_id = tid and s.user_id = uid)
     and (select count(*) from public.team_scorers s where s.team_id = tid) >= max_scorers then
    raise exception 'quota_exceeded';
  end if;
  insert into public.team_scorers as s (team_id, user_id, display_name)
  values (tid, uid, public.google_display_name(uid))
  on conflict (team_id, user_id) do update set display_name = coalesce(excluded.display_name, s.display_name);
  return p_code;
end $$;

create or replace function public.remove_scorer(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
begin
  tid := public.lock_owned_team();
  delete from public.team_scorers s where s.team_id = tid and s.user_id = p_user;
  update public.squad_scorer_emails e set can_score = false, updated_at = now()
  where e.team_id = tid
    and e.can_score
    and e.email in (select i.email from auth.identities i where i.user_id = p_user and i.provider = 'google');
end $$;

revoke execute on function
  public.my_google_emails(),
  public.get_email_invites(),
  public.accept_email_invite(text)
from public, anon, authenticated;

grant execute on function
  public.get_email_invites(),
  public.accept_email_invite(text)
to authenticated;
