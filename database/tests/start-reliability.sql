begin;
do $test$
declare x jsonb; l jsonb; d text:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'); j vocab_private.preparations; token uuid:=gen_random_uuid();
begin
 select jsonb_build_object('w',jsonb_build_object('w',word,'d',definition,'band',band),'coveragePolicy','lower-stage-usage-12.16.19','coverageOriginLevel',3.2) into x
 from public.curriculum_words where word='예외' and band=2 and quality_status<>'rejected';
 if x is null then raise exception 'Approved coverage fixture missing';end if;
 l:=jsonb_build_object('difficulty',3.2,'words',jsonb_build_object('예외',jsonb_build_object('seen',3,'useSuccess',1,'useDays',jsonb_build_array(to_char(d::date-14,'YYYY-MM-DD')),'nextReviewAt',null)));
 if not vocab_private.coverage_usage_confirmed(l,'예외') or vocab_private.mastery_confirmed(l#>'{words,예외}') then raise exception 'Historical mixed state fixture invalid';end if;
 if not vocab_private.coverage_plan_valid(x,l,3.2) then raise exception 'Used but not mastered lower word must be accepted';end if;
 l:=jsonb_set(l,'{words,예외,independentRecallDays}','["2020-01-01","2020-01-08","2020-02-08"]');
 l:=jsonb_set(l,'{words,예외,retention7}','{"success":1}');
 if not vocab_private.mastery_confirmed(l#>'{words,예외}') or vocab_private.coverage_plan_valid(x,l,3.2) then raise exception 'Mastered word cannot be coverage gap';end if;
 l:=jsonb_set(l,'{words,예외,masteryRefreshDue}','true');
 if not vocab_private.coverage_plan_valid(x,l,3.2) then raise exception 'Confirmed lapse must reopen coverage';end if;
 l:=jsonb_set(l,'{words,예외,sentenceReviewDue}',to_jsonb(to_char(d::date+30,'YYYY-MM-DD')));
 if vocab_private.coverage_plan_valid(x,l,3.2) then raise exception 'Future sentence review must remain excluded';end if;
 l:=jsonb_set(l,'{words,예외,sentenceReviewDue}',to_jsonb(d));
 if not vocab_private.coverage_plan_valid(x,l,3.2) then raise exception 'Due date boundary must reopen';end if;
 if vocab_private.coverage_plan_valid(jsonb_set(x,'{w,d}','"wrong definition"'),l,3.2) then raise exception 'Definition guard was weakened';end if;
 if vocab_private.coverage_plan_valid(x,l,4.2) then raise exception 'Origin-level guard was weakened';end if;
 -- Lease/capability checks and diagnostics are tested only in a rolled-back
 -- guest preparation. No learner-state rows or external jobs are modified.
 select * into j from vocab_private.preparations where user_id='06c78577-b96e-4919-b979-58683ff5946e' and profile='guest' for update;
 if j.id is null then raise exception 'Guest queue fixture missing';end if;
 update vocab_private.preparations set status='working',lease=token,attempts=1,payload='{"preserved":"accepted-peer","plans":[],"ready":[]}' where id=j.id;
 if vocab_private.report_preparation_failure(j.id,gen_random_uuid(),token,'{}') then raise exception 'Foreign capability accepted';end if;
 if vocab_private.report_preparation_failure(j.id,j.capability,gen_random_uuid(),'{}') then raise exception 'Stale lease accepted';end if;
 if not vocab_private.report_preparation_failure(j.id,j.capability,token,'{"code":"P0001","reason":"review_window_invalid","stage":"save_preparation","private":"must not persist"}') then raise exception 'Owned failure report rejected';end if;
 select * into j from vocab_private.preparations where id=j.id;
 if j.status<>'pending' or j.attempts<>8 or j.payload->>'preserved'<>'accepted-peer' or j.payload#>>'{preparationFailure,reason}'<>'review_window_invalid' or j.payload->'preparationFailure' ? 'private' then raise exception 'Failure report lost peers or stored unbounded details';end if;
end $test$;
rollback;

-- Real prepared-packet start confirmation (always rolled back). Skip a child
-- who has already resumed on another device; never replace a live lesson.
begin;
do $test$
declare profile_name text; lesson uuid;
begin
 perform set_config('request.jwt.claim.sub','06c78577-b96e-4919-b979-58683ff5946e',true);
 perform set_config('request.jwt.claims','{"sub":"06c78577-b96e-4919-b979-58683ff5946e","role":"authenticated"}',true);
 foreach profile_name in array array['ayoung','inseong'] loop
  if (select coalesce(state#>array['users',profile_name,'activeLesson'],'null')<>'null' from public.app_state where user_id=auth.uid()) then continue;end if;
  select id into lesson from vocab_private.preparations where user_id=auth.uid() and profile=profile_name and status='ready';
  if lesson is null then raise exception 'Ready packet missing for %',profile_name;end if;
  if not public.consume_prepared_lesson(profile_name,lesson) then raise exception 'Prepared lesson cannot start for %',profile_name;end if;
 end loop;
end $test$;
rollback;
