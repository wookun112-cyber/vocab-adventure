-- A downloaded pool can only contain validated alternatives for this packet's targets.
create or replace function vocab_private.practice_pool_valid(p_payload jsonb,l jsonb,p_owner uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare q jsonb;p jsonb;v jsonb;
begin
 if not (p_payload ? 'deliveryPolicy') and not (p_payload ? 'practicePool') then return true;end if;
 if p_payload->>'deliveryPolicy' is distinct from 'bundled-practice-12.16.8'
  or jsonb_typeof(p_payload->'practicePool') is distinct from 'array'
  or jsonb_array_length(p_payload->'practicePool')>150 then return false;end if;
 for q in select value from jsonb_array_elements(p_payload->'practicePool') loop
  select value into p from jsonb_array_elements(p_payload->'plans') where value#>>'{w,w}'=q#>>'{w,w}' limit 1;
  if p is null or q#>'{w,w}' is distinct from p#>'{w,w}' or q#>'{w,d}' is distinct from p#>'{w,d}'
   or q#>'{w,band}' is distinct from p#>'{w,band}' or q->>'type' not in ('mc_context','mc_usage','subjective_recall','subjective_use')
   or q->>'taskDemand' is distinct from (case when p->>'taskDemand'='initial-practice' then 'standard' else p->>'taskDemand' end)
   or coalesce(q->'needsCard','false') is distinct from 'false'::jsonb or coalesce(q->'learningCard','null') is distinct from 'null'::jsonb then return false;end if;
  if q#>>'{validation,source}'='sentence_use_template' then
   if not vocab_private.sentence_use_question_accepted(q,jsonb_build_object('w',p->'w','type','subjective_use','needsCard',false)) then return false;end if;
  else
   if coalesce(q->>'bankReaderLevel','') !~ '^[0-9]+(\.[0-9]+)?$'
    or abs((q->>'bankReaderLevel')::numeric-coalesce((l->>'difficulty')::numeric,2))>.35
    or coalesce(q->>'bankSupportLevel','') !~ '^[0-3]$' then return false;end if;
   if q#>>'{validation,source}'='authored_bank' then
    if not coalesce(vocab_private.authored_question_accepted(q,p_owner),false) then return false;end if;
   else
    v:=q->'validation';
    if not coalesce(v->>'policy'='vocabulary-level-fit-12.13' and v->'aiVerified'='true'::jsonb and v->'deterministic'='true'::jsonb
      and v#>'{checks,coherentSituation}'='true'::jsonb and v#>'{checks,vocabularyFocus}'='true'::jsonb and v#>'{checks,levelDemandFit}'='true'::jsonb
      and (q->>'type' not like 'mc_%' or (jsonb_array_length(q->'opts')=5 and (select count(*) from jsonb_array_elements(q->'opts') o where o->'ok'='true'::jsonb)=1
        and (q->>'taskDemand'<>'advanced' or v#>'{checks,semanticContrast}'='true'::jsonb))),false) then return false;end if;
   end if;
  end if;
 end loop;
 return true;
exception when others then return false;
end; $$;
revoke all on function vocab_private.practice_pool_valid(jsonb,jsonb,uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION vocab_private.reserve_usable(p_payload jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; q jsonb; st jsonb; h jsonb; used text[];
begin
 if not vocab_private.review_packet_valid(p_payload,l) then return false;end if;
 if not vocab_private.practice_pool_valid(p_payload,l,(p_payload->>'account')::uuid) then return false;end if;
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
 if not vocab_private.practice_pool_valid(p_payload,(select state#>array['users',p_payload->>'profile'] from public.app_state where user_id=bound_owner),bound_owner) then raise exception 'Invalid practice pool';end if;
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
 if not vocab_private.practice_pool_valid(p_payload,(select state#>array['users',p_payload->>'profile'] from public.app_state where user_id=bound_owner),bound_owner) then raise exception 'Invalid practice pool';end if;
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
