-- Owner-scoped paused lessons. Day changes never create completion credit.
create table if not exists vocab_private.paused_lessons (
 user_id uuid not null references auth.users(id) on delete cascade,
 profile text not null check(profile in ('ayoung','inseong','guest')),
 lesson_id text not null,study_day text,payload jsonb not null,
 status text not null default 'paused' check(status in ('paused','active')),
 paused_at timestamptz not null default now(),primary key(user_id,profile,lesson_id)
);
alter table vocab_private.paused_lessons enable row level security;
revoke all on vocab_private.paused_lessons from public,anon,authenticated;
create or replace function vocab_private.saved_lesson_day(q jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare stamp numeric; result text;
begin
 result:=q->>'studyFallbackDay';
 if result ~ '^\d{4}-\d{2}-\d{2}$' then return result;end if;
 if coalesce(q->>'studyStartedAt',q->>'created','') ~ '^\d+(\.\d+)?$' then
  stamp:=coalesce(q->>'studyStartedAt',q->>'created')::numeric;
  if stamp between 946684800000 and 32503680000000 then
   return to_char(to_timestamp(stamp/1000) at time zone 'Asia/Seoul','YYYY-MM-DD');
  end if;
 end if;return null;
end $$;
revoke all on function vocab_private.saved_lesson_day(jsonb) from public,anon,authenticated;
create or replace function vocab_private.switch_learning_day(p_profile text,p_expected_id text,p_day text,p_restore_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  if coalesce(active->>'mode','') not in ('daily','review') or old_day is null or old_day>=p_day then
   raise exception 'Only an unfinished earlier-day lesson can start a new day';end if;
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
 learner:=jsonb_set(learner,'{activeLesson}',coalesce(target,'null'::jsonb),true);
 learner:=jsonb_set(learner,'{pausedLessonIndex}',archive_index,true);
 learner:=jsonb_set(learner,'{daySwitchSequence}',to_jsonb(coalesce((learner->>'daySwitchSequence')::bigint,0)+1),true);
 learner:=jsonb_set(learner,'{lessonCheckpointAt}',to_jsonb(now_ms),true);
 if p_restore_id is null then learner:=jsonb_set(learner,'{preparationRevision}',to_jsonb(coalesce((learner->>'preparationRevision')::bigint,0)+1),true);end if;
 update public.app_state set state=jsonb_set(original,array['users',p_profile],learner,true),updated_at=now() where user_id=owner_id;
 return jsonb_build_object('changed',true,'archived',p_restore_id is null,'restored',p_restore_id is not null);
end $$;
revoke all on function vocab_private.switch_learning_day(text,text,text,text) from public,anon,authenticated;
grant execute on function vocab_private.switch_learning_day(text,text,text,text) to authenticated;
create or replace function public.switch_learning_day(p_profile text,p_expected_id text,p_day text,p_restore_id text default null)
returns jsonb language sql security invoker set search_path='' as $$ select vocab_private.switch_learning_day(p_profile,p_expected_id,p_day,p_restore_id) $$;
revoke all on function public.switch_learning_day(text,text,text,text) from public,anon;
grant execute on function public.switch_learning_day(text,text,text,text) to authenticated;
create or replace function vocab_private.protect_day_switch()
returns trigger language plpgsql security definer set search_path='' as $$
declare profile_name text; prev jsonb; incoming jsonb;
begin
 foreach profile_name in array array['ayoung','inseong','guest'] loop
  prev:=old.state#>array['users',profile_name];incoming:=new.state#>array['users',profile_name];
  if coalesce((incoming->>'daySwitchSequence')::bigint,0)<coalesce((prev->>'daySwitchSequence')::bigint,0) then
   raise exception 'LEARNING_STATE_REGRESSION: newer daily lesson must be preserved';end if;
  if incoming#>>'{activeLesson,id}' is not null and exists(select 1 from vocab_private.paused_lessons p where p.user_id=new.user_id and p.profile=profile_name and p.lesson_id=incoming#>>'{activeLesson,id}' and p.status='paused') then
   raise exception 'LEARNING_STATE_REGRESSION: use the paused lesson restore action';end if;
 end loop;return new;
end $$;
revoke all on function vocab_private.protect_day_switch() from public,anon,authenticated;
create trigger c_protect_day_switch before update on public.app_state for each row execute function vocab_private.protect_day_switch();
