-- Match the worker's assigned-but-unfinished policy. Ordinary reviews keep
-- their due-date and level checks; only an actual saved assignment qualifies.
create or replace function vocab_private.unfinished_plan_valid(x jsonb,l jsonb)
returns boolean language plpgsql stable set search_path='' as $$
declare name text:=x#>>'{w,w}'; item jsonb; st jsonb; completed numeric; assigned numeric;
begin
 item:=l#>array['unfinishedUsage',name];st:=l#>array['words',name];
 if item is null or x->>'carryoverPolicy' is distinct from 'unfinished-usage-12.16.32'
  or x->>'review' is distinct from 'true' or x->>'type' is distinct from 'subjective_use'
  or x->>'practiceOnly' is distinct from 'true' or x->>'levelEligible' is distinct from 'false'
  or coalesce(x->>'needsCard','false')<>'false' or coalesce(x->>'firstLearning','false')<>'false'
  or item#>>'{word,w}' is distinct from name
  or coalesce(item->>'day','') !~ '^\d{4}-\d{2}-\d{2}$'
  or item->>'day'>=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD')
  or not exists(select 1 from public.curriculum_words c where c.word=name and c.quality_status<>'rejected'
   and c.band>=2 and c.band=(x#>>'{w,band}')::numeric) then return false;end if;
 assigned:=coalesce((item->>'assignedAt')::numeric,0);
 completed:=coalesce((st->>'usageConfirmedStamp')::numeric,0);
 if completed=0 and st->>'usageConfirmedAt' ~ '^\d{4}-\d{2}-\d{2}$' then
  completed:=extract(epoch from ((st->>'usageConfirmedAt')::date::timestamp at time zone 'Asia/Seoul'))*1000;
 end if;
 return assigned>0 and assigned<=extract(epoch from now())*1000 and completed<assigned;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function vocab_private.unfinished_plan_valid(jsonb,jsonb) from public,anon,authenticated;

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
  if x ? 'carryoverPolicy' then
   if not vocab_private.unfinished_plan_valid(x,l) then return false;end if;
   review_count:=review_count+1;
  elsif x ? 'retentionPolicy' then
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
