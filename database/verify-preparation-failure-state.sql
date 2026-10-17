begin;
do $$
declare j vocab_private.preparations; original jsonb; bad uuid:=gen_random_uuid();
begin
 select * into j from vocab_private.preparations where profile='ayoung' limit 1;
 if j.id is null then raise exception 'Missing test fixture';end if;
 original:=j.payload;
 if public.fail_preparation(j.id,j.capability,j.lease) then raise exception 'Ready lesson overwritten';end if;
 update vocab_private.preparations set status='working',attempts=1 where id=j.id;
 if public.fail_preparation(j.id,bad,j.lease) or public.fail_preparation(j.id,j.capability,bad) then raise exception 'Invalid capability/lease accepted';end if;
 if not public.fail_preparation(j.id,j.capability,j.lease) then raise exception 'Valid failure transition rejected';end if;
 select * into j from vocab_private.preparations where id=j.id;
 if j.payload is distinct from original or j.status<>'pending' or j.attempts<>8 then raise exception 'Failure lost packet or failed to settle';end if;
 if public.fail_preparation(j.id,j.capability,j.lease) then raise exception 'Duplicate failure accepted';end if;
end $$;
select 'failure state verified; all changes rolled back' result;
rollback;
