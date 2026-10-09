-- Fixed, example-free own-sentence instructions. Student answers still require semantic grading.
create or replace function vocab_private.sentence_use_question_accepted(q jsonb, p_plan jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare word text:=q#>>'{w,w}'; expected_prompt text;
begin
 if coalesce(word,'')='' or length(word)>80 or coalesce(q#>>'{w,d}','')='' or coalesce(q#>>'{w,band}','') !~ '^[1-9]$'
  or jsonb_typeof(q#>'{w,w}') is distinct from 'string' or jsonb_typeof(q#>'{w,d}') is distinct from 'string' or jsonb_typeof(q#>'{w,band}') is distinct from 'number'
  or q->>'type' is distinct from 'subjective_use' or p_plan->>'type' is distinct from 'subjective_use'
  or q#>'{w,w}' is distinct from p_plan#>'{w,w}' or q#>'{w,d}' is distinct from p_plan#>'{w,d}'
  or q#>'{w,band}' is distinct from p_plan#>'{w,band}'
  or coalesce(q->'needsCard','false') is distinct from 'false'::jsonb or coalesce(p_plan->'needsCard','false') is distinct from 'false'::jsonb
  or coalesce(q->'learningCard','null') is distinct from 'null'::jsonb or coalesce(q->'authored','null') is distinct from 'null'::jsonb then return false;end if;
 expected_prompt:='‘'||word||'’'||case when ascii(right(word,1)) between 44032 and 55203 and (ascii(right(word,1))-44032)%28<>0 then '을' else '를' end||' 넣어 뜻이 드러나는 문장 하나를 만들어 보세요.';
 return coalesce(q#>>'{validation,policy}'='vocabulary-level-fit-12.13'
  and q#>>'{validation,source}'='sentence_use_template'
  and q#>>'{validation,sourceRevision}'='sentence-use-template-12.16.7'
  and q#>'{validation,schemaChecked}'='true'::jsonb and q#>'{validation,deterministic}'='true'::jsonb
  and q#>'{validation,aiVerified}'='false'::jsonb
  and q->>'q'=expected_prompt and q->>'ctx'='' and q->>'answerForm'=word
  and q->'showTarget'='true'::jsonb and q->'hideWord'='false'::jsonb and q->'open'='true'::jsonb
  and q->'opts'='[]'::jsonb and q->'acceptedAnswers'='[]'::jsonb and q->'allowNaturalDerivations'='[]'::jsonb
  and q->'semanticGraderRequired'='true'::jsonb
  and q->'hints'='["이 단어가 필요한 일을 직접 떠올려 보세요.","문장을 읽고 이 단어의 뜻이 알맞게 쓰였는지 확인해 보세요."]'::jsonb
  and q->>'feedbackCorrect'='단어의 뜻이 드러나게 쓴 문장을 확인했어요.'
  and q->>'signature'='sentence-use-template-12.16.7:'||word,false);
end $$;
revoke all on function vocab_private.sentence_use_question_accepted(jsonb,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION vocab_private.reserve_usable(p_payload jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; q jsonb; st jsonb; h jsonb; used text[];
begin
 if not vocab_private.review_packet_valid(p_payload,l) then return false;end if;
 if p_payload->>'plannedFor' is distinct from to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD') then return false;end if;
 if p_payload->>'account'='06c78577-b96e-4919-b979-58683ff5946e' and p_payload->>'bankRevision' is distinct from 'vocab-bank-20261008-1-2-3-7-8-v1' then return false;end if;
 if p_payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or p_payload->>'selectionPolicy' is distinct from 'target-band-12.9' or p_payload#>>'{budget,policy}' is distinct from 'daily-5-new-10-review-use-unlimited-12.16.4' or not vocab_private.packet_complete(p_payload)
  or abs(coalesce((p_payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35 then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x
  join public.curriculum_words c on c.word=x#>>'{w,w}'
  where c.quality_status='rejected' or c.band<>coalesce((x#>>'{w,band}')::integer,0)) then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x where coalesce((x->>'review')::boolean,false)=false and coalesce((x#>>'{w,band}')::numeric,0) not between greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)) and least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1))) then return false;end if;
 for r in select value from jsonb_array_elements(p_payload->'ready') loop
  q:=r->1;st:=l#>array['words',q#>>'{w,w}'];
  if st is null or (coalesce((st->>'seen')::integer,0)=0 and st->>'introducedAt' is null)
   or not coalesce((case when q#>>'{validation,source}'='sentence_use_template' then vocab_private.sentence_use_question_accepted(q,p_payload->'plans'->((r->>0)::integer)) when q ? 'authored' or q#>>'{validation,source}'='authored_bank' then vocab_private.authored_question_accepted(q,(p_payload->>'account')::uuid) else
   q#>>'{validation,policy}'='vocabulary-level-fit-12.13' and q#>>'{validation,aiVerified}'='true'
   and q#>>'{validation,deterministic}'='true' and q#>>'{validation,checks,coherentSituation}'='true'
   and q#>>'{validation,checks,vocabularyFocus}'='true' and q#>>'{validation,checks,levelDemandFit}'='true' end),false)
   or coalesce((p_payload->'plans'->((r->>0)::integer)->>'supportLevel')::integer,0)<coalesce((st->>'supportLevel')::integer,0)
   or exists(select 1 from public.curriculum_words where word=q#>>'{w,w}' and quality_status='rejected') then return false;end if;
  if coalesce(q->'bankPassageKeys','[]') ?| array(select jsonb_array_elements_text(coalesce(st->'usedPassageKeys','[]'))) then return false;end if;
  for h in select value from jsonb_array_elements(coalesce(st->'problemHistory','[]')) loop
   used:=vocab_private.question_sentences(jsonb_build_object('ctx',h->>'context','opts',coalesce((select jsonb_agg(jsonb_build_object('t',o)) from jsonb_array_elements_text(coalesce(h->'options','[]')) o),'[]')));
   if vocab_private.question_sentences(q)&&used then return false;end if;
  end loop;
 end loop;
 return true;
end $function$;

CREATE OR REPLACE FUNCTION vocab_private.save_preparation(p_id uuid, p_key uuid, p_lease uuid, p_payload jsonb, p_failed boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare saved_user uuid; bound_owner uuid;
begin
 select user_id into bound_owner from vocab_private.preparations where id=p_id and capability=p_key and lease=p_lease and status='working';
 if not found then return false;end if;
 if p_payload->>'account' is distinct from bound_owner::text then raise exception 'Preparation owner mismatch';end if;
 if not exists(select 1 from public.app_state a where a.user_id=bound_owner and p_payload->>'resumeId'=a.state#>>array['users',p_payload->>'profile','activeLesson','id'] and p_payload->'plans'=a.state#>array['users',p_payload->>'profile','activeLesson','plans']) and not vocab_private.review_packet_valid(p_payload,(select state#>array['users',p_payload->>'profile'] from public.app_state where user_id=bound_owner)) then raise exception 'Invalid review window';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'ready','[]')) r where
  case when r#>>'{1,validation,source}'='sentence_use_template' then not vocab_private.sentence_use_question_accepted(r->1,p_payload->'plans'->((r->>0)::integer))
  when r->1 ? 'authored' or r#>>'{1,validation,source}'='authored_bank' then not coalesce(vocab_private.authored_question_accepted(r->1,bound_owner),false)
  else false end) then raise exception 'Invalid saved bank or template question';end if;
 if octet_length(p_payload::text)>2000000 then raise exception 'Preparation too large'; end if;
 if p_payload->>'preparationError' ~ 'credit_balance_exhausted|insufficient_quota' then p_payload:=jsonb_set(p_payload,'{preparationBlocked}','"ai_credit_exhausted"'); end if;
 update vocab_private.preparations set payload=p_payload,
  status=case when p_payload#>>'{budget,waitingForReviews}'='true' then 'waiting' when p_failed then 'pending' when vocab_private.packet_complete(p_payload) then case when is_consumed then 'consumed' else 'ready' end else 'working' end,
  attempts=case when p_payload->>'preparationBlocked'='ai_credit_exhausted' then 8 else attempts end,
  updated_at=now(),next_attempt=case when p_failed then now()+interval '45 seconds' else now()+interval '6 minutes' end
 where id=p_id and capability=p_key and lease=p_lease and status='working' returning user_id into saved_user;
 if not found then return false; end if;
 perform vocab_private.cache_packet(saved_user,p_payload);
 return true;
end $function$;

CREATE OR REPLACE FUNCTION vocab_private.save_reserve_preparation(p_id uuid, p_key uuid, p_lease uuid, p_payload jsonb, p_failed boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j vocab_private.lesson_reserves; bound_owner uuid;
begin
 select user_id into bound_owner from vocab_private.lesson_reserves where id=p_id and capability=p_key and lease=p_lease and status='working';
 if not found then return false;end if;
 if p_payload->>'account' is distinct from bound_owner::text then raise exception 'Preparation owner mismatch';end if;
 if not vocab_private.review_packet_valid(p_payload,(select state#>array['users',p_payload->>'profile'] from public.app_state where user_id=bound_owner)) then raise exception 'Invalid review window';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'ready','[]')) r where
  case when r#>>'{1,validation,source}'='sentence_use_template' then not vocab_private.sentence_use_question_accepted(r->1,p_payload->'plans'->((r->>0)::integer))
  when r->1 ? 'authored' or r#>>'{1,validation,source}'='authored_bank' then not coalesce(vocab_private.authored_question_accepted(r->1,bound_owner),false)
  else false end) then raise exception 'Invalid saved bank or template question';end if;
 if octet_length(p_payload::text)>2000000 or jsonb_array_length(coalesce(p_payload->'newWords','[]'))<>0 then raise exception 'Invalid reserve';end if;
 if p_payload->>'preparationError' ~ 'credit_balance_exhausted|insufficient_quota' then p_payload:=jsonb_set(p_payload,'{preparationBlocked}','"ai_credit_exhausted"'); end if;
 update vocab_private.lesson_reserves set payload=p_payload,status=case when p_payload#>>'{budget,waitingForReviews}'='true' then 'waiting' when p_failed then 'pending' when vocab_private.packet_complete(p_payload) then 'ready' else 'working' end,
  attempts=case when p_payload->>'preparationBlocked'='ai_credit_exhausted' then 8 else attempts end,
  updated_at=now(),next_attempt=case when p_failed then now()+interval '45 seconds' else now()+interval '6 minutes' end
  where id=p_id and capability=p_key and lease=p_lease and status='working' returning * into j;
 if not found then return false;end if;
 perform vocab_private.cache_packet(j.user_id,p_payload);return true;
end $function$;
