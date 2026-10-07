-- Run against a configured project; all fixtures and outbound requests roll back.
begin;
do $$
declare u uuid; j vocab_private.preparations; r jsonb; before_ready jsonb; paused uuid:=gen_random_uuid();
begin
 select user_id into u from public.app_state limit 1;
 if u is null then raise exception 'A saved family account is required'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 select * into j from vocab_private.preparations where user_id=u and profile='ayoung' for update;
 before_ready:=coalesce(j.payload->'ready','[]');
 update vocab_private.preparations set status='pending',attempts=8,is_consumed=false,
  payload=jsonb_set(jsonb_set(jsonb_set(j.payload,'{snapshot}','"recovery-test"'),'{budget,policy}','"daily-3-20-25-flex"'),'{questionPolicy}','"vocabulary-context-12.5"')
 where id=j.id;
 r:=public.ensure_prepared_lesson('ayoung','recovery-test',true);
 if r->>'id'<>j.id::text or r#>'{payload,ready}'<>before_ready or
  (select attempts from vocab_private.preparations where id=j.id)<>0 then raise exception 'Retry lost validated peers'; end if;
 r:=public.ensure_prepared_lesson('ayoung','changed-progress',false);
 if r->>'id'=j.id::text or r->'payload'<>'null' then raise exception 'Stale snapshot was not replaced'; end if;
 if public.consume_prepared_lesson('ayoung',(r->>'id')::uuid) then raise exception 'Incomplete lesson consumed'; end if;
 update public.app_state set state=jsonb_set(state,'{users,ayoung,activeLesson}',
  j.payload||jsonb_build_object('id',paused,'version',1,'engine','12.0.0','mode','daily','account',u,'profile','ayoung','ready','[]'::jsonb)) where user_id=u;
 r:=public.ensure_prepared_lesson('ayoung','changed-progress',false);
 if r#>>'{payload,resumeId}'<>paused::text or r#>'{payload,plans}'<>j.payload->'plans' then raise exception 'Paused lesson changed'; end if;
 if has_function_privilege('anon','public.ensure_prepared_lesson(text,text,boolean)','EXECUTE') then raise exception 'Anonymous recovery privilege'; end if;
 if public.ensure_prepared_lesson('invalid-profile','x',true) is not null then raise exception 'Invalid profile accepted'; end if;
end $$;
rollback;
select 'PASS: retained validated peers, reset exhausted retries, replaced stale work, refused incomplete consumption, preserved paused plans, enforced profile and role checks' as verification;
