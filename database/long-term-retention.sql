-- Scheduled recall survives ability changes; no learner records are rewritten.
CREATE OR REPLACE FUNCTION vocab_private.retention_word_due(l jsonb,w text)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $fn$
 select exists(select 1 from public.curriculum_words c where c.word=w and c.quality_status<>'rejected'
  and c.band>=2 and c.band<greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1))
  and vocab_private.coverage_usage_confirmed(l,w)
  and coalesce(l#>>array['words',w,'nextReviewAt'],'') ~ '^\d{4}-\d{2}-\d{2}$'
  and l#>>array['words',w,'nextReviewAt']<=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD')
  and coalesce(l#>>array['words',w,'lastFeedbackDate'],'')<>to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD')
  and coalesce(l#>>array['words',w,'lastExposureAt'],'')<>to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD')
  and coalesce(l#>>array['words',w,'introducedAt'],'')<>to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'));
$fn$;
REVOKE ALL ON FUNCTION vocab_private.retention_word_due(jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION vocab_private.review_packet_valid(p jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare x jsonb; st jsonb; band numeric; lo numeric:=greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)); hi numeric:=least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1));
 near_count integer:=0; lower_count integer:=0; new_count integer:=0; review_count integer:=0; coverage_count integer:=0; retention_count integer:=0; coverage_review_count integer:=0;
begin
 -- Previous workers remain acceptable for untagged packets during rollout.
 if not coalesce(p->>'reviewPolicy' in ('due-review-5-10-12.16.4','due-review-5-10-12.16.6'),false) or jsonb_typeof(p->'plans') is distinct from 'array' then return false;end if;
 if jsonb_array_length(p->'plans')=0 then return p#>>'{budget,waitingForReviews}'='true';end if;
 if (select count(distinct v.value#>>'{w,w}') from jsonb_array_elements(p->'plans') v(value))<>jsonb_array_length(p->'plans') then return false;end if;
 for x in select value from jsonb_array_elements(p->'plans') loop
  band:=coalesce((x#>>'{w,band}')::numeric,0);st:=l#>array['words',x#>>'{w,w}'];
  if x ? 'retentionPolicy' then
   if p->>'retentionPolicy' is distinct from 'learned-word-retention-12.16.22' or x->>'retentionPolicy' is distinct from 'learned-word-retention-12.16.22'
    or x->>'review' is distinct from 'true' or not coalesce(x->>'type' in ('subjective_recall','subjective_use','mc_usage','mc_context','mc_reading','mc_relation'),false)
    or coalesce(x->>'needsCard','false')='true' or x->>'levelEligible' is distinct from 'false'
    or not vocab_private.retention_word_due(l,x#>>'{w,w}')
    or not exists(select 1 from public.curriculum_words c where c.word=x#>>'{w,w}' and c.band=coalesce((x#>>'{w,band}')::numeric,0))
    then return false;end if;
   retention_count:=retention_count+1;review_count:=review_count+1;
  elsif x ? 'coveragePolicy' then
   if p->>'coveragePolicy' is distinct from 'lower-stage-usage-12.16.19' or not vocab_private.coverage_plan_valid(x,l,(p->>'difficulty')::numeric) then return false;end if;
   coverage_count:=coverage_count+1;
   if coalesce(x->>'review','false')='true' then
    coverage_review_count:=coverage_review_count+1;
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
 return new_count<=5 and review_count<=10 and coverage_count<=2 and lower_count<=2 and lower_count*4<=near_count and retention_count<=1
  and (p->>'retentionPolicy' is distinct from 'learned-word-retention-12.16.22' or (coverage_count+retention_count<=2 and coverage_review_count+retention_count+lower_count<=2));
exception when invalid_text_representation or numeric_value_out_of_range then return false;
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
   and (not vocab_private.coverage_usage_confirmed(l,w.key) or vocab_private.retention_word_due(l,w.key)))) then return;end if;
 for i in 1..1 loop
  insert into vocab_private.lesson_reserves(user_id,profile,slot) values(p_user,p_profile,i) on conflict(user_id,profile,slot) do nothing;
  update vocab_private.lesson_reserves set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,status='pending',payload=null,attempts=0,next_attempt=now(),updated_at=now()
   where user_id=p_user and profile=p_profile and slot=i and (status='consumed' or (status='waiting' and (payload->>'retentionPolicy' is distinct from 'learned-word-retention-12.16.22' or payload->>'coveragePolicy' is distinct from 'lower-stage-usage-12.16.19' or payload->>'reviewPolicy' is distinct from 'due-review-5-10-12.16.6' or (payload->>'difficulty')::numeric is distinct from (l->>'difficulty')::numeric or coalesce((payload#>>'{budget,waitingStudiedTotal}')::integer,-1)<>(select count(*) from jsonb_each(coalesce(l->'words','{}')) w where coalesce((w.value->>'seen')::integer,0)>0 or w.value->>'introducedAt' is not null))) or (status='ready' and (not vocab_private.reserve_usable(payload,l) or payload->>'retentionPolicy' is distinct from 'learned-word-retention-12.16.22' or payload->>'coveragePolicy' is distinct from 'lower-stage-usage-12.16.19' or payload->>'reviewPolicy' is distinct from 'due-review-5-10-12.16.6' or payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or payload->>'selectionPolicy' is distinct from 'target-band-12.9' or abs(coalesce((payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35)));
 end loop;
 perform vocab_private.kick_reserve((select id from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and slot=1));
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
REVOKE ALL ON FUNCTION vocab_private.review_packet_valid(jsonb,jsonb),vocab_private.ensure_reserves(uuid,text),vocab_private.ensure_prepared_lesson(text,text,boolean) FROM PUBLIC,anon,authenticated;
