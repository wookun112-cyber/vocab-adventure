-- Capability + exact lease authorization, including the previous fallback RPC.
-- Store only bounded diagnostics, never a learner answer or a credential.
create or replace function vocab_private.report_preparation_failure(p_id uuid,p_key uuid,p_lease uuid,p_failure jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare failure jsonb;
begin
 if not vocab_private.fail_preparation(p_id,p_key,p_lease) then return false;end if;
 failure:=jsonb_build_object('code',left(coalesce(p_failure->>'code','PREPARATION_FAILED'),40),
  'reason',left(coalesce(p_failure->>'reason','worker_failed'),80),
  'stage',left(coalesce(p_failure->>'stage','prepare'),60),'at',now());
 update vocab_private.preparations set payload=jsonb_set(coalesce(payload,'{}'),'{preparationFailure}',failure)
 where id=p_id and capability=p_key and lease=p_lease and status='pending' and attempts=8;
 if found then return true;end if;
 update vocab_private.lesson_reserves set payload=jsonb_set(coalesce(payload,'{}'),'{preparationFailure}',failure)
 where id=p_id and capability=p_key and lease=p_lease and status='pending' and attempts=8;
 return found;
end $$;
revoke all on function vocab_private.report_preparation_failure(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function vocab_private.report_preparation_failure(uuid,uuid,uuid,jsonb) to anon;
create or replace function public.report_preparation_failure(p_id uuid,p_key uuid,p_lease uuid,p_failure jsonb)
returns boolean language sql security invoker set search_path='' as $$
 select vocab_private.report_preparation_failure(p_id,p_key,p_lease,p_failure);
$$;
revoke all on function public.report_preparation_failure(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.report_preparation_failure(uuid,uuid,uuid,jsonb) to anon;
