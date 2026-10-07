-- Manual relative calibration of the currently registered senses; not an official test scale.
with revised(word,band) as (values
('불확정',5),
('연속성',5),
('독립성',5),
('연계성',5),
('주도성',5),
('경향성',5),
('할부',5),
('용례',5),
('책무',6),
('책무성',6),
('책임성',6),
('논증력',6),
('재현',6),
('전형',6),
('정밀도',6),
('학술적',6),
('재고하다',7),
('명문화하다',7),
('반추하다',7),
('환언',7),
('임계점',7)
) update public.curriculum_words c set band=r.band,grade_basis='vocabulary-calibration-12.14',review_reason=coalesce(c.review_reason,'')||' | 일반 뜻·파생어군 상대 난도 재검토(앱 추정)',updated_at=now() from revised r where c.word=r.word and c.band<>r.band;

-- Use current curriculum classification before promoting cached packets.
-- Stop non-recoverable billing retries; preserve accepted questions and learner state.
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
   j.payload#>>'{budget,policy}' is distinct from 'daily-3-20-25-flex' or
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
 return jsonb_build_object('id',j.id,'status',case when j.attempts>=8 and jsonb_array_length(coalesce(j.payload->'ready','[]'))<20 then 'failed' else j.status end,'payload',j.payload);
end $function$;


CREATE OR REPLACE FUNCTION vocab_private.reserve_usable(p_payload jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; q jsonb; st jsonb; h jsonb; used text[];
begin
 if p_payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or p_payload->>'selectionPolicy' is distinct from 'target-band-12.9' or jsonb_array_length(coalesce(p_payload->'ready','[]'))<>20 or jsonb_array_length(coalesce(p_payload->'plans','[]'))<>20
  or abs(coalesce((p_payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35 then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x
  join public.curriculum_words c on c.word=x#>>'{w,w}'
  where c.quality_status='rejected' or c.band<>coalesce((x#>>'{w,band}')::integer,0)) then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x where coalesce((x#>>'{w,band}')::numeric,0) not between greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)) and least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1))) then return false;end if;
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
   where user_id=p_user and profile=p_profile and slot=i and (status='consumed' or (status='ready' and (not vocab_private.reserve_usable(payload,l) or payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.13' or payload->>'selectionPolicy' is distinct from 'target-band-12.9' or abs(coalesce((payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35)));
 end loop;
 perform vocab_private.kick_reserve((select id from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and slot=1));
end $function$;

