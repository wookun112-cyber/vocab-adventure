-- Append-only learning records remain unchanged; only the unfinished target index is added.
create or replace function vocab_private.merge_unfinished_usage(learner jsonb, lesson jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare pending jsonb:=coalesce(learner->'unfinishedUsage','{}'::jsonb); w jsonb; name text;
 assigned_at numeric; completed_at numeric; day text; stats jsonb;
begin
 if lesson is null or coalesce(lesson->>'mode','') not in ('daily','review') then return learner;end if;
 assigned_at:=coalesce((lesson->>'studyStartedAt')::numeric,(lesson->>'created')::numeric,0);
 day:=vocab_private.saved_lesson_day(lesson);
 if assigned_at<=0 or day is null then return learner;end if;
 for w in select value from jsonb_array_elements(coalesce(lesson->'baseWords','[]'::jsonb)) loop
  name:=w->>'w';if name is null or coalesce((w->>'band')::numeric,0)<2 then continue;end if;
  stats:=learner#>array['words',name];
  completed_at:=coalesce((stats->>'usageConfirmedStamp')::numeric,0);
  if completed_at=0 and stats->>'usageConfirmedAt' ~ '^\d{4}-\d{2}-\d{2}$' then
   completed_at:=extract(epoch from ((stats->>'usageConfirmedAt')::date::timestamp at time zone 'Asia/Seoul'))*1000;
  end if;
  select greatest(completed_at,coalesce(max(coalesce((r->>'answeredAt')::numeric,assigned_at)),0)) into completed_at
  from jsonb_array_elements(coalesce(lesson->'results','[]'::jsonb)) r
  where r->>'word'=name and r->>'type'='subjective_use' and (r->>'credit')::numeric>=1
   and r->>'contextSuccess'='true' and coalesce(r->>'hintUsed','false')<>'true'
   and coalesce(r->>'revealed','false')<>'true' and coalesce(r->>'copiedExample','false')<>'true'
   and coalesce(r->>'excludedFromVocabulary','false')<>'true';
  if completed_at>=assigned_at then
   if completed_at>=coalesce((pending#>>array[name,'assignedAt'])::numeric,0) then pending:=pending-name;end if;
  elsif not pending ? name then
   pending:=jsonb_set(pending,array[name],jsonb_build_object('word',jsonb_build_object('w',name,'d',w->'d','band',w->'band','cat',w->'cat'),
    'day',day,'assignedAt',assigned_at,'lessonId',lesson->>'id'),true);
  end if;
 end loop;
 return jsonb_set(learner,'{unfinishedUsage}',pending,true);
end $$;
revoke all on function vocab_private.merge_unfinished_usage(jsonb,jsonb) from public,anon,authenticated;

-- Use the live function body so unrelated concurrent fixes are retained.
do $$
declare body text;
begin
 select pg_get_functiondef('vocab_private.switch_learning_day(text,text,text,text)'::regprocedure) into body;
 if position('merge_unfinished_usage' in body)=0 then
  if position('learner:=jsonb_set(learner,''{activeLesson}''' in body)=0 then raise exception 'Day switch anchor changed';end if;
  body:=replace(body,'learner:=jsonb_set(learner,''{activeLesson}''',
    'learner:=vocab_private.merge_unfinished_usage(learner,active); learner:=jsonb_set(learner,''{activeLesson}''');
  execute body;
 end if;
end $$;

-- Recover unresolved targets from existing paused/active lessons without replaying answers.
do $$
declare row record; v_profile text; learner jsonb; lesson record; updated jsonb;
begin
 for row in select user_id,state from public.app_state where user_id in(select user_id from vocab_private.grade_access) for update loop
  updated:=row.state;
  foreach v_profile in array array['ayoung','inseong','guest'] loop
   learner:=updated#>array['users',v_profile];if learner is null then continue;end if;
   for lesson in select payload from vocab_private.paused_lessons
     where user_id=row.user_id and paused_lessons.profile=v_profile and status='paused' order by paused_at loop
    learner:=vocab_private.merge_unfinished_usage(learner,lesson.payload);
   end loop;
   learner:=vocab_private.merge_unfinished_usage(learner,learner->'activeLesson');
   updated:=jsonb_set(updated,array['users',v_profile],learner,true);
  end loop;
  if updated is distinct from row.state then
   update public.app_state set state=updated,updated_at=now() where user_id=row.user_id;
  end if;
 end loop;
end $$;
