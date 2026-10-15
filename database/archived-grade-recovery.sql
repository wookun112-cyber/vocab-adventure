-- Cache-only background reconciliation, owner-scoped and atomic with learner state.
create or replace function vocab_private.read_saved_vocab_grade(p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 return (select result from vocab_private.grading_cache where user_id=auth.uid() and request_hash=p_hash);
end $$;
create or replace function public.read_saved_vocab_grade(p_hash text)
returns jsonb language sql security invoker set search_path='' as $$ select vocab_private.read_saved_vocab_grade(p_hash) $$;
revoke all on function vocab_private.read_saved_vocab_grade(text),public.read_saved_vocab_grade(text) from public,anon;
grant execute on function vocab_private.read_saved_vocab_grade(text),public.read_saved_vocab_grade(text) to authenticated;

create or replace function vocab_private.read_paused_grade_recovery(p_profile text,p_skip text[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); learner jsonb; item record;
begin
 if owner_id is null or p_profile not in ('ayoung','inseong','guest') then raise exception 'Authentication required' using errcode='42501';end if;
 select state#>array['users',p_profile] into learner from public.app_state where user_id=owner_id;
 select p.payload,g.job into item from vocab_private.paused_lessons p
 cross join lateral jsonb_array_elements(coalesce(p.payload->'gradingQueue','[]')) g(job)
 where p.user_id=owner_id and p.profile=p_profile and p.status='paused'
 and g.job->>'status' is distinct from 'applied' and not (g.job->>'id'=any(p_skip))
 and (exists(select 1 from jsonb_array_elements(coalesce(p.payload->'results','[]')) r where r->>'gradingJobId'=g.job->>'id' and r->>'gradingPending'='true')
  or (g.job->>'index'=jsonb_array_length(coalesce(p.payload->'results','[]'))::text
   and p.payload->'plans'->((g.job->>'index')::integer)->'w'->>'w'=g.job->>'word'
   and not exists(select 1 from jsonb_array_elements(coalesce(p.payload->'results','[]')) r where r->>'gradingJobId'=g.job->>'id')))
 order by p.paused_at,g.job->>'id' limit 1;
 if not found or learner is null then return null;end if;
 return jsonb_build_object('learner',learner,'expected',md5(learner::text),'job',item.job,
  'lesson',item.payload-array['plans','ready','practicePool','studyTopups','adaptivePool'],
  'plan',item.payload->'plans'->((item.job->>'index')::integer));
end $$;
create or replace function public.read_paused_grade_recovery(p_profile text,p_skip text[] default '{}')
returns jsonb language sql security invoker set search_path='' as $$ select vocab_private.read_paused_grade_recovery(p_profile,p_skip) $$;
revoke all on function vocab_private.read_paused_grade_recovery(text,text[]),public.read_paused_grade_recovery(text,text[]) from public,anon;
grant execute on function vocab_private.read_paused_grade_recovery(text,text[]),public.read_paused_grade_recovery(text,text[]) to authenticated;

create or replace function vocab_private.commit_paused_grade_recovery(p_profile text,p_lesson_id text,p_job_id text,p_expected text,p_learner jsonb,p_record jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); original jsonb; previous jsonb; lesson jsonb; job jsonb; learner jsonb; rows jsonb; jobs jsonb; archive_index jsonb;
begin
 if owner_id is null or p_profile not in ('ayoung','inseong','guest') then raise exception 'Authentication required' using errcode='42501';end if;
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
 if not exists(select 1 from jsonb_array_elements(lesson->'results') r where r->>'gradingJobId'=p_job_id and r->>'gradingPending'='true') then
  if job->>'index' is distinct from jsonb_array_length(coalesce(lesson->'results','[]'))::text
   or lesson->'plans'->((job->>'index')::integer)->'w'->>'w' is distinct from job->>'word'
   or exists(select 1 from jsonb_array_elements(lesson->'results') r where r->>'gradingJobId'=p_job_id) then return false;end if;
  lesson:=jsonb_set(lesson,'{results}',coalesce(lesson->'results','[]')||jsonb_build_array(jsonb_build_object('gradingPending',true,'gradingJobId',p_job_id)));
 end if;
 select jsonb_agg(case when r->>'gradingJobId'=p_job_id and r->>'gradingPending'='true' then p_record else r end order by ord) into rows from jsonb_array_elements(lesson->'results') with ordinality x(r,ord);
 select jsonb_agg(case when g->>'id'=p_job_id then g||jsonb_build_object('status','applied','recoveredFromArchive',true) else g end order by ord) into jobs from jsonb_array_elements(lesson->'gradingQueue') with ordinality x(g,ord);
 lesson:=jsonb_set(jsonb_set(jsonb_set(lesson,'{results}',rows),'{gradingQueue}',jobs),'{nextIndex}',to_jsonb(jsonb_array_length(rows)));
 update vocab_private.paused_lessons set payload=lesson where user_id=owner_id and profile=p_profile and lesson_id=p_lesson_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.lesson_id,'day',p.study_day,'answered',jsonb_array_length(coalesce(p.payload->'results','[]')),'target',p.payload->'target','activeMs',p.payload->'activeMs',
  'pendingGrades',(select count(*) from jsonb_array_elements(coalesce(p.payload->'gradingQueue','[]')) g where g->>'status' is distinct from 'applied')) order by p.paused_at desc),'[]'::jsonb) into archive_index
 from vocab_private.paused_lessons p where p.user_id=owner_id and p.profile=p_profile and p.status='paused';
 learner:=p_learner||jsonb_build_object('pausedLessonIndex',archive_index,'daySwitchSequence',coalesce((previous->>'daySwitchSequence')::bigint,0)+1,
  'lessonCheckpointAt',greatest(floor(extract(epoch from clock_timestamp())*1000)::bigint,coalesce((previous->>'lessonCheckpointAt')::bigint,0)+1));
 update public.app_state set state=jsonb_set(original,array['users',p_profile],learner),updated_at=now() where user_id=owner_id;
 return true;
end $$;
create or replace function public.commit_paused_grade_recovery(p_profile text,p_lesson_id text,p_job_id text,p_expected text,p_learner jsonb,p_record jsonb)
returns boolean language sql security invoker set search_path='' as $$ select vocab_private.commit_paused_grade_recovery(p_profile,p_lesson_id,p_job_id,p_expected,p_learner,p_record) $$;
revoke all on function vocab_private.commit_paused_grade_recovery(text,text,text,text,jsonb,jsonb),public.commit_paused_grade_recovery(text,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function vocab_private.commit_paused_grade_recovery(text,text,text,text,jsonb,jsonb),public.commit_paused_grade_recovery(text,text,text,text,jsonb,jsonb) to authenticated;
