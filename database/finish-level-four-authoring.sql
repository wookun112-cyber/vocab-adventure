-- Retain private editorial audit data; remove temporary public authoring capabilities.
drop function if exists public.claim_level_four_authoring(uuid,uuid);
drop function if exists public.finish_level_four_authoring(uuid,uuid,uuid,jsonb,jsonb);
update vocab_private.level_four_authoring_jobs set expires_at=least(expires_at,now()),capability=gen_random_uuid(),lease=null;
revoke all on vocab_private.level_four_authoring_jobs from public,anon,authenticated;
