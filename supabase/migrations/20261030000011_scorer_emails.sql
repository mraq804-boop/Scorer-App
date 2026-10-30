create table public.squad_scorer_emails (
  team_id uuid not null,
  player_id uuid not null,
  email text not null check (char_length(email) <= 254 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  can_score boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (team_id, player_id),
  unique (team_id, email),
  foreign key (team_id, player_id) references public.squad_players (team_id, id) on delete cascade
);
create index squad_scorer_emails_email_idx on public.squad_scorer_emails (email) where can_score;

alter table public.squad_scorer_emails enable row level security;
revoke all on table public.squad_scorer_emails from anon, authenticated;

create or replace function public.verified_google_users(p_email text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct i.user_id
  from auth.identities i
  where i.provider = 'google'
    and lower(i.identity_data ->> 'email') = p_email
    and (i.identity_data ->> 'email_verified')::boolean is not false;
$$;

create or replace function public.set_player_scorer_email(p_player uuid, p_email text, p_can_score boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  max_scorers constant int := 10;
  uid uuid := (select auth.uid());
  tid uuid;
  normal text := nullif(lower(btrim(p_email)), '');
  allowed boolean := coalesce(p_can_score, false);
  previous text;
begin
  tid := public.lock_owned_team();
  if not exists (select 1 from public.squad_players p where p.team_id = tid and p.id = p_player) then
    raise exception 'not_team_owner';
  end if;
  if normal is not null and (char_length(normal) > 254 or normal !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email';
  end if;
  if normal is not null and exists (
    select 1 from public.squad_scorer_emails e where e.team_id = tid and e.email = normal and e.player_id <> p_player
  ) then
    raise exception 'email_taken';
  end if;

  select e.email into previous from public.squad_scorer_emails e where e.team_id = tid and e.player_id = p_player;
  if previous is not null and (previous is distinct from normal or not allowed) then
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

  if allowed and (select count(*) from public.team_scorers s where s.team_id = tid) < max_scorers then
    insert into public.team_scorers (team_id, user_id, display_name)
    select tid, u.id, public.google_display_name(u.id)
    from public.verified_google_users(normal) as u(id)
    where u.id <> uid
    on conflict (team_id, user_id) do nothing;
  end if;
end $$;

create or replace function public.get_scorer_emails() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tid uuid;
begin
  if (select (auth.jwt() ->> 'is_anonymous')::boolean) is not true then
    select t.id into tid from public.teams t where t.owner_id = (select auth.uid());
  end if;
  if tid is null then
    raise exception 'not_team_owner';
  end if;
  return coalesce(
    (select jsonb_agg(jsonb_build_object(
              'playerId', e.player_id,
              'email', e.email,
              'canScore', e.can_score,
              'joined', exists (
                select 1 from public.team_scorers s
                where s.team_id = tid and s.user_id in (select public.verified_google_users(e.email))
              )
            ) order by e.updated_at, e.player_id)
     from public.squad_scorer_emails e
     where e.team_id = tid),
    '[]'::jsonb
  );
end $$;

create or replace function public.accept_email_invites() returns int
language plpgsql security definer set search_path = '' as $$
declare
  max_scorers constant int := 10;
  uid uuid := (select auth.uid());
  joined int := 0;
  tid uuid;
begin
  if uid is null or (select (auth.jwt() ->> 'is_anonymous')::boolean) is true then
    return 0;
  end if;
  for tid in
    select distinct e.team_id
    from public.squad_scorer_emails e
    join public.teams t on t.id = e.team_id
    where e.can_score
      and t.owner_id <> uid
      and uid in (select public.verified_google_users(e.email))
      and not exists (select 1 from public.team_scorers s where s.team_id = e.team_id and s.user_id = uid)
  loop
    perform 1 from public.teams t where t.id = tid for no key update;
    if (select count(*) from public.team_scorers s where s.team_id = tid) < max_scorers then
      insert into public.team_scorers (team_id, user_id, display_name)
      values (tid, uid, public.google_display_name(uid))
      on conflict (team_id, user_id) do nothing;
      if found then
        joined := joined + 1;
      end if;
    end if;
  end loop;
  return joined;
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
    and p_user in (select public.verified_google_users(e.email));
end $$;

revoke execute on function
  public.verified_google_users(text),
  public.set_player_scorer_email(uuid, text, boolean),
  public.get_scorer_emails(),
  public.accept_email_invites()
from public, anon, authenticated;

grant execute on function
  public.set_player_scorer_email(uuid, text, boolean),
  public.get_scorer_emails(),
  public.accept_email_invites()
to authenticated;
