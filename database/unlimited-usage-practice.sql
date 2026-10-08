-- Ready means every planned index is present; daily packet size depends on
-- the real studied vocabulary available. This never edits learner state.
create or replace function vocab_private.packet_complete(p jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p->'plans')='array' and jsonb_array_length(p->'plans')>0
 and jsonb_array_length(coalesce(p->'ready','[]'))=jsonb_array_length(p->'plans')
 and (select count(distinct (e->>0)::integer) from jsonb_array_elements(coalesce(p->'ready','[]')) e
 where (e->>0)::integer>=0 and (e->>0)::integer<jsonb_array_length(p->'plans'))=jsonb_array_length(p->'plans')
$$;
revoke all on function vocab_private.packet_complete(jsonb) from public,anon,authenticated;
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
   j.payload#>>'{budget,policy}' is distinct from 'daily-5-new-20-review-use-unlimited-12.15' or
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

CREATE OR REPLACE FUNCTION vocab_private.get_prepared_lesson(p_profile text, p_active_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j vocab_private.preparations; active jsonb;
begin
 if auth.uid() is null or p_profile not in ('ayoung','inseong','guest') then return null; end if;
 select state#>array['users',p_profile,'activeLesson'] into active from public.app_state where user_id=auth.uid();
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile for update;
 if active->>'version'='1' and active->>'account'=auth.uid()::text and active->>'profile'=p_profile and
  active->>'engine' in ('10.8.0','12.0.0') and active->>'mode'='daily' and jsonb_array_length(coalesce(active->'plans','[]'))>0 and
  jsonb_array_length(coalesce(active->'ready','[]'))<coalesce((active->>'baseCount')::integer,jsonb_array_length(active->'plans')) then
  if j.id is null or j.payload->>'resumeId' is distinct from active->>'id' then
   perform vocab_private.enqueue_resume(auth.uid(),p_profile,active);
   select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
  end if;
 elsif j.id is null or (p_active_id is null and coalesce(active,'null')='null' and
  (j.is_consumed or (j.payload is not null and j.payload->>'engine' is distinct from '12.0.0'))) then
  -- Never send a missing/consumed lesson back to live browser generation.
  perform vocab_private.enqueue(auth.uid(),p_profile);
  return jsonb_build_object('status','pending');
 end if;
 if j.is_consumed and (p_active_id is null or p_active_id<>j.id) then return null; end if;
 return jsonb_build_object('id',j.id,'status',case when j.attempts>=8 and not vocab_private.packet_complete(j.payload) then 'failed' else j.status end,'payload',j.payload);
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
 if p_payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or p_payload->>'selectionPolicy' is distinct from 'target-band-12.9' or p_payload#>>'{budget,policy}' is distinct from 'daily-5-new-20-review-use-unlimited-12.15' or not vocab_private.packet_complete(p_payload)
  or abs(coalesce((p_payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35 then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x
  join public.curriculum_words c on c.word=x#>>'{w,w}'
  where c.quality_status='rejected' or c.band<>coalesce((x#>>'{w,band}')::integer,0)) then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x where coalesce((x->>'review')::boolean,false)=false and coalesce((x#>>'{w,band}')::numeric,0) not between greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)) and least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1))) then return false;end if;
 for r in select value from jsonb_array_elements(p_payload->'ready') loop
  q:=r->1;st:=l#>array['words',q#>>'{w,w}'];
  if st is null or (coalesce((st->>'seen')::integer,0)=0 and st->>'introducedAt' is null)
   or q#>>'{validation,policy}' is distinct from 'vocabulary-level-fit-12.13' or q#>>'{validation,aiVerified}' is distinct from 'true'
   or q#>>'{validation,deterministic}' is distinct from 'true' or q#>>'{validation,checks,coherentSituation}' is distinct from 'true'
   or q#>>'{validation,checks,vocabularyFocus}' is distinct from 'true' or q#>>'{validation,checks,levelDemandFit}' is distinct from 'true'
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
 if fresh_count<5 then return null;end if;
 for j in select * from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and status='ready' order by slot for update skip locked loop
  if not vocab_private.reserve_usable(j.payload,l) then update vocab_private.lesson_reserves set status='consumed' where id=j.id;continue;end if;
  data:=j.payload;
  for r in select value from jsonb_array_elements(data->'ready') loop
   q:=r->1;st:=l#>array['words',q#>>'{w,w}'];practice:=coalesce(st->>'nextReviewAt','')>day or st->>'lastFeedbackDate'=day or st->>'introducedAt'=day;
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

CREATE OR REPLACE FUNCTION vocab_private.consume_prepared_lesson(p_profile text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then return false; end if;
 update vocab_private.preparations set is_consumed=true,status='consumed'
 where user_id=auth.uid() and profile=p_profile and id=p_id and not is_consumed and status='ready'
  and payload->>'plannedFor'<=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD')
  and vocab_private.packet_complete(payload);
 return found;
end $function$
;

CREATE OR REPLACE FUNCTION vocab_private.save_preparation(p_id uuid, p_key uuid, p_lease uuid, p_payload jsonb, p_failed boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare saved_user uuid;
begin
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
declare j vocab_private.lesson_reserves;
begin
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

CREATE OR REPLACE FUNCTION vocab_private.enqueue_resume(p_user uuid, p_profile text, p_lesson jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare data jsonb;
begin
 data:=jsonb_build_object('engine',p_lesson->'engine','model',p_lesson->'model','target',p_lesson->'target','introAt',p_lesson->'introAt','plannedFor',p_lesson->'plannedFor','budget',p_lesson->'budget','resumeId',p_lesson->'id','account',p_user,'profile',p_profile,
  'completionPolicy',p_lesson->'completionPolicy','baseCount',p_lesson->'baseCount','mode','daily','created',p_lesson->'created','snapshot',null,'difficulty',p_lesson->'difficulty',
  'newWords',p_lesson->'newWords','baseWords',p_lesson->'baseWords','plans',p_lesson->'plans','ready',p_lesson->'ready');
 insert into vocab_private.preparations(user_id,profile,payload) values(p_user,p_profile,data)
 on conflict(user_id,profile) do update set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,is_consumed=false,
  status='pending',payload=data,attempts=0,next_attempt=now(),updated_at=now();
end $function$
;
