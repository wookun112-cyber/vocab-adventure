-- Run after installing grading-access-budget.sql. All changes are rolled back.
begin;
set local statement_timeout='8s';
select set_config('request.jwt.claim.sub','06c78577-b96e-4919-b979-58683ff5946e',true);
update vocab_private.grade_access set daily_limit=1 where user_id=auth.uid();
-- The tests use their own isolated day counters inside this rolled-back transaction.
delete from vocab_private.grade_start_usage where user_id=auth.uid();
set local role authenticated;
do $$declare a jsonb;b jsonb;blocked boolean:=false;begin
 a:=public.claim_vocab_grade(repeat('a1',32));
 assert public.start_vocab_grade(repeat('a1',32),(a->>'lease')::uuid);
 assert not public.start_vocab_grade(repeat('a1',32),(a->>'lease')::uuid),'repeated start must not pay again';
 b:=public.claim_vocab_grade(repeat('b1',32));
 begin perform public.start_vocab_grade(repeat('b1',32),(b->>'lease')::uuid);exception when others then blocked:=sqlerrm='GRADE_DAILY_LIMIT';end;
 assert blocked,'daily limit not enforced';
 assert public.finish_vocab_grade(repeat('a1',32),(a->>'lease')::uuid,'{"score":1,"contextSuccess":true}'::jsonb);
 assert (public.claim_vocab_grade(repeat('a1',32))->'result'->>'score')::numeric=1,'cached result unavailable at budget limit';
 assert not public.get_vocab_grade_assignment('{"targetWord":"not-assigned","question":"arbitrary chat","taskType":"sentence_use"}'::jsonb);
end $$;
reset role;
update vocab_private.grade_access set daily_limit=600 where user_id=auth.uid();
insert into vocab_private.grade_start_usage(user_id,request_hash)select auth.uid(),repeat('c1',32) from generate_series(1,20);
set local role authenticated;
do $$declare a jsonb;blocked boolean:=false;begin
 a:=public.claim_vocab_grade(repeat('d1',32));
 begin perform public.start_vocab_grade(repeat('d1',32),(a->>'lease')::uuid);exception when others then blocked:=sqlerrm='GRADE_RATE_LIMIT';end;
 assert blocked,'per-minute limit not enforced';
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$begin
 assert not public.get_vocab_grade_assignment('{"targetWord":"의견"}'::jsonb),'other owner must not see assignments';
 assert not has_function_privilege('anon','public.get_vocab_grade_assignment(jsonb)','EXECUTE');
 assert not has_table_privilege('authenticated','vocab_private.grade_start_usage','SELECT');
end $$;
select 'PASS: budget, minute rate, idempotent start, cached recovery, unknown assignment and role isolation' as checks;
rollback;
