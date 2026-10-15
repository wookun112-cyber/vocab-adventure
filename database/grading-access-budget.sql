-- Limits apply only to new paid starts; cached results and signed repair remain free.
-- This family already owns the private authored bank. No learner-state updates.
create table if not exists vocab_private.grade_access (
 user_id uuid primary key references auth.users(id), daily_limit integer not null default 600 check(daily_limit between 1 and 5000)
);
alter table vocab_private.grade_access enable row level security;
revoke all on vocab_private.grade_access from public,anon,authenticated;
insert into vocab_private.grade_access(user_id)
 select id from auth.users where id='06c78577-b96e-4919-b979-58683ff5946e'::uuid on conflict do nothing;
create table if not exists vocab_private.grade_start_usage (
 id bigint generated always as identity primary key,user_id uuid not null references auth.users(id),request_hash text not null,started_at timestamptz not null default now()
);
create index if not exists grade_start_usage_owner_time on vocab_private.grade_start_usage(user_id,started_at);
alter table vocab_private.grade_start_usage enable row level security;
revoke all on vocab_private.grade_start_usage from public,anon,authenticated;

create or replace function vocab_private.get_vocab_grade_assignment(p_request jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); learner jsonb; lesson jsonb; entry jsonb; q jsonb; plan jsonb; expected_type text;
begin
 if owner_id is null or not exists(select 1 from vocab_private.grade_access where user_id=owner_id) then return false;end if;
 if octet_length(p_request::text)>24000 then return false;end if;
 for learner in select value from public.app_state a cross join lateral jsonb_each(a.state->'users') u where a.user_id=owner_id and u.key in ('ayoung','inseong','guest') loop
  lesson:=learner->'activeLesson';
  if lesson is null then continue;end if;
  for entry in select value from jsonb_array_elements(coalesce(lesson->'ready','[]'::jsonb)) loop
   q:=entry->1;
   if q->>'type' not in ('subjective_use','subjective_recall','subjective_context','subjective_dialogue') then continue;end if;
   expected_type:=case when q->>'type'='subjective_use' then 'sentence_use' when q->>'type'='subjective_recall' and not(q ? 'authored') then 'definition_recall' else 'context_answer' end;
   if p_request->>'taskType' is distinct from expected_type or p_request->>'targetWord' is distinct from q#>>'{w,w}' or p_request->>'definition' is distinct from q#>>'{w,d}' or p_request->>'question' is distinct from (q->>'q'||E'\n지문: '||coalesce(q->>'ctx','')) or coalesce(p_request->'acceptedAnswers','[]'::jsonb)<>coalesce(q->'acceptedAnswers','[]'::jsonb) or coalesce(p_request->'allowNaturalDerivations','[]'::jsonb)<>coalesce(q->'allowNaturalDerivations','[]'::jsonb) then continue;end if;
   plan:=lesson->'plans'->((entry->>0)::integer);
   if q#>>'{validation,source}' in ('sentence_use_template','fixed_recall_template') then
    if vocab_private.sentence_use_question_accepted(q,plan) then return true;end if;
   elsif q ? 'authored' then
    if vocab_private.authored_question_accepted(q,owner_id) then return true;end if;
   elsif exists(select 1 from vocab_private.question_bank b where b.user_id=owner_id and b.word=q#>>'{w,w}' and b.task_type=q->>'type' and b.question->>'q'=q->>'q' and coalesce(b.question->>'ctx','')=coalesce(q->>'ctx','') and b.question#>>'{w,d}'=q#>>'{w,d}' and coalesce(b.question->'acceptedAnswers','[]'::jsonb)=coalesce(q->'acceptedAnswers','[]'::jsonb)) then return true;
   end if;
  end loop;
 end loop;
 return false;
end $$;
revoke all on function vocab_private.get_vocab_grade_assignment(jsonb) from public,anon;
grant execute on function vocab_private.get_vocab_grade_assignment(jsonb) to authenticated;
create or replace function public.get_vocab_grade_assignment(p_request jsonb)
returns boolean language sql security invoker set search_path='' as $$select vocab_private.get_vocab_grade_assignment(p_request)$$;
revoke all on function public.get_vocab_grade_assignment(jsonb) from public,anon;
grant execute on function public.get_vocab_grade_assignment(jsonb) to authenticated;

create or replace function vocab_private.start_vocab_grade(p_hash text,p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); cap integer; count_day integer; count_minute integer; concurrent integer;
begin
 if owner_id is null then raise exception 'Authentication required';end if;
 select daily_limit into cap from vocab_private.grade_access where user_id=owner_id;
 if cap is null then raise exception 'Grading account not allowed';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,7730));
 if not exists(select 1 from vocab_private.grading_cache where user_id=owner_id and request_hash=p_hash and lease=p_lease and result is null and not provider_started and lease_until>now()) then return false;end if;
 select count(*),count(*) filter(where started_at>now()-interval '1 minute') into count_day,count_minute from vocab_private.grade_start_usage where user_id=owner_id and started_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 if count_day>=cap then raise exception 'GRADE_DAILY_LIMIT';end if;
 if count_minute>=20 then raise exception 'GRADE_RATE_LIMIT';end if;
 select count(*) into concurrent from vocab_private.grading_cache where user_id=owner_id and provider_started and result is null and lease_until>now();
 if concurrent>=3 then raise exception 'GRADE_CONCURRENCY_LIMIT';end if;
 update vocab_private.grading_cache set provider_started=true,updated_at=now() where user_id=owner_id and request_hash=p_hash and lease=p_lease and result is null and not provider_started and lease_until>now();
 if not found then return false;end if;
 insert into vocab_private.grade_start_usage(user_id,request_hash)values(owner_id,p_hash);
 return true;
end $$;
revoke all on function vocab_private.start_vocab_grade(text,uuid) from public,anon;
grant execute on function vocab_private.start_vocab_grade(text,uuid) to authenticated;
