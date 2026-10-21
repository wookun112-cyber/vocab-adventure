-- Integration probe against an already-prepared current-day packet. Every write rolls back.
begin;
set local statement_timeout='15000ms';
do $test$
declare j vocab_private.preparations; a jsonb;b jsonb; before_state text; l jsonb; r vocab_private.lesson_reserves; k uuid:=gen_random_uuid(); lease_id uuid:=gen_random_uuid();
begin
 select p.* into j from vocab_private.preparations p join public.app_state s on s.user_id=p.user_id
 where p.status='ready' and not p.is_consumed and p.payload->>'roundPolicy'='round-adaptive-breadth-25-5-20261019'
 and p.payload->>'plannedFor'=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD')
 and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null'::jsonb)='null'::jsonb limit 1;
 if not found then raise exception 'A current-day unconsumed ready packet is required';end if;
 perform set_config('request.jwt.claim.sub',j.user_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 select md5(state::text),state#>array['users',j.profile] into before_state,l from public.app_state where user_id=j.user_id;
 a:=public.ensure_prepared_lesson(j.profile,j.payload->>'snapshot',false);
 b:=public.ensure_prepared_lesson(j.profile,j.payload->>'snapshot',true);
 if a->>'id' is distinct from j.id::text or b->>'id' is distinct from j.id::text or a->>'status'<>'ready' or b->>'status'<>'ready'
 or a->'payload' is distinct from j.payload or b->'payload' is distinct from j.payload then raise exception 'Ready packet was invalidated by a status read or Start';end if;
 if not vocab_private.reserve_usable(j.payload,l) then raise exception 'Current numbered round rejected as reserve';end if;
 -- Existing reserve slots are changed only inside this rollback transaction.
 select * into r from vocab_private.lesson_reserves where user_id=j.user_id and profile=j.profile order by slot limit 1;
 if not found then raise exception 'A reserve slot is required';end if;
 update vocab_private.lesson_reserves set status='working',capability=k,lease=lease_id where id=r.id;
 if not vocab_private.save_reserve_preparation(r.id,k,lease_id,j.payload,false) then raise exception 'New-policy reserve save failed';end if;
 a:=vocab_private.promote_reserve(j.user_id,j.profile);
 if a->'newWords' is distinct from j.payload->'newWords' or a->'ready' is distinct from j.payload->'ready' then raise exception 'Reserve promotion lost new words or questions';end if;
 if not public.consume_prepared_lesson(j.profile,j.id) then raise exception 'Ready packet cannot be started';end if;
 if (select md5(state::text) from public.app_state where user_id=j.user_id) is distinct from before_state then raise exception 'Learner data changed';end if;
end $test$;
do $carryover$
declare word_row public.curriculum_words; l jsonb; x jsonb; stamp numeric:=extract(epoch from now()-interval '2 days')*1000;
begin
 select * into word_row from public.curriculum_words where quality_status<>'rejected' and band>=2 order by word limit 1;
 l:=jsonb_build_object('words','{}'::jsonb,'unfinishedUsage',jsonb_build_object(word_row.word,jsonb_build_object('word',jsonb_build_object('w',word_row.word),'day',to_char(now()-interval '2 days','YYYY-MM-DD'),'assignedAt',stamp)));
 x:=jsonb_build_object('w',jsonb_build_object('w',word_row.word,'band',word_row.band),'carryoverPolicy','unfinished-usage-12.16.32','review',true,'type','subjective_recall','practiceOnly',true,'levelEligible',false);
 if not vocab_private.unfinished_plan_valid(x,l) then raise exception 'Breadth carryover recall rejected';end if;
 if not vocab_private.unfinished_plan_valid(x||'{"type":"subjective_use"}'::jsonb,l) then raise exception 'Carryover sentence use rejected';end if;
 if vocab_private.unfinished_plan_valid(x||'{"type":"mc_usage"}'::jsonb,l) then raise exception 'Unsupported carryover type accepted';end if;
 l:=jsonb_set(l,'{words}',jsonb_build_object(word_row.word,jsonb_build_object('usageConfirmedStamp',stamp+1000)));
 if vocab_private.unfinished_plan_valid(x,l) then raise exception 'Already completed carryover accepted';end if;
end $carryover$;
select 'PASS: repeated ready reads, Start, reserve save/promotion, learner preservation' as result;
rollback;
