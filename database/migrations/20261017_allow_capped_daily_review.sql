-- Preserves the exact production routine and its owner-scoped atomic archive.
-- Only the original date guard has been extended for already-capped daily work.
-- No learner records, grades, or archived payloads are mutated by this migration.
-- Regular same-day incomplete lessons remain protected from accidental archiving.
CREATE OR REPLACE FUNCTION vocab_private.switch_learning_day(p_profile text, p_expected_id text, p_day text, p_restore_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid:=auth.uid(); original jsonb; learner jsonb; active jsonb; target jsonb;
 old_day text; archive_index jsonb; now_ms bigint;
begin
 if owner_id is null or p_profile is null or p_profile not in ('ayoung','inseong','guest') then
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
  'pendingGrades',(select count(*) from jsonb_array_elements(coalesce(p.payload->'gradingQueue','[]')) g where g->>'status' is distinct from 'applied')
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
