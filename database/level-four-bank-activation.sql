-- Register the new bank revision while keeping both previous revisions valid.
CREATE OR REPLACE FUNCTION vocab_private.reserve_usable(p_payload jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; q jsonb; st jsonb; h jsonb; used text[];
begin
 if p_payload->>'coveragePolicy' is distinct from 'lower-stage-usage-12.16.19' then return false;end if;
 if not vocab_private.review_packet_valid(p_payload,l) then return false;end if;
 if not vocab_private.practice_pool_valid(p_payload,l,(p_payload->>'account')::uuid) then return false;end if;
 if p_payload->>'plannedFor' is distinct from to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD') then return false;end if;
 if p_payload->>'account'='06c78577-b96e-4919-b979-58683ff5946e' and not coalesce(p_payload->>'bankRevision'=any(array['vocab-bank-20261008-1-2-3-7-8-v1','vocab-bank-20261012-essential-v1','vocab-bank-20261013-level4-v1']),false) then return false;end if;
 if p_payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or p_payload->>'selectionPolicy' is distinct from 'target-band-12.9' or p_payload#>>'{budget,policy}' is distinct from 'daily-5-new-10-review-use-unlimited-12.16.4' or not vocab_private.packet_complete(p_payload)
  or abs(coalesce((p_payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35 then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x
  join public.curriculum_words c on c.word=x#>>'{w,w}'
  where c.quality_status='rejected' or c.band<>coalesce((x#>>'{w,band}')::integer,0)) then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x where coalesce((x->>'review')::boolean,false)=false and coalesce((x#>>'{w,band}')::numeric,0) not between greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)) and least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1)) and not vocab_private.coverage_plan_valid(x,l,(p_payload->>'difficulty')::numeric)) then return false;end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION vocab_private.authored_question_accepted(q jsonb, p_owner uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b vocab_private.bank_authoring_items; expected_prompt text; actual_options jsonb; canonical_options jsonb;
begin
 if p_owner is distinct from '06c78577-b96e-4919-b979-58683ff5946e'::uuid
 or q#>>'{authored,owner}' is distinct from p_owner::text
 or not coalesce(q#>>'{authored,revision}'=any(array['vocab-bank-20261008-1-2-3-7-8-v1','vocab-bank-20261012-essential-v1','vocab-bank-20261013-level4-v1']),false)
 or q#>>'{validation,source}' is distinct from 'authored_bank'
 or q#>>'{validation,sourceRevision}' is distinct from q#>>'{authored,revision}'
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
end $function$
;
CREATE OR REPLACE FUNCTION vocab_private.coverage_plan_valid(x jsonb, l jsonb, p_level numeric)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(x->>'coveragePolicy'='lower-stage-usage-12.16.19',false)
  and coalesce((x->>'coverageOriginLevel')::numeric,0)=p_level
  and not vocab_private.coverage_usage_confirmed(l,x#>>'{w,w}')
  and exists(select 1 from public.curriculum_words c where c.word=x#>>'{w,w}'
   and c.quality_status<>'rejected' and c.band>=2 and c.band<floor(p_level)
   and c.band<floor(coalesce((l->>'difficulty')::numeric,2))
   and c.band=coalesce((x#>>'{w,band}')::numeric,0)
   and (c.definition=x#>>'{w,d}' or exists(select 1 from vocab_private.bank_authoring_items b
    where b.user_id='06c78577-b96e-4919-b979-58683ff5946e'::uuid
     and b.batch_key in ('vocab-bank-20261008-1-2-3-7-8-v1','vocab-bank-20261012-essential-v1','vocab-bank-20261013-level4-v1')
     and b.word=c.word and b.status='authored_draft' and b.word_snapshot->>'definition'=x#>>'{w,d}')));
$function$
;
REVOKE ALL ON FUNCTION vocab_private.authored_question_accepted(jsonb,uuid),vocab_private.reserve_usable(jsonb,jsonb),vocab_private.coverage_plan_valid(jsonb,jsonb,numeric) FROM PUBLIC,anon,authenticated;
