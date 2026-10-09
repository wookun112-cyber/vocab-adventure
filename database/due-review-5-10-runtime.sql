-- Daily 5 new + up to 10 due reviews. Learner answers and profiles are never rewritten.
CREATE OR REPLACE FUNCTION vocab_private.review_weakness(st jsonb, l jsonb, w text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare u jsonb; e jsonb;
begin
 select r into u from jsonb_array_elements(coalesce(l#>'{activeLesson,results}','[]')) with ordinality a(r,i)
 where r->>'word'=w and r->>'type'='subjective_use' and coalesce(r->>'excludedFromVocabulary','false')<>'true' order by i desc limit 1;
 if u is not null and coalesce((u->>'credit')::numeric,0)>=1 and u->>'contextSuccess'='true' and coalesce(u->>'hintUsed','false')<>'true' and coalesce(u->>'revealed','false')<>'true' then return false;end if;
 select r into e from jsonb_array_elements(coalesce(l->'learningEvidence','[]')) with ordinality a(r,i) where r->>'word'=w and r->>'kind'='use' order by i desc limit 1;
 if u is null and e->>'success'='true' and (st->>'lastFeedbackDate' is null or st->>'lastFeedbackDate'<=e->>'date') then return false;end if;
 return (coalesce((st->>'wrong')::integer,0)>0 or coalesce((st->>'assisted')::integer,0)>0 or (u is not null and (coalesce((u->>'credit')::numeric,0)<1 or u->>'hintUsed'='true' or u->>'revealed'='true')))
 and coalesce(st->>'mastered','false')<>'true' and coalesce((st->>'streak')::integer,0)<2;
end $function$
;

-- Separate a recent meaning/recall weakness from incomplete sentence writing.
CREATE OR REPLACE FUNCTION vocab_private.lower_review_weakness(st jsonb, l jsonb, w text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare failed_days integer; day text:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
begin
 if not vocab_private.review_weakness(st,l,w) then return false;end if;
 with checks as (
  select e,i from jsonb_array_elements(coalesce(l->'learningEvidence','[]')) with ordinality a(e,i)
  where e->>'word'=w and e->>'kind' in ('recognition','recall','transfer')
   and e->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
   and e->>'date'>=to_char(day::date-30,'YYYY-MM-DD') and e->>'date'<=day
 ), recovered as (
  select coalesce(max(i),0) as i from checks where e->>'success'='true' and e->>'independent'='true'
 )
 select count(distinct e->>'date') into failed_days from checks
 where i>(select i from recovered) and e->>'success'='false' and e->>'firstAttempt'='true';
 return failed_days>=2;
end $function$
;
REVOKE ALL ON FUNCTION vocab_private.lower_review_weakness(jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION vocab_private.review_packet_valid(p jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare x jsonb; st jsonb; band numeric; lo numeric:=greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)); hi numeric:=least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1)); near_count integer:=0; lower_count integer:=0; new_count integer:=0; review_count integer:=0;
begin
 -- Accept the previous worker revision during rollout, with the same stricter
 -- eligibility. The client only adopts packets bearing its current revision.
 if not coalesce(p->>'reviewPolicy' in ('due-review-5-10-12.16.4','due-review-5-10-12.16.6'),false) or jsonb_typeof(p->'plans') is distinct from 'array' then return false;end if;
 if jsonb_array_length(p->'plans')=0 then return p#>>'{budget,waitingForReviews}'='true';end if;
 if (select count(distinct v.value#>>'{w,w}') from jsonb_array_elements(p->'plans') v(value))<>jsonb_array_length(p->'plans') then return false;end if;
 for x in select value from jsonb_array_elements(p->'plans') loop
  band:=coalesce((x#>>'{w,band}')::numeric,0);st:=l#>array['words',x#>>'{w,w}'];
  if coalesce(x->>'review','false')='true' then
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
 return new_count<=5 and review_count<=10 and lower_count<=2 and lower_count*4<=near_count;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
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
 if not exists(select 1 from public.app_state a where a.user_id=bound_owner and p_payload->>'resumeId'=a.state#>>array['users',p_payload->>'profile','activeLesson','id'] and p_payload->'plans'=a.state#>array['users',p_payload->>'profile','activeLesson','plans']) and not vocab_private.review_packet_valid(p_payload,(select state#>array['users',p_payload->>'profile'] from public.app_state where user_id=bound_owner)) then raise exception 'Invalid review window';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'ready','[]')) r where (r->1 ? 'authored' or r#>>'{1,validation,source}'='authored_bank') and not coalesce(vocab_private.authored_question_accepted(r->1,bound_owner),false)) then raise exception 'Invalid authored bank question';end if;
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
 if not vocab_private.review_packet_valid(p_payload,(select state#>array['users',p_payload->>'profile'] from public.app_state where user_id=bound_owner)) then raise exception 'Invalid review window';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'ready','[]')) r where r->1 ? 'authored' and not vocab_private.authored_question_accepted(r->1,bound_owner)) then raise exception 'Invalid authored bank question';end if;
 if octet_length(p_payload::text)>2000000 or jsonb_array_length(coalesce(p_payload->'newWords','[]'))<>0 then raise exception 'Invalid reserve';end if;
 if p_payload->>'preparationError' ~ 'credit_balance_exhausted|insufficient_quota' then p_payload:=jsonb_set(p_payload,'{preparationBlocked}','"ai_credit_exhausted"'); end if;
 update vocab_private.lesson_reserves set payload=p_payload,status=case when p_payload#>>'{budget,waitingForReviews}'='true' then 'waiting' when p_failed then 'pending' when vocab_private.packet_complete(p_payload) then 'ready' else 'working' end,
  attempts=case when p_payload->>'preparationBlocked'='ai_credit_exhausted' then 8 else attempts end,
  updated_at=now(),next_attempt=case when p_failed then now()+interval '45 seconds' else now()+interval '6 minutes' end
  where id=p_id and capability=p_key and lease=p_lease and status='working' returning * into j;
 if not found then return false;end if;
 perform vocab_private.cache_packet(j.user_id,p_payload);return true;
end $function$
;

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
end $function$
;

CREATE OR REPLACE FUNCTION vocab_private.ensure_reserves(p_user uuid, p_profile text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l jsonb; s jsonb; i integer;
begin
 select state into s from public.app_state where user_id=p_user;l:=s#>array['users',p_profile];
 if l is null or not exists(
  select 1 from jsonb_each(coalesce(l->'words','{}')) w
  left join public.curriculum_words c on c.word=w.key
  where (coalesce((w.value->>'seen')::integer,0)>0 or w.value->>'introducedAt' is not null)
   and coalesce(c.quality_status,'reviewed')<>'rejected' and w.key<>'민사 재판'
   and coalesce(c.band,(s#>>array['catalog',w.key,'band'])::integer,0)
    between greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)) and least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1))
 ) then return;end if;
 for i in 1..1 loop
  insert into vocab_private.lesson_reserves(user_id,profile,slot) values(p_user,p_profile,i) on conflict(user_id,profile,slot) do nothing;
  update vocab_private.lesson_reserves set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,status='pending',payload=null,attempts=0,next_attempt=now(),updated_at=now()
   where user_id=p_user and profile=p_profile and slot=i and (status='consumed' or (status='waiting' and (payload->>'reviewPolicy' is distinct from 'due-review-5-10-12.16.6' or (payload->>'difficulty')::numeric is distinct from (l->>'difficulty')::numeric or coalesce((payload#>>'{budget,waitingStudiedTotal}')::integer,-1)<>(select count(*) from jsonb_each(coalesce(l->'words','{}')) w where coalesce((w.value->>'seen')::integer,0)>0 or w.value->>'introducedAt' is not null))) or (status='ready' and (not vocab_private.reserve_usable(payload,l) or payload->>'reviewPolicy' is distinct from 'due-review-5-10-12.16.6' or payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or payload->>'selectionPolicy' is distinct from 'target-band-12.9' or abs(coalesce((payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35)));
 end loop;
 perform vocab_private.kick_reserve((select id from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and slot=1));
end $function$
;



