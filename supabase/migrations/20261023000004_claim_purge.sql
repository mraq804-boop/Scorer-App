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
