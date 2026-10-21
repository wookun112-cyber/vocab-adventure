-- 12.16.44: accept both numbered-round policies across start, reserves and unfinished review.
-- CREATE OR REPLACE retains existing ownership and execute grants. No learner rows are changed.
-- Full 25+5 rounds; retain all owner/capability checks and old interrupted packets.
CREATE OR REPLACE FUNCTION vocab_private.ensure_prepared_lesson(p_profile text, p_snapshot text, p_retry boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j vocab_private.preparations; active jsonb; result jsonb; day text;
begin
 if auth.uid() is null or p_profile not in ('ayoung','inseong','guest') then return null; end if;
 if p_snapshot is null or octet_length(p_snapshot)>200000 then raise exception 'Invalid snapshot'; end if;
 -- Existing recovery rules keep the exact original interrupted lesson.
 result:=vocab_private.get_prepared_lesson(p_profile,null);
 select state#>array['users',p_profile,'activeLesson'] into active from public.app_state where user_id=auth.uid();
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile for update;
 perform vocab_private.refresh_reserve(j.id,p_snapshot);
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
 day:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
 if coalesce(active,'null')='null' and j.payload is not null and
  (j.payload->>'snapshot' is distinct from p_snapshot or
   ((p_snapshot like '%round-25-errors-5-12.16.39%' or p_snapshot like '%round-adaptive-breadth-25-5-20261019%') and not coalesce(j.payload->>'roundPolicy' in ('round-25-errors-5-12.16.39','round-adaptive-breadth-25-5-20261019'),false)) or
   j.payload->>'retentionPolicy' is distinct from 'learned-word-retention-12.16.22' or
   j.payload->>'coveragePolicy' is distinct from 'lower-stage-usage-12.16.19' or
   j.payload->>'reviewPolicy' is distinct from 'due-review-5-10-12.16.6' or
   j.payload#>>'{budget,policy}' is distinct from 'daily-5-new-10-review-use-unlimited-12.16.4' or
   j.payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or j.payload->>'selectionPolicy' is distinct from 'target-band-12.9' or
   j.payload->>'plannedFor' is distinct from day or
   exists(select 1 from jsonb_array_elements(coalesce(j.payload->'plans','[]')) x
    join public.curriculum_words c on c.word=x#>>'{w,w}'
    where c.quality_status='rejected' or c.band<>coalesce((x#>>'{w,band}')::integer,0))) then
  perform vocab_private.enqueue(auth.uid(),p_profile);
  select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
 end if;
 if p_retry then
  update vocab_private.lesson_reserves set status='pending',attempts=0,lease=null,payload=payload-'preparationBlocked'-'preparationError',next_attempt=now(),updated_at=now()
  where user_id=auth.uid() and profile=p_profile and status not in ('ready','consumed') and attempts>=8;
  perform vocab_private.kick_reserve((select id from vocab_private.lesson_reserves where user_id=auth.uid() and profile=p_profile and status='pending' and attempts=0));
 end if;
 -- Explicit retry retains every validated peer and rejects any old worker lease.
 if p_retry and j.attempts>=8 and j.status not in ('ready','consumed') then
  update vocab_private.preparations set status='pending',attempts=0,lease=null,payload=payload-'preparationBlocked'-'preparationError',next_attempt=now(),updated_at=now() where id=j.id;
 end if;
 if p_retry and j.status='pending' and j.attempts<8 then
  update vocab_private.preparations set next_attempt=now() where id=j.id;
 end if;
 perform vocab_private.refresh_reserve(j.id,p_snapshot);
 perform vocab_private.kick_preparation(j.id);
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
 return jsonb_build_object('id',j.id,'status',case when j.attempts>=8 and not vocab_private.packet_complete(j.payload) then 'failed' else j.status end,'payload',j.payload);
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
 if not vocab_private.practice_pool_valid(p_payload,(select state#>array['users',p_payload->>'profile'] from public.app_state where user_id=bound_owner),bound_owner) then raise exception 'Invalid practice pool';end if;
 if not vocab_private.review_packet_valid(p_payload,(select state#>array['users',p_payload->>'profile'] from public.app_state where user_id=bound_owner)) then raise exception 'Invalid review window';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'ready','[]')) r where
  case when r#>>'{1,validation,source}'in ('sentence_use_template','fixed_recall_template') then not vocab_private.sentence_use_question_accepted(r->1,p_payload->'plans'->((r->>0)::integer))
  when r->1 ? 'authored' or r#>>'{1,validation,source}'='authored_bank' then not coalesce(vocab_private.authored_question_accepted(r->1,bound_owner),false)
  else false end) then raise exception 'Invalid saved bank or template question';end if;
 if octet_length(p_payload::text)>2000000 or (jsonb_array_length(coalesce(p_payload->'newWords','[]'))<>0 and (not coalesce(p_payload->>'roundPolicy' in ('round-25-errors-5-12.16.39','round-adaptive-breadth-25-5-20261019'),false) or jsonb_array_length(p_payload->'newWords')>5)) then raise exception 'Invalid reserve';end if;
 if p_payload->>'preparationError' ~ 'credit_balance_exhausted|insufficient_quota' then p_payload:=jsonb_set(p_payload,'{preparationBlocked}','"ai_credit_exhausted"'); end if;
 update vocab_private.lesson_reserves set payload=p_payload,status=case when p_payload#>>'{budget,waitingForReviews}'='true' then 'waiting' when p_failed then 'pending' when vocab_private.packet_complete(p_payload) then 'ready' else 'working' end,
  attempts=case when p_payload->>'preparationBlocked'='ai_credit_exhausted' then 8 else attempts end,
  updated_at=now(),next_attempt=case when p_failed then now()+interval '45 seconds' else now()+interval '6 minutes' end
  where id=p_id and capability=p_key and lease=p_lease and status='working' returning * into j;
 if not found then return false;end if;
 perform vocab_private.cache_packet(j.user_id,p_payload);return true;
end $function$
;
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
 if p_payload->>'account'='06c78577-b96e-4919-b979-58683ff5946e' and not coalesce(p_payload->>'bankRevision'=any(array['vocab-bank-20261008-1-2-3-7-8-v1','vocab-bank-20261012-essential-v1','vocab-bank-20261013-level4-v1','vocab-bank-20261014-level5-6-v1','vocab-bank-20261014-level9-v1','vocab-bank-offline-20261014-v1','vocab-discrimination-20261015-v1']),false) then return false;end if;
 if p_payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or p_payload->>'selectionPolicy' is distinct from 'target-band-12.9' or p_payload#>>'{budget,policy}' is distinct from 'daily-5-new-10-review-use-unlimited-12.16.4' or not vocab_private.packet_complete(p_payload)
  or abs(coalesce((p_payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35 then return false;end if;
 if p_payload->>'roundPolicy' in ('round-25-errors-5-12.16.39','round-adaptive-breadth-25-5-20261019') and exists(select 1 from jsonb_array_elements(p_payload->'plans') x where coalesce(x->>'review','false')='false' and (coalesce((l#>>array['words',x#>>'{w,w}','seen'])::integer,0)>0 or l#>>array['words',x#>>'{w,w}','introducedAt'] is not null)) then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x
  join public.curriculum_words c on c.word=x#>>'{w,w}'
  where c.quality_status='rejected' or c.band<>coalesce((x#>>'{w,band}')::integer,0)) then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x where coalesce((x->>'review')::boolean,false)=false and coalesce((x#>>'{w,band}')::numeric,0) not between greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)) and least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1)) and not vocab_private.coverage_plan_valid(x,l,(p_payload->>'difficulty')::numeric)) then return false;end if;
 for r in select value from jsonb_array_elements(p_payload->'ready') loop
  q:=r->1;st:=l#>array['words',q#>>'{w,w}'];
  if ((st is null or (coalesce((st->>'seen')::integer,0)=0 and st->>'introducedAt' is null)) and not (p_payload->>'roundPolicy' in ('round-25-errors-5-12.16.39','round-adaptive-breadth-25-5-20261019') and coalesce(p_payload->'plans'->((r->>0)::integer)->>'review','false')='false'))
   or not coalesce((case when q#>>'{validation,source}'in ('sentence_use_template','fixed_recall_template') then vocab_private.sentence_use_question_accepted(q,p_payload->'plans'->((r->>0)::integer)) when q ? 'authored' or q#>>'{validation,source}'='authored_bank' then vocab_private.authored_question_accepted(q,(p_payload->>'account')::uuid) else
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
CREATE OR REPLACE FUNCTION vocab_private.promote_reserve(p_user uuid, p_profile text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j vocab_private.lesson_reserves; l jsonb; day text; fresh_count integer; r jsonb; q jsonb; ready jsonb:='[]'; data jsonb; st jsonb; practice boolean; plans jsonb:='[]'; pl jsonb;
begin
 select state#>array['users',p_profile] into l from public.app_state where user_id=p_user;day:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
 if coalesce(l->'activeLesson','null')<>'null' then return null;end if;
 select count(*) into fresh_count from jsonb_each(coalesce(l->'words','{}')) w where value->>'introducedAt'=day and not exists(select 1 from public.curriculum_words c where c.word=w.key and c.quality_status='rejected');
 -- New full-round reserves also work before today's first five words.
 if fresh_count<5 and not exists(select 1 from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and status='ready' and payload->>'roundPolicy' in ('round-25-errors-5-12.16.39','round-adaptive-breadth-25-5-20261019')) then return null;end if;
 for j in select * from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and status='ready' order by slot for update skip locked loop
  if not vocab_private.reserve_usable(j.payload,l) then update vocab_private.lesson_reserves set status='consumed' where id=j.id;continue;end if;
  data:=j.payload;
  if data->>'roundPolicy' in ('round-25-errors-5-12.16.39','round-adaptive-breadth-25-5-20261019') then
   data:=data||jsonb_build_object('snapshot',null,'fromReserve',true,'plannedFor',day,'created',extract(epoch from now())*1000,'account',p_user,'profile',p_profile);
   update vocab_private.lesson_reserves set status='consumed' where id=j.id;return data;
  end if;
  for r in select value from jsonb_array_elements(data->'ready') loop
   q:=r->1;st:=l#>array['words',q#>>'{w,w}'];practice:=(data->'plans'->((r->>0)::integer)->>'coveragePolicy'='lower-stage-usage-12.16.19') or coalesce(st->>'nextReviewAt','')>day or st->>'lastFeedbackDate'=day or st->>'introducedAt'=day;
   q:=q||jsonb_build_object('needsCard',false,'learningCard',null,'practiceOnly',coalesce(practice,false));ready:=ready||jsonb_build_array(jsonb_build_array(r->0,q));
  end loop;
  for r in select value from jsonb_array_elements(ready) loop
   pl:=data->'plans'->((r->>0)::integer);plans:=plans||jsonb_build_array(pl||jsonb_build_object('needsCard',false,'practiceOnly',r#>'{1,practiceOnly}'));
  end loop;
  data:=data||jsonb_build_object('plans',plans,'ready',ready,'snapshot',null,'fromReserve',true,'newWords','[]'::jsonb,'introAt',0,'plannedFor',day,'created',extract(epoch from now())*1000,'account',p_user,'profile',p_profile);
  data:=jsonb_set(data,'{budget,newCount}','0');update vocab_private.lesson_reserves set status='consumed' where id=j.id;return data;
 end loop;
 return null;
end $function$
;
CREATE OR REPLACE FUNCTION vocab_private.unfinished_plan_valid(x jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare name text:=x#>>'{w,w}'; item jsonb; st jsonb; completed numeric; assigned numeric;
begin
 item:=l#>array['unfinishedUsage',name];st:=l#>array['words',name];
 if item is null or x->>'carryoverPolicy' is distinct from 'unfinished-usage-12.16.32'
  or x->>'review' is distinct from 'true' or not coalesce(x->>'type' in ('subjective_use','subjective_recall'),false)
  or x->>'practiceOnly' is distinct from 'true' or x->>'levelEligible' is distinct from 'false'
  or coalesce(x->>'needsCard','false')<>'false' or coalesce(x->>'firstLearning','false')<>'false'
  or item#>>'{word,w}' is distinct from name
  or coalesce(item->>'day','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or (item->>'day'>=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD') and not (
   item->>'day'=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD') and item->>'carryNextRound'='true'
   and l#>>array['studyHistory','entries',item->>'lessonId','status']='completed'
   and l#>>array['studyHistory','entries',item->>'lessonId','roundPolicy'] in ('round-25-errors-5-12.16.39','round-adaptive-breadth-25-5-20261019')
   and coalesce(l#>array['studyHistory','entries',item->>'lessonId','unfinishedWords'],'[]') ? name))
  or not exists(select 1 from public.curriculum_words c where c.word=name and c.quality_status<>'rejected'
   and c.band>=2 and c.band=(x#>>'{w,band}')::numeric) then return false;end if;
 assigned:=coalesce((item->>'assignedAt')::numeric,0);
 completed:=coalesce((st->>'usageConfirmedStamp')::numeric,0);
 if completed=0 and st->>'usageConfirmedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
  completed:=extract(epoch from ((st->>'usageConfirmedAt')::date::timestamp at time zone 'Asia/Seoul'))*1000;
 end if;
 return assigned>0 and assigned<=extract(epoch from now())*1000 and completed<assigned;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then return false;
end $function$
;
