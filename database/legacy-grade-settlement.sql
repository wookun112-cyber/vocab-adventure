-- Terminal legacy missing results are preserved, not graded or rebilled.
create or replace function vocab_private.unresolved_grade_record(r jsonb,job_id text)
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(r->>'gradingJobId'=job_id and (r->>'gradingPending'='true' or (r->>'gradingReviewRequired'='true' and coalesce(r->'credit','null'::jsonb)='null'::jsonb and r->>'excludedFromVocabulary'='true')),false)
$$;
revoke all on function vocab_private.unresolved_grade_record(jsonb,text) from public,anon,authenticated;
create or replace function vocab_private.pending_grade_count(jobs jsonb)
returns bigint language sql immutable security invoker set search_path='' as $$
 select count(*) from jsonb_array_elements(coalesce(jobs,'[]')) g
 where g->>'status' is distinct from 'applied' and g->>'recoveryState' is distinct from 'legacy_unavailable'
$$;
create or replace function vocab_private.unavailable_grade_count(jobs jsonb)
returns bigint language sql immutable security invoker set search_path='' as $$
 select count(*) from jsonb_array_elements(coalesce(jobs,'[]')) g
 where g->>'status' is distinct from 'applied' and g->>'recoveryState'='legacy_unavailable'
$$;
revoke all on function vocab_private.pending_grade_count(jsonb),vocab_private.unavailable_grade_count(jsonb) from public,anon,authenticated;


CREATE OR REPLACE FUNCTION vocab_private.switch_learning_day(p_profile text, p_expected_id text, p_day text, p_restore_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid:=auth.uid(); original jsonb; learner jsonb; active jsonb; target jsonb;
 old_day text; archive_index jsonb; now_ms bigint;
begin
 if owner_id is null or p_profile is null or p_profile not in ('ayoung','inseong','guest','test') then
  raise exception 'Authentication and a valid profile are required' using errcode='42501';end if;
 if p_day is distinct from to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD') then
  raise exception 'Learning day changed; refresh the date';end if;
 select state into original from public.app_state where user_id=owner_id for update;
 if not found then raise exception 'Learning state is unavailable';end if;
 learner:=original#>array['users',p_profile];active:=learner->'activeLesson';
 if jsonb_typeof(active) is distinct from 'object' then active:=null;end if;
 if p_restore_id is not null and active->>'id'=p_restore_id then return jsonb_build_object('changed',false,'restored',true);end if;
 if p_restore_id is null and active is null then return jsonb_build_object('changed',false,'archived',true);end if;
 if coalesce(active->>'id','') is distinct from coalesce(p_expected_id,'') then
  return jsonb_build_object('conflict',true,'reason','active_lesson_changed');end if;
 if active is not null and (active->>'account' is distinct from owner_id::text or active->>'profile' is distinct from p_profile) then
  raise exception 'Lesson ownership mismatch' using errcode='42501';end if;
 if p_restore_id is null then
  old_day:=vocab_private.saved_lesson_day(active);
  -- On the SAME day, an incomplete daily lesson that has exhausted its
  -- official 30-minute study budget may be archived for voluntary review.
  -- The cap may be reached across multiple sessions; check dated history too.
  -- Earlier-day archive rules and all owner/lesson-id checks stay unchanged.
  if coalesce(active->>'mode','') not in ('daily','review') or old_day is null or old_day>p_day
    or (old_day=p_day and not (
      active->>'mode'='daily' and
      (coalesce((active->>'activeMs')::numeric,0)>=1800000
       or coalesce((active#>>array['studyDays',p_day,'activeMs'])::numeric,0)>=1800000
       or learner->>'lastDate'=p_day
       or coalesce((
         select sum(coalesce((entry.value#>>array['days',p_day,'activeMs'])::numeric,0))
           from jsonb_each(coalesce(learner#>'{studyHistory,entries}','{}'::jsonb)) entry
          where entry.value->>'mode'='daily'
       ),0)>=1800000)
    )) then
   raise exception 'Only a previous-day lesson or a capped current-day daily lesson can be archived';end if;
 else
  select payload into target from vocab_private.paused_lessons where user_id=owner_id and profile=p_profile and lesson_id=p_restore_id and status='paused' for update;
  if not found then raise exception 'Paused lesson is unavailable';end if;
 end if;
 if active is not null then
  insert into vocab_private.paused_lessons(user_id,profile,lesson_id,study_day,payload,status)
   values(owner_id,p_profile,active->>'id',vocab_private.saved_lesson_day(active),active,'paused')
  on conflict(user_id,profile,lesson_id) do update set payload=excluded.payload,study_day=excluded.study_day,status='paused',paused_at=now()
   where jsonb_array_length(coalesce(excluded.payload->'results','[]'))>=jsonb_array_length(coalesce(paused_lessons.payload->'results','[]'));
  if not found then raise exception 'Paused checkpoint regression blocked';end if;
 end if;
 if p_restore_id is not null then update vocab_private.paused_lessons set status='active' where user_id=owner_id and profile=p_profile and lesson_id=p_restore_id;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.lesson_id,'day',p.study_day,
  'answered',jsonb_array_length(coalesce(p.payload->'results','[]')),'target',p.payload->'target','activeMs',p.payload->'activeMs',
  'pendingGrades',vocab_private.pending_grade_count(p.payload->'gradingQueue'),'ungradedAnswers',vocab_private.unavailable_grade_count(p.payload->'gradingQueue')
 ) order by p.paused_at desc),'[]'::jsonb) into archive_index
 from vocab_private.paused_lessons p where p.user_id=owner_id and p.profile=p_profile and p.status='paused';
 now_ms:=greatest(floor(extract(epoch from clock_timestamp())*1000)::bigint,coalesce((learner->>'lessonCheckpointAt')::bigint,0)+1);
 learner:=vocab_private.merge_unfinished_usage(learner,active); learner:=jsonb_set(learner,'{activeLesson}',coalesce(target,'null'::jsonb),true);
 learner:=jsonb_set(learner,'{pausedLessonIndex}',archive_index,true);
 learner:=jsonb_set(learner,'{daySwitchSequence}',to_jsonb(coalesce((learner->>'daySwitchSequence')::bigint,0)+1),true);
 learner:=jsonb_set(learner,'{lessonCheckpointAt}',to_jsonb(now_ms),true);
 if p_restore_id is null then learner:=jsonb_set(learner,'{preparationRevision}',to_jsonb(coalesce((learner->>'preparationRevision')::bigint,0)+1),true);end if;
 update public.app_state set state=jsonb_set(original,array['users',p_profile],learner,true),updated_at=now() where user_id=owner_id;
 return jsonb_build_object('changed',true,'archived',p_restore_id is null,'restored',p_restore_id is not null);
end $function$;

CREATE OR REPLACE FUNCTION vocab_private.read_paused_grade_recovery(p_profile text, p_skip text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid:=auth.uid(); learner jsonb; item record;
begin
 if owner_id is null or p_profile not in ('ayoung','inseong','guest','test') then raise exception 'Authentication required' using errcode='42501';end if;
 select state#>array['users',p_profile] into learner from public.app_state where user_id=owner_id;
 select p.payload,g.job into item from vocab_private.paused_lessons p
 cross join lateral jsonb_array_elements(coalesce(p.payload->'gradingQueue','[]')) g(job)
 where p.user_id=owner_id and p.profile=p_profile and p.status='paused'
 and g.job->>'status' is distinct from 'applied' and not (g.job->>'id'=any(p_skip))
 and (g.job->>'recoveryState' is distinct from 'legacy_unavailable' or exists(
  select 1 from vocab_private.grading_cache c where c.user_id=owner_id and c.request_hash=g.job->>'recoveryHash' and c.result is not null))
 and (exists(select 1 from jsonb_array_elements(coalesce(p.payload->'results','[]')) r where vocab_private.unresolved_grade_record(r,g.job->>'id'))
  or (g.job->>'index'=jsonb_array_length(coalesce(p.payload->'results','[]'))::text
   and p.payload->'plans'->((g.job->>'index')::integer)->'w'->>'w'=g.job->>'word'
   and not exists(select 1 from jsonb_array_elements(coalesce(p.payload->'results','[]')) r where r->>'gradingJobId'=g.job->>'id')))
 order by p.paused_at,g.job->>'id' limit 1;
 if not found or learner is null then return null;end if;
 return jsonb_build_object('learner',learner,'expected',md5(learner::text),'job',item.job,
  'lesson',item.payload-array['plans','ready','practicePool','studyTopups','adaptivePool'],
  'plan',item.payload->'plans'->((item.job->>'index')::integer));
end $function$;

CREATE OR REPLACE FUNCTION vocab_private.commit_paused_grade_recovery(p_profile text, p_lesson_id text, p_job_id text, p_expected text, p_learner jsonb, p_record jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid:=auth.uid(); original jsonb; previous jsonb; lesson jsonb; job jsonb; learner jsonb; rows jsonb; jobs jsonb; archive_index jsonb;
begin
 if owner_id is null or p_profile not in ('ayoung','inseong','guest','test') then raise exception 'Authentication required' using errcode='42501';end if;
 select state into original from public.app_state where user_id=owner_id for update;
 previous:=original#>array['users',p_profile];
 if md5(previous::text) is distinct from p_expected then return false;end if;
 select payload into lesson from vocab_private.paused_lessons where user_id=owner_id and profile=p_profile and lesson_id=p_lesson_id and status='paused' for update;
 if not found then return false;end if;
 select g into job from jsonb_array_elements(coalesce(lesson->'gradingQueue','[]')) g where g->>'id'=p_job_id and g->>'status' is distinct from 'applied';
 if job is null then return false;end if;
 if p_record->>'gradingJobId' is distinct from p_job_id or p_record->>'word' is distinct from job->>'word'
 or p_record->>'studyDate' is distinct from job->>'submittedDay'
 or p_record->>'credit' not in ('0','0.5','0.75','1')
 or p_learner->'activeLesson' is distinct from previous->'activeLesson' then raise exception 'Recovery mismatch';end if;
 if not exists(select 1 from jsonb_array_elements(lesson->'results') r where vocab_private.unresolved_grade_record(r,p_job_id)) then
  if job->>'index' is distinct from jsonb_array_length(coalesce(lesson->'results','[]'))::text
   or lesson->'plans'->((job->>'index')::integer)->'w'->>'w' is distinct from job->>'word'
   or exists(select 1 from jsonb_array_elements(lesson->'results') r where r->>'gradingJobId'=p_job_id) then return false;end if;
  lesson:=jsonb_set(lesson,'{results}',coalesce(lesson->'results','[]')||jsonb_build_array(jsonb_build_object('gradingPending',true,'gradingJobId',p_job_id)));
 end if;
 select jsonb_agg(case when vocab_private.unresolved_grade_record(r,p_job_id) then p_record else r end order by ord) into rows from jsonb_array_elements(lesson->'results') with ordinality x(r,ord);
 select jsonb_agg(case when g->>'id'=p_job_id then g||jsonb_build_object('status','applied','recoveredFromArchive',true) else g end order by ord) into jobs from jsonb_array_elements(lesson->'gradingQueue') with ordinality x(g,ord);
 lesson:=jsonb_set(jsonb_set(jsonb_set(lesson,'{results}',rows),'{gradingQueue}',jobs),'{nextIndex}',to_jsonb(jsonb_array_length(rows)));
 update vocab_private.paused_lessons set payload=lesson where user_id=owner_id and profile=p_profile and lesson_id=p_lesson_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.lesson_id,'day',p.study_day,'answered',jsonb_array_length(coalesce(p.payload->'results','[]')),'target',p.payload->'target','activeMs',p.payload->'activeMs',
  'pendingGrades',vocab_private.pending_grade_count(p.payload->'gradingQueue'),'ungradedAnswers',vocab_private.unavailable_grade_count(p.payload->'gradingQueue')) order by p.paused_at desc),'[]'::jsonb) into archive_index
 from vocab_private.paused_lessons p where p.user_id=owner_id and p.profile=p_profile and p.status='paused';
 learner:=p_learner||jsonb_build_object('pausedLessonIndex',archive_index,'daySwitchSequence',coalesce((previous->>'daySwitchSequence')::bigint,0)+1,
  'lessonCheckpointAt',greatest(floor(extract(epoch from clock_timestamp())*1000)::bigint,coalesce((previous->>'lessonCheckpointAt')::bigint,0)+1));
 update public.app_state set state=jsonb_set(original,array['users',p_profile],learner),updated_at=now() where user_id=owner_id;
 return true;
end $function$;

do $test$ begin
 if vocab_private.pending_grade_count('[{"status":"pending"},{"status":"needs_review","recoveryState":"legacy_unavailable"},{"status":"applied"}]')<>1
 or vocab_private.unavailable_grade_count('[{"status":"needs_review","recoveryState":"legacy_unavailable"},{"status":"applied","recoveryState":"legacy_unavailable"}]')<>1 then raise exception 'Legacy grade classification failed';end if;
end $test$;
