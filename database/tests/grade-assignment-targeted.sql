-- Run inside a transaction after grade-assignment-targeted.sql, then ROLLBACK.
-- Uses a saved canonical task without outputting its original answer.
do $test$
declare owner_id uuid:='06c78577-b96e-4919-b979-58683ff5946e'; l jsonb;q jsonb;e jsonb;p jsonb;before_state text;t timestamptz;elapsed numeric;
begin
 select md5(state::text),state#>'{users,inseong,activeLesson}' into before_state,l from public.app_state where user_id=owner_id;
 select value into e from jsonb_array_elements(l->'ready') where value->1->>'type'='subjective_use' limit 1;
 assert e is not null,'Need a saved sentence task';q:=e->1;
 p:=jsonb_build_object('assignmentId',(l->>'id')||':'||(e->>0),'targetWord',q#>>'{w,w}','definition',q#>>'{w,d}',
  'question',(q->>'q')||chr(10)||'지문: '||coalesce(q->>'ctx',''),'taskType','sentence_use',
  'acceptedAnswers',coalesce(q->'acceptedAnswers','[]'),'allowNaturalDerivations',coalesce(q->'allowNaturalDerivations','[]'));
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 t:=clock_timestamp();assert public.get_vocab_grade_assignment(p),'Valid indexed task rejected';
 elapsed:=extract(epoch from(clock_timestamp()-t))*1000;
 assert not public.get_vocab_grade_assignment(p||'{"definition":"altered"}'),'Changed meaning accepted';
 assert not public.get_vocab_grade_assignment(p||'{"assignmentId":"00000000-0000-0000-0000-000000000000:0"}'),'Wrong lesson accepted';
 assert not public.get_vocab_grade_assignment(p||'{"assignmentId":"invalid"}'),'Malformed ID accepted';
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
 assert not public.get_vocab_grade_assignment(p),'Another account accepted';
 perform set_config('request.jwt.claim.sub','',true);assert not public.get_vocab_grade_assignment(p),'Anonymous accepted';
 assert before_state=(select md5(state::text)from public.app_state where user_id=owner_id),'Learner state changed';
 raise notice 'Targeted task validation: % ms; owner/lesson/meaning isolation; unchanged state',round(elapsed,1);
end $test$;
