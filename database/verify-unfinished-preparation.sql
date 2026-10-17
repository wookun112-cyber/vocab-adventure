begin;
do $$
declare p jsonb; l jsonb; x jsonb; assigned numeric; day text;
begin
 day:=to_char((now() at time zone 'Asia/Seoul')::date-1,'YYYY-MM-DD');
 assigned:=extract(epoch from now()-interval '1 day')*1000;
 x:=jsonb_build_object('w',jsonb_build_object('w','의견','band',2),'review',true,'type','subjective_use','practiceOnly',true,'levelEligible',false,'needsCard',false,'firstLearning',false,'carryoverPolicy','unfinished-usage-12.16.32');
 l:=jsonb_build_object('difficulty',7.4,'words','{}'::jsonb,'unfinishedUsage',jsonb_build_object('의견',jsonb_build_object('word',jsonb_build_object('w','의견','band',2),'day',day,'assignedAt',assigned)));
 p:=jsonb_build_object('reviewPolicy','due-review-5-10-12.16.6','plans',jsonb_build_array(x));
 if not vocab_private.review_packet_valid(p,l) then raise exception 'Unanswered out-of-band carryover rejected';end if;
 l:=jsonb_set(l,'{words}',jsonb_build_object('의견',jsonb_build_object('seen',1,'nextReviewAt','2099-01-01')));
 if not vocab_private.review_packet_valid(p,l) then raise exception 'Future scheduled unfinished target rejected';end if;
 if vocab_private.review_packet_valid(p,l-'unfinishedUsage') then raise exception 'Forged carryover accepted';end if;
 if vocab_private.review_packet_valid(jsonb_set(p,'{plans,0,type}','"mc_usage"'),l) then raise exception 'Non-use carryover accepted';end if;
 if vocab_private.review_packet_valid(jsonb_set(p,'{plans,0,levelEligible}','true'),l) then raise exception 'Ability boost accepted';end if;
 if vocab_private.review_packet_valid(p,jsonb_set(l,'{words,의견,usageConfirmedStamp}',to_jsonb(assigned+1))) then raise exception 'Completed target reopened';end if;
 if vocab_private.review_packet_valid(p,jsonb_set(l,'{unfinishedUsage,의견,day}',to_jsonb(to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD')))) then raise exception 'Same-day carryover accepted';end if;
 if vocab_private.review_packet_valid(jsonb_set(p,'{plans}',jsonb_build_array(x,x)),l) then raise exception 'Duplicate target accepted';end if;
 if vocab_private.review_packet_valid(jsonb_set(p,'{plans,0}',x-'carryoverPolicy'),l) then raise exception 'Ordinary future/out-of-band review accepted';end if;
 if has_function_privilege('anon','vocab_private.unfinished_plan_valid(jsonb,jsonb)','EXECUTE') then raise exception 'Anonymous helper exposed';end if;
end $$;
select 'unfinished preparation validation passed' result;
rollback;
