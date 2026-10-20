begin;
select set_config('request.jwt.claim.sub','06c78577-b96e-4919-b979-58683ff5946e',true);
do $$
declare hash text:=repeat('e',64); claimed jsonb; token uuid; status jsonb; baseline text; checks integer:=0;
begin
 select md5(state::text) into baseline from public.app_state where user_id=auth.uid();
 if exists(select 1 from vocab_private.grading_cache where user_id=auth.uid() and request_hash=hash) then raise exception 'Synthetic test hash already exists';end if;
 -- Reserve a synthetic started request in this rollback-only test, with no AI call.
 claimed:=public.claim_vocab_grade(hash);token:=(claimed->>'lease')::uuid;
 update vocab_private.grading_cache set provider_started=true where user_id=auth.uid() and request_hash=hash;
 if not public.record_vocab_grade_response(hash,token,'{"id":"resp_synthetic42","status":"in_progress"}') then raise exception 'ID save failed';end if;
 status:=public.read_vocab_grade_status(hash);
 if status->>'providerId'<>'resp_synthetic42' or status->>'status'<>'pending' then raise exception 'ID read failed';end if;
 if public.record_vocab_grade_response(hash,token,'{"id":"resp_different42","status":"completed","output":[]}') then raise exception 'Provider ID overwrite allowed';end if;
 if not public.record_vocab_grade_response(hash,token,'{"id":"resp_synthetic42","status":"completed","output":[]}') then raise exception 'Envelope save failed';end if;
 if public.record_vocab_grade_response(hash,token,'{"id":"resp_synthetic42","status":"in_progress"}') then raise exception 'Terminal state regressed';end if;
 if (public.read_vocab_grade_status(hash)->'providerResponse'->>'status')<>'completed' then raise exception 'Envelope read failed';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000042',true);
 if public.read_vocab_grade_status(hash)->>'status'<>'retryable' then raise exception 'Other owner can read ID';end if;
 if public.record_vocab_grade_response(hash,token,'{"id":"resp_synthetic42","status":"completed"}') then raise exception 'Other owner can mutate ID';end if;
 perform set_config('request.jwt.claim.sub','06c78577-b96e-4919-b979-58683ff5946e',true);
 if not public.record_vocab_grade_failure(hash,token,'provider_lookup','TimeoutError') then raise exception 'Failure metadata save failed';end if;
 if not exists(select 1 from vocab_private.grading_cache where user_id=auth.uid() and request_hash=hash and last_failure_code='TimeoutError') then raise exception 'Failure metadata missing';end if;
 if not public.finish_vocab_grade(hash,token,'{"score":1,"contextSuccess":true}') then raise exception 'Result commit failed';end if;
 if public.finish_vocab_grade(hash,token,'{"score":0,"contextSuccess":false}') then raise exception 'Existing result overwritten';end if;
 if public.read_vocab_grade_status(hash)->>'status'<>'ready' then raise exception 'Final result unavailable';end if;
 if baseline is distinct from (select md5(state::text) from public.app_state where user_id=auth.uid()) then raise exception 'Learner state changed';end if;
end $$;
select 'durable response SQL PASS; ID immutable; terminal snapshot retained; owner isolation; grade write once; learner state unchanged; rolling back synthetic data' as result;
rollback;
