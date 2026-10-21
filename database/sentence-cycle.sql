-- Sentence-only 7/30 review cycle; no learner rows are rewritten.
create or replace function vocab_private.correct_word_blocked(l jsonb,w text,p_day text)
returns boolean language plpgsql stable set search_path='' as $fn$
declare st jsonb:=l#>array['words',w]; latest text;
begin
 if st->>'sentenceReviewStage'='learning' then return false;end if;
 if coalesce(st->>'sentenceReviewDue','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return p_day::date < (st->>'sentenceReviewDue')::date;end if;
 select max(d) into latest from (
  select st->>'usageConfirmedAt' as d
  union all select jsonb_array_elements_text(coalesce(st->'useDays','[]'))
  union all select e->>'date' from jsonb_array_elements(coalesce(l->'learningEvidence','[]')) e where e->>'word'=w and e->>'success'='true' and e->>'kind'='use'
 ) dates where d ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
 return coalesce(p_day::date < latest::date+7,false);
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $fn$;
revoke all on function vocab_private.correct_word_blocked(jsonb,text,text) from public,anon,authenticated;
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
   (p_snapshot like '%sentence-first-7-30-20261021%' and j.payload->>'sentenceCyclePolicy' is distinct from 'sentence-first-7-30-20261021') or
   exists(select 1 from jsonb_array_elements(coalesce(j.payload->'plans','[]')) x where vocab_private.correct_word_blocked((select state#>array['users',p_profile] from public.app_state where user_id=auth.uid()),x#>>'{w,w}',day)) or
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
CREATE OR REPLACE FUNCTION vocab_private.reserve_usable(p_payload jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; q jsonb; st jsonb; h jsonb; used text[];
begin
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'plans','[]')) x where vocab_private.correct_word_blocked(l,x#>>'{w,w}',to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'))) then return false;end if;
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
