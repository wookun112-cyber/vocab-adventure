-- Canonical authored-bank acceptance. No learner state, RLS policy or public data grants change.
create or replace function vocab_private.authored_question_accepted(q jsonb,p_owner uuid)
returns boolean language plpgsql stable security definer set search_path='' as $fn$
declare b vocab_private.bank_authoring_items; expected_prompt text; actual_options jsonb; canonical_options jsonb;
begin
 if p_owner is distinct from '06c78577-b96e-4919-b979-58683ff5946e'::uuid
 or q#>>'{authored,owner}' is distinct from p_owner::text
 or q#>>'{authored,revision}' is distinct from 'vocab-bank-20261008-1-2-3-7-8-v1'
 or q#>>'{validation,source}' is distinct from 'authored_bank'
 or q#>>'{validation,sourceRevision}' is distinct from 'vocab-bank-20261008-1-2-3-7-8-v1'
 or q#>>'{validation,schemaChecked}' is distinct from 'true'
 or q#>>'{validation,deterministic}' is distinct from 'true'
 or q#>>'{validation,aiVerified}' is distinct from 'false'
 or q#>>'{authored,word}' is distinct from q#>>'{w,w}'
 or coalesce(q#>>'{authored,slot}','') !~ '^(10|[1-9])$' then return false;end if;
 select * into b from vocab_private.bank_authoring_items
 where user_id=p_owner and batch_key=q#>>'{authored,revision}' and word=q#>>'{w,w}'
 and slot=(q#>>'{authored,slot}')::integer and status='authored_draft';
 if not found or q->>'type' is distinct from b.task_type or q#>>'{w,d}' is distinct from b.word_snapshot->>'definition'
 or q#>>'{authored,sourceBand}' is distinct from b.band::text
 or q#>>'{authored,band}' is distinct from q#>>'{w,band}' then return false;end if;
 if b.slot=10 then
  expected_prompt:='‘'||b.word||'’'||case when (ascii(right(b.word,1))-44032)%28=0 then '를' else '을' end||' 넣어 뜻이 드러나는 문장 하나를 만들어 보세요.';
  return q->>'q'=expected_prompt and q->>'ctx'='' and q->>'semanticGraderRequired'='true'
   and q->>'showTarget'='true' and jsonb_array_length(coalesce(q->'opts','[]'))=0
   and jsonb_array_length(coalesce(q->'acceptedAnswers','[]'))=0
   and coalesce(q->'allowNaturalDerivations','[]')=coalesce(b.question#>'{grading,allowNaturalDerivations}','[]');
 end if;
 if q->>'q' is distinct from b.question->>'prompt' or q->>'ctx' is distinct from b.question->>'context' then return false;end if;
 if b.slot<=6 then
  select jsonb_agg(jsonb_build_object('text',o->>'t','correct',(o->>'ok')::boolean) order by o->>'t') into actual_options from jsonb_array_elements(coalesce(q->'opts','[]')) o;
  select jsonb_agg(jsonb_build_object('text',o->>'text','correct',(o->>'correct')::boolean) order by o->>'text') into canonical_options from jsonb_array_elements(b.question->'options') o;
  return actual_options=canonical_options and jsonb_array_length(q->'opts')=5;
 end if;
 return jsonb_array_length(coalesce(q->'opts','[]'))=0 and q->>'showTarget'='false'
  and (select jsonb_agg(o->>'text' order by o->>'text') from jsonb_array_elements(q->'acceptedAnswers') o)
   =(select jsonb_agg(o#>>'{}' order by o#>>'{}') from jsonb_array_elements(b.question->'acceptedAnswers') o);
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $fn$;
revoke all on function vocab_private.authored_question_accepted(jsonb,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION vocab_private.reserve_usable(p_payload jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; q jsonb; st jsonb; h jsonb; used text[];
begin
 if p_payload->>'account'='06c78577-b96e-4919-b979-58683ff5946e' and p_payload->>'bankRevision' is distinct from 'vocab-bank-20261008-1-2-3-7-8-v1' then return false;end if;
 if p_payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or p_payload->>'selectionPolicy' is distinct from 'target-band-12.9' or p_payload#>>'{budget,policy}' is distinct from 'daily-5-new-20-review-use-unlimited-12.15' or not vocab_private.packet_complete(p_payload)
  or abs(coalesce((p_payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35 then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x
  join public.curriculum_words c on c.word=x#>>'{w,w}'
  where c.quality_status='rejected' or c.band<>coalesce((x#>>'{w,band}')::integer,0)) then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x where coalesce((x->>'review')::boolean,false)=false and coalesce((x#>>'{w,band}')::numeric,0) not between greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)) and least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1))) then return false;end if;
 for r in select value from jsonb_array_elements(p_payload->'ready') loop
  q:=r->1;st:=l#>array['words',q#>>'{w,w}'];
  if st is null or (coalesce((st->>'seen')::integer,0)=0 and st->>'introducedAt' is null)
   or not coalesce((case when q ? 'authored' or q#>>'{validation,source}'='authored_bank' then vocab_private.authored_question_accepted(q,(p_payload->>'account')::uuid) else
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
end $function$
;
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
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'ready','[]')) r where (r->1 ? 'authored' or r#>>'{1,validation,source}'='authored_bank') and not coalesce(vocab_private.authored_question_accepted(r->1,bound_owner),false)) then raise exception 'Invalid authored bank question';end if;
 if octet_length(p_payload::text)>2000000 then raise exception 'Preparation too large'; end if;
 if p_payload->>'preparationError' ~ 'credit_balance_exhausted|insufficient_quota' then p_payload:=jsonb_set(p_payload,'{preparationBlocked}','"ai_credit_exhausted"'); end if;
 update vocab_private.preparations set payload=p_payload,
  status=case when p_failed then 'pending' when vocab_private.packet_complete(p_payload) then case when is_consumed then 'consumed' else 'ready' end else 'working' end,
  attempts=case when p_payload->>'preparationBlocked'='ai_credit_exhausted' then 8 else attempts end,
  updated_at=now(),next_attempt=case when p_failed then now()+interval '45 seconds' else now()+interval '6 minutes' end
 where id=p_id and capability=p_key and lease=p_lease and status='working' returning user_id into saved_user;
 if not found then return false; end if;
 perform vocab_private.cache_packet(saved_user,p_payload);
 return true;
end $function$
;
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
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'ready','[]')) r where r->1 ? 'authored' and not vocab_private.authored_question_accepted(r->1,bound_owner)) then raise exception 'Invalid authored bank question';end if;
 if octet_length(p_payload::text)>2000000 or jsonb_array_length(coalesce(p_payload->'newWords','[]'))<>0 then raise exception 'Invalid reserve';end if;
 if p_payload->>'preparationError' ~ 'credit_balance_exhausted|insufficient_quota' then p_payload:=jsonb_set(p_payload,'{preparationBlocked}','"ai_credit_exhausted"'); end if;
 update vocab_private.lesson_reserves set payload=p_payload,status=case when p_failed then 'pending' when vocab_private.packet_complete(p_payload) then 'ready' else 'working' end,
  attempts=case when p_payload->>'preparationBlocked'='ai_credit_exhausted' then 8 else attempts end,
  updated_at=now(),next_attempt=case when p_failed then now()+interval '45 seconds' else now()+interval '6 minutes' end
  where id=p_id and capability=p_key and lease=p_lease and status='working' returning * into j;
 if not found then return false;end if;
 perform vocab_private.cache_packet(j.user_id,p_payload);return true;
end $function$
;