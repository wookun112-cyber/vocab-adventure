-- Keep coverage validation aligned with the shared long-term mastery rule.
-- Does not rewrite learner records or relax ownership/curriculum/packet limits.
create or replace function vocab_private.mastery_confirmed(st jsonb)
returns boolean language sql stable set search_path='' as $$
 select coalesce(st->>'masteryRefreshDue','false')<>'true'
  and case when jsonb_typeof(st->'independentRecallDays')='array' then jsonb_array_length(st->'independentRecallDays') else 0 end>=3
  and coalesce((st#>>'{retention7,success}')::numeric,0)>=1
  and case when jsonb_typeof(st->'useDays')='array' then jsonb_array_length(st->'useDays') else 0 end>=1;
$$;
revoke all on function vocab_private.mastery_confirmed(jsonb) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION vocab_private.coverage_plan_valid(x jsonb, l jsonb, p_level numeric)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(x->>'coveragePolicy'='lower-stage-usage-12.16.19',false)
  and coalesce((x->>'coverageOriginLevel')::numeric,0)=p_level
  and not vocab_private.mastery_confirmed(l#>array['words',x#>>'{w,w}'])
  and not vocab_private.correct_word_blocked(l,x#>>'{w,w}',to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'))
  and exists(select 1 from public.curriculum_words c where c.word=x#>>'{w,w}'
   and c.quality_status<>'rejected' and c.band>=2 and c.band<floor(p_level)
   and c.band<floor(coalesce((l->>'difficulty')::numeric,2))
   and c.band=coalesce((x#>>'{w,band}')::numeric,0)
   and (c.definition=x#>>'{w,d}' or exists(select 1 from vocab_private.bank_authoring_items b
    where b.user_id='06c78577-b96e-4919-b979-58683ff5946e'::uuid
     and b.batch_key in ('vocab-bank-20261008-1-2-3-7-8-v1','vocab-bank-20261012-essential-v1','vocab-bank-20261013-level4-v1','vocab-bank-20261014-level5-6-v1')
     and b.word=c.word and b.status='authored_draft' and b.word_snapshot->>'definition'=x#>>'{w,d}')));
$function$;
