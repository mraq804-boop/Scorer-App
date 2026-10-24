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
