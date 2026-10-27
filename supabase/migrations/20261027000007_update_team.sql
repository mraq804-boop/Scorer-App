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
