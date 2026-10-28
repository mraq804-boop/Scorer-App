create or replace function public.set_team_colour(p_colour text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
begin
  if p_colour is not null
     and p_colour not in ('emerald', 'ocean', 'royal', 'violet', 'crimson', 'tangerine', 'magenta', 'teal', 'sky', 'charcoal') then
    raise exception 'invalid_colour';
  end if;
  tid := public.lock_owned_team();
  update public.teams t set colour = p_colour where t.id = tid;
end $$;

create or replace function public.owned_team_media_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from storage.objects o
  where o.bucket_id = 'team-media'
    and (storage.foldername(o.name))[1] = 'teams'
    and (storage.foldername(o.name))[2] = public.owned_team_code();
$$;

drop policy team_media_owner_insert on storage.objects;

create policy team_media_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-media'
    and (storage.foldername(name))[1] = 'teams'
    and (storage.foldername(name))[2] = (select public.owned_team_code())
    and (select public.owned_team_media_count()) < 100
  );

revoke execute on function public.set_team_colour(text), public.owned_team_media_count() from public, anon, authenticated;
grant execute on function public.set_team_colour(text), public.owned_team_media_count() to authenticated;
