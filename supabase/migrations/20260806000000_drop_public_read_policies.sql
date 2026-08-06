-- Security fix: drop blanket public-read policies.
-- They predate the `visibility` column and let anyone holding the public
-- anon key read private-repo wikis (overview, feature markdown, source-code
-- chunks, challenges) directly via the Supabase REST API, bypassing the
-- app's GitHub-permission checks. The app only ever reads these tables
-- through the service-role client (which bypasses RLS), so anon/authenticated
-- roles need no select access at all.
drop policy if exists "Allow public read on wikis" on public.wikis;
drop policy if exists "Allow public read on features" on public.features;
drop policy if exists "Allow public read on chunks" on public.chunks;
drop policy if exists "Allow public read on challenges" on public.challenges;

-- Belt-and-braces: match_chunks is SECURITY INVOKER so it now returns no
-- rows for anon callers, but revoke direct RPC access anyway.
revoke execute on function public.match_chunks(vector, uuid, int, float) from anon, authenticated;
