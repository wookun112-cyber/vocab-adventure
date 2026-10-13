-- Lower unfinished vocabulary is scheduled inside the existing 5-new/10-review budget.
-- No learner answers, grades, active lessons or history are rewritten.
CREATE OR REPLACE FUNCTION vocab_private.coverage_usage_confirmed(l jsonb,w text)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO ''
AS $function$
 select coalesce(l#>>array['words',w,'usageConfirmedAt'],'')<>''
  or coalesce((l#>>array['words',w,'useSuccess'])::numeric,0)>0
  or jsonb_array_length(coalesce(l#>array['words',w,'useDays'],'[]'))>0
  or exists(select 1 from jsonb_array_elements(coalesce(l#>'{activeLesson,results}','[]')) r
   where r->>'word'=w and r->>'type'='subjective_use' and coalesce((r->>'credit')::numeric,0)>=1
    and r->>'contextSuccess'='true' and coalesce(r->>'hintUsed','false')<>'true'
    and coalesce(r->>'revealed','false')<>'true' and coalesce(r->>'excludedFromVocabulary','false')<>'true');
$function$;
REVOKE ALL ON FUNCTION vocab_private.coverage_usage_confirmed(jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION vocab_private.coverage_plan_valid(x jsonb,l jsonb,p_level numeric)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO ''
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
     and b.batch_key in ('vocab-bank-20261008-1-2-3-7-8-v1','vocab-bank-20261012-essential-v1')
     and b.word=c.word and b.status='authored_draft' and b.word_snapshot->>'definition'=x#>>'{w,d}')));
$function$;
REVOKE ALL ON FUNCTION vocab_private.coverage_plan_valid(jsonb,jsonb,numeric) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION vocab_private.review_packet_valid(p jsonb,l jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path TO ''
AS $function$
declare x jsonb; st jsonb; band numeric; lo numeric:=greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)); hi numeric:=least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1));
 near_count integer:=0; lower_count integer:=0; new_count integer:=0; review_count integer:=0; coverage_count integer:=0;
begin
 -- Previous workers remain acceptable for untagged packets during rollout.
 if not coalesce(p->>'reviewPolicy' in ('due-review-5-10-12.16.4','due-review-5-10-12.16.6'),false) or jsonb_typeof(p->'plans') is distinct from 'array' then return false;end if;
 if jsonb_array_length(p->'plans')=0 then return p#>>'{budget,waitingForReviews}'='true';end if;
 if (select count(distinct v.value#>>'{w,w}') from jsonb_array_elements(p->'plans') v(value))<>jsonb_array_length(p->'plans') then return false;end if;
 for x in select value from jsonb_array_elements(p->'plans') loop
  band:=coalesce((x#>>'{w,band}')::numeric,0);st:=l#>array['words',x#>>'{w,w}'];
  if x ? 'coveragePolicy' then
   if p->>'coveragePolicy' is distinct from 'lower-stage-usage-12.16.19' or not vocab_private.coverage_plan_valid(x,l,(p->>'difficulty')::numeric) then return false;end if;
   coverage_count:=coverage_count+1;
   if coalesce(x->>'review','false')='true' then
    review_count:=review_count+1;
    if st is null or (coalesce((st->>'seen')::integer,0)=0 and st->>'introducedAt' is null)
     or x->>'type' is distinct from 'subjective_use' or x->>'practiceOnly' is distinct from 'true' or coalesce(x->>'needsCard','false')='true' then return false;end if;
   else
    new_count:=new_count+1;
    if coalesce((st->>'seen')::integer,0)>0 or st->>'introducedAt' is not null
     or x->>'firstLearning' is distinct from 'true' or x->>'needsCard' is distinct from 'true' then return false;end if;
   end if;
  elsif coalesce(x->>'review','false')='true' then
   review_count:=review_count+1;
   if coalesce(p#>>'{budget,additionalPractice}','false')<>'true' and coalesce(st->>'nextReviewAt','')>to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD') then return false;end if;
   if st is null or (coalesce((st->>'seen')::integer,0)=0 and st->>'introducedAt' is null) then return false;end if;
   if band between lo and hi then near_count:=near_count+1;
   elsif band between greatest(1,lo-2) and lo-1 and vocab_private.lower_review_weakness(st,l,x#>>'{w,w}') and x->>'taskDemand'='foundation-review' then lower_count:=lower_count+1;
   else return false;end if;
  else
   new_count:=new_count+1;if band not between lo and hi then return false;end if;
  end if;
 end loop;
 return new_count<=5 and review_count<=10 and coverage_count<=2 and lower_count<=2 and lower_count*4<=near_count;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;
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
 if p_payload->>'account'='06c78577-b96e-4919-b979-58683ff5946e' and not coalesce(p_payload->>'bankRevision'=any(array['vocab-bank-20261008-1-2-3-7-8-v1','vocab-bank-20261012-essential-v1']),false) then return false;end if;
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
end $function$;

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
  where user_id=auth.uid() and profile=p_profile and payload->>'preparationBlocked'='ai_credit_exhausted' and attempts>=8;
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
end $function$;

CREATE OR REPLACE FUNCTION vocab_private.ensure_reserves(p_user uuid, p_profile text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l jsonb; s jsonb; i integer;
begin
 select state into s from public.app_state where user_id=p_user;l:=s#>array['users',p_profile];
 if l is null or not (exists(
  select 1 from jsonb_each(coalesce(l->'words','{}')) w
  left join public.curriculum_words c on c.word=w.key
  where (coalesce((w.value->>'seen')::integer,0)>0 or w.value->>'introducedAt' is not null)
   and coalesce(c.quality_status,'reviewed')<>'rejected' and w.key<>'민사 재판'
   and coalesce(c.band,(s#>>array['catalog',w.key,'band'])::integer,0)
    between greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)) and least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1))
 ) or exists(select 1 from jsonb_each(coalesce(l->'words','{}')) w join public.curriculum_words c on c.word=w.key
  where c.quality_status<>'rejected' and c.band>=2 and c.band<floor(coalesce((l->>'difficulty')::numeric,2))
   and (coalesce((w.value->>'seen')::integer,0)>0 or w.value->>'introducedAt' is not null)
   and not vocab_private.coverage_usage_confirmed(l,w.key))) then return;end if;
 for i in 1..1 loop
  insert into vocab_private.lesson_reserves(user_id,profile,slot) values(p_user,p_profile,i) on conflict(user_id,profile,slot) do nothing;
  update vocab_private.lesson_reserves set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,status='pending',payload=null,attempts=0,next_attempt=now(),updated_at=now()
   where user_id=p_user and profile=p_profile and slot=i and (status='consumed' or (status='waiting' and (payload->>'coveragePolicy' is distinct from 'lower-stage-usage-12.16.19' or payload->>'reviewPolicy' is distinct from 'due-review-5-10-12.16.6' or (payload->>'difficulty')::numeric is distinct from (l->>'difficulty')::numeric or coalesce((payload#>>'{budget,waitingStudiedTotal}')::integer,-1)<>(select count(*) from jsonb_each(coalesce(l->'words','{}')) w where coalesce((w.value->>'seen')::integer,0)>0 or w.value->>'introducedAt' is not null))) or (status='ready' and (not vocab_private.reserve_usable(payload,l) or payload->>'coveragePolicy' is distinct from 'lower-stage-usage-12.16.19' or payload->>'reviewPolicy' is distinct from 'due-review-5-10-12.16.6' or payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or payload->>'selectionPolicy' is distinct from 'target-band-12.9' or abs(coalesce((payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35)));
 end loop;
 perform vocab_private.kick_reserve((select id from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and slot=1));
end $function$;

CREATE OR REPLACE FUNCTION vocab_private.claim_preparation(p_id uuid, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j vocab_private.preparations; s jsonb; l jsonb; desired_band integer; lease_id uuid; words jsonb;
begin
 -- Worker-only capability authorization. The key lives in the private queue
 -- and the database's outbound header; account RPCs never return it.
 select * into j from vocab_private.preparations where id=p_id and capability=p_key for update;
 if not found then return vocab_private.claim_reserve(p_id,p_key); end if;
 if j.status in ('ready','consumed') or j.attempts>=8 or
   (j.status='working' and j.updated_at>now()-interval '5 minutes') then return null; end if;
 select state into s from public.app_state where user_id=j.user_id;
 l:=s#>array['users',j.profile];
 if l is null then return null; end if;
 desired_band:=greatest(1,least(9,round(coalesce((l->>'difficulty')::numeric,2))::integer));
 select jsonb_agg(to_jsonb(w)) into words from (
  select * from public.curriculum_words where quality_status<>'rejected' and
   (band between 2 and floor(coalesce((l->>'difficulty')::numeric,2))-1 or word in (select key from jsonb_each(coalesce(l->'words','{}')) where coalesce((value->>'seen')::integer,0)>0 or value->>'introducedAt' is not null)
    or id in (select id from public.curriculum_words where quality_status<>'rejected' and band between greatest(1,desired_band-1) and least(9,desired_band+1) order by random() limit 540))
 ) w;
 lease_id:=gen_random_uuid();
 update vocab_private.preparations set status='working',lease=lease_id,attempts=attempts+1,updated_at=now(),next_attempt=now()+interval '6 minutes' where id=p_id;
 return jsonb_build_object('id',j.id,'lease',lease_id,'account',j.user_id,'profile',j.profile,'learner',l,'catalog',s->'catalog','curriculum',coalesce(words,'[]'),'payload',j.payload,'bank',vocab_private.bank_candidates(j.user_id,coalesce((l->>'difficulty')::numeric,2)),'reserved',vocab_private.reserved_questions(j.user_id,j.profile,j.id));
end $function$;

CREATE OR REPLACE FUNCTION vocab_private.claim_reserve(p_id uuid, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j vocab_private.lesson_reserves; s jsonb; l jsonb; words jsonb; lease_id uuid; desired_band integer;
begin
 select * into j from vocab_private.lesson_reserves where id=p_id and capability=p_key for update;
 if not found or j.status in ('ready','consumed') or j.attempts>=8 or (j.status='working' and j.updated_at>now()-interval '5 minutes') then return null; end if;
 if exists(select 1 from vocab_private.lesson_reserves p where p.user_id=j.user_id and p.profile=j.profile and p.id<>j.id and p.status='working' and p.updated_at>now()-interval '5 minutes') then return null; end if;
 select state into s from public.app_state where user_id=j.user_id;l:=s#>array['users',j.profile];if l is null then return null;end if;
 desired_band:=greatest(1,least(9,round(coalesce((l->>'difficulty')::numeric,2))::integer));
 select jsonb_agg(to_jsonb(w)) into words from (select * from public.curriculum_words where quality_status<>'rejected' and (band between 2 and floor(coalesce((l->>'difficulty')::numeric,2))-1 or word in(select key from jsonb_each(coalesce(l->'words','{}')) where coalesce((value->>'seen')::integer,0)>0 or value->>'introducedAt' is not null) or band between greatest(1,desired_band-1) and least(9,desired_band+1))) w;
 lease_id:=gen_random_uuid();update vocab_private.lesson_reserves set status='working',lease=lease_id,attempts=attempts+1,updated_at=now(),next_attempt=now()+interval '6 minutes' where id=p_id;
 return jsonb_build_object('kind','reserve','slot',j.slot,'id',j.id,'lease',lease_id,'account',j.user_id,'profile',j.profile,'learner',l,'catalog',s->'catalog','curriculum',coalesce(words,'[]'),'payload',j.payload,'bank',vocab_private.bank_candidates(j.user_id,coalesce((l->>'difficulty')::numeric,2)),'reserved',vocab_private.reserved_questions(j.user_id,j.profile,j.id));
end $function$;

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
 if fresh_count<5 then return null;end if;
 for j in select * from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and status='ready' order by slot for update skip locked loop
  if not vocab_private.reserve_usable(j.payload,l) then update vocab_private.lesson_reserves set status='consumed' where id=j.id;continue;end if;
  data:=j.payload;
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
end $function$;

