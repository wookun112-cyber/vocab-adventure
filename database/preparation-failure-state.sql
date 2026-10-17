-- Report a worker failure independently of packet validation. A rejected packet
-- must not leave the queue in "working"; valid saved peers are left untouched.
create or replace function vocab_private.fail_preparation(p_id uuid,p_key uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update vocab_private.preparations set status='pending',attempts=8,next_attempt=now(),updated_at=now()
 where id=p_id and capability=p_key and lease=p_lease and status='working';
 get diagnostics changed=row_count;
 if changed=1 then return true;end if;
 update vocab_private.lesson_reserves set status='pending',attempts=8,next_attempt=now(),updated_at=now()
 where id=p_id and capability=p_key and lease=p_lease and status='working';
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function vocab_private.fail_preparation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function vocab_private.fail_preparation(uuid,uuid,uuid) to anon;
create or replace function public.fail_preparation(p_id uuid,p_key uuid,p_lease uuid)
returns boolean language sql security invoker set search_path='' as $$select vocab_private.fail_preparation(p_id,p_key,p_lease)$$;
revoke all on function public.fail_preparation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.fail_preparation(uuid,uuid,uuid) to anon;

-- A deliberate start-button retry also retries an exhausted reserve, retaining
-- its validated peers and revoking the old worker lease.
do $$
declare body text; anchor text:='payload->>''preparationBlocked''=''ai_credit_exhausted'' and attempts>=8';
begin
 select pg_get_functiondef('vocab_private.ensure_prepared_lesson(text,text,boolean)'::regprocedure) into body;
 if position(anchor in body)>0 then
  body:=replace(body,anchor,'status not in (''ready'',''consumed'') and attempts>=8');
  execute body;
 elsif position('status not in (''ready'',''consumed'') and attempts>=8' in body)=0 then
  raise exception 'Preparation retry anchor changed';
 end if;
end $$;
