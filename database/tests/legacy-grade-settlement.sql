-- Synthetic dedicated-profile recovery. Every fixture/cache write rolls back.
do $test$
declare owner_id uuid:='06c78577-b96e-4919-b979-58683ff5946e'; hash text:=repeat('a',64); before_state text; recovered jsonb; learner jsonb; expected text;
begin
 select md5(state::text) into before_state from public.app_state where user_id=owner_id;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin
  if exists(select 1 from vocab_private.grading_cache where user_id=owner_id and request_hash=hash) then raise exception 'Synthetic hash collision';end if;
  insert into vocab_private.grading_cache(user_id,request_hash,result,provider_started) values(owner_id,hash,null,true);
  insert into vocab_private.paused_lessons(user_id,profile,lesson_id,study_day,payload,status) values(owner_id,'test','qa-legacy-cache-arrival','2026-10-01',jsonb_build_object('id','qa-legacy-cache-arrival','plans',jsonb_build_array(jsonb_build_object('w',jsonb_build_object('w','의견'))),'results',jsonb_build_array(jsonb_build_object('gradingPending',true,'gradingJobId','qa-old:0')),'gradingQueue',jsonb_build_array(jsonb_build_object('id','qa-old:0','word','의견','index',0,'status','needs_review','submittedDay','2026-10-01','recoveryState','legacy_unavailable','recoveryHash',hash))),'paused');
  if vocab_private.read_paused_grade_recovery('test') is not null then raise exception 'Unavailable result was polled again';end if;
  update vocab_private.grading_cache set result='{"score":1,"contextSuccess":true}' where user_id=owner_id and request_hash=hash;
  recovered:=vocab_private.read_paused_grade_recovery('test');
  if recovered#>>'{job,id}' is distinct from 'qa-old:0' then raise exception 'Late real cache result cannot be recovered';end if;
  update vocab_private.paused_lessons set payload=jsonb_set(payload,'{results}',jsonb_build_array(jsonb_build_object('gradingPending',false,'gradingReviewRequired',true,'excludedFromVocabulary',true,'credit',null,'gradingJobId','qa-old:0'))) where user_id=owner_id and profile='test' and lesson_id='qa-legacy-cache-arrival';
  if vocab_private.read_paused_grade_recovery('test') is null then raise exception 'Held unknown answer cannot recover a real result';end if;
  select state#>'{users,test}' into learner from public.app_state where user_id=owner_id;expected:=md5(learner::text);
  if not public.commit_paused_grade_recovery('test','qa-legacy-cache-arrival','qa-old:0',expected,learner,'{"gradingJobId":"qa-old:0","word":"의견","studyDate":"2026-10-01","credit":1}') then raise exception 'Real-result settlement commit failed';end if;
  if public.commit_paused_grade_recovery('test','qa-legacy-cache-arrival','qa-old:0',expected,learner,'{"gradingJobId":"qa-old:0","word":"의견","studyDate":"2026-10-01","credit":1}') then raise exception 'Duplicate result applied twice';end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  if vocab_private.read_paused_grade_recovery('test') is not null then raise exception 'Cross-family recovery leak';end if;
  raise exception using errcode='PZ001',message='rollback synthetic recovery';
 exception when sqlstate 'PZ001' then null;end;
 if before_state is distinct from (select md5(state::text) from public.app_state where user_id=owner_id) then raise exception 'Learner state changed';end if;
 if has_function_privilege('anon','public.read_paused_grade_recovery(text,text[])','EXECUTE') then raise exception 'Anonymous recovery privilege';end if;
end $test$;
