CREATE OR REPLACE FUNCTION vocab_private.get_vocab_grade_assignment(p_request jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid:=auth.uid(); learner jsonb; lesson jsonb; entry jsonb; q jsonb; plan jsonb; expected_type text;
begin
 if owner_id is null or not exists(select 1 from vocab_private.grade_access where user_id=owner_id) then return false;end if;
 if octet_length(p_request::text)>24000 then return false;end if;

 -- New clients identify a saved task by lesson UUID and zero-based slot.
 -- Read only the matching profile/lesson and one ready entry, not every task.
 if p_request ? 'assignmentId' then
  if coalesce(p_request->>'assignmentId','') !~ '^[a-f0-9-]{36}:[0-9]{1,6}$' then return false;end if;
  select value->'activeLesson' into lesson
   from public.app_state a cross join lateral jsonb_each(a.state->'users') u
   where a.user_id=owner_id and u.key in('ayoung','inseong','guest')
    and value#>>'{activeLesson,id}'=split_part(p_request->>'assignmentId',':',1) limit 1;
  if lesson is null then return false;end if;
  select value into entry from jsonb_array_elements(coalesce(lesson->'ready','[]'))
   where value->>0=split_part(p_request->>'assignmentId',':',2) limit 1;
  q:=entry->1;plan:=lesson->'plans'->((entry->>0)::integer);
  if q is null or q->>'type' not in('subjective_use','subjective_recall','subjective_context','subjective_dialogue') then return false;end if;
  expected_type:=case when q->>'type'='subjective_use' then 'sentence_use' when q->>'type'='subjective_recall' and not(q?'authored') then 'definition_recall' else 'context_answer' end;
  if p_request-'assignmentId' is distinct from jsonb_build_object('targetWord',q#>>'{w,w}','definition',q#>>'{w,d}',
   'question',(q->>'q')||chr(10)||'지문: '||coalesce(q->>'ctx',''),'taskType',expected_type,
   'acceptedAnswers',coalesce(q->'acceptedAnswers','[]'),'allowNaturalDerivations',coalesce(q->'allowNaturalDerivations','[]')) then return false;end if;
  if q#>>'{validation,source}' in('sentence_use_template','fixed_recall_template') then return coalesce(vocab_private.sentence_use_question_accepted(q,plan),false);
  elsif q?'authored' then return coalesce(vocab_private.authored_question_accepted(q,owner_id),false);
  end if;
  return exists(select 1 from vocab_private.question_bank b where b.user_id=owner_id and b.word=q#>>'{w,w}' and b.task_type=q->>'type' and b.question->>'q'=q->>'q' and coalesce(b.question->>'ctx','')=coalesce(q->>'ctx','') and b.question#>>'{w,d}'=q#>>'{w,d}' and coalesce(b.question->'acceptedAnswers','[]')=coalesce(q->'acceptedAnswers','[]'));
 end if;
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
end $function$;

CREATE OR REPLACE FUNCTION vocab_private.read_vocab_grade_status(p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid:=auth.uid(); row vocab_private.grading_cache; state text;
begin
 if owner_id is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid grade request' using errcode='42501';end if;
 select * into row from vocab_private.grading_cache where user_id=owner_id and request_hash=p_hash;
 if not found then return jsonb_build_object('status','retryable');end if;
 if row.result is not null then return jsonb_build_object('status','ready','result',row.result);end if;
 if row.provider_response_id is not null then
  state:=case when row.provider_status in ('incomplete','failed','cancelled') then 'recovery_required' else 'pending' end;
  return jsonb_build_object('status',state,'providerId',row.provider_response_id,'providerResponse',row.provider_response,'lease',row.lease);
 end if;
 if row.lease_until>now() then return jsonb_build_object('status','pending','startReserved',row.provider_started,'lease',row.lease);end if;
 if row.provider_started then return jsonb_build_object('status','recovery_required');end if;
 return jsonb_build_object('status','retryable');
end $function$;
