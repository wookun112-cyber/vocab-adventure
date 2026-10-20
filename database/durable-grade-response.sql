-- Additive, compatible with old clients. No learner state or historical grade changes.
alter table vocab_private.grading_cache add column if not exists provider_response_id text;
alter table vocab_private.grading_cache add column if not exists provider_status text;
alter table vocab_private.grading_cache add column if not exists provider_response jsonb;
alter table vocab_private.grading_cache add column if not exists provider_recorded_at timestamptz;

create or replace function vocab_private.record_vocab_grade_response(p_hash text,p_lease uuid,p_response jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); response_id text:=p_response->>'id'; provider_state text:=p_response->>'status';
begin
 if owner_id is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid grade request' using errcode='42501';end if;
 if response_id is null or response_id !~ '^resp_[a-zA-Z0-9_-]+$' or octet_length(response_id)>250 or provider_state is null
  or provider_state not in ('queued','in_progress','completed','incomplete','failed','cancelled') or octet_length(p_response::text)>64000 then raise exception 'Invalid provider checkpoint';end if;
 update vocab_private.grading_cache set provider_response_id=response_id,provider_status=provider_state,
  provider_response=case when provider_state in ('completed','incomplete','failed','cancelled') then p_response else provider_response end,
  provider_recorded_at=now(),lease_until=case when provider_state in ('queued','in_progress') then greatest(lease_until,now()+interval '2 minutes') else lease_until end
 where user_id=owner_id and request_hash=p_hash and lease=p_lease and provider_started and result is null
  and (provider_response_id is null or provider_response_id=response_id)
  -- A delayed in-progress reader cannot erase a terminal snapshot.
  and (provider_status is null or provider_status in ('queued','in_progress') or provider_status=provider_state);
 return found;
end $$;
create or replace function public.record_vocab_grade_response(p_hash text,p_lease uuid,p_response jsonb)
returns boolean language sql security invoker set search_path='' as $$select vocab_private.record_vocab_grade_response(p_hash,p_lease,p_response)$$;
revoke all on function vocab_private.record_vocab_grade_response(text,uuid,jsonb),public.record_vocab_grade_response(text,uuid,jsonb) from public,anon;
grant execute on function vocab_private.record_vocab_grade_response(text,uuid,jsonb),public.record_vocab_grade_response(text,uuid,jsonb) to authenticated;

create or replace function vocab_private.read_vocab_grade_status(p_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); row vocab_private.grading_cache; state text;
begin
 if owner_id is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid grade request' using errcode='42501';end if;
 select * into row from vocab_private.grading_cache where user_id=owner_id and request_hash=p_hash;
 if not found then return jsonb_build_object('status','retryable');end if;
 if row.result is not null then return jsonb_build_object('status','ready','result',row.result);end if;
 if row.provider_response_id is not null then
  state:=case when row.provider_status in ('incomplete','failed','cancelled') then 'recovery_required' else 'pending' end;
  return jsonb_build_object('status',state,'providerId',row.provider_response_id,'providerResponse',row.provider_response,'lease',row.lease);
 end if;
 if row.lease_until>now() then return jsonb_build_object('status','pending');end if;
 if row.provider_started then return jsonb_build_object('status','recovery_required');end if;
 return jsonb_build_object('status','retryable');
end $$;

-- Operational failure metadata only. No prompt, answer, key or bearer token.
alter table vocab_private.grading_cache add column if not exists last_failure_stage text;
alter table vocab_private.grading_cache add column if not exists last_failure_code text;
alter table vocab_private.grading_cache add column if not exists last_failure_at timestamptz;
create or replace function vocab_private.record_vocab_grade_failure(p_hash text,p_lease uuid,p_stage text,p_code text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_stage not in ('dispatch','provider_create','provider_lookup','provider_parse') or p_code is null or p_code !~ '^[a-zA-Z0-9_-]{1,80}$' then raise exception 'Invalid failure metadata';end if;
 update vocab_private.grading_cache set last_failure_stage=p_stage,last_failure_code=p_code,last_failure_at=now()
 where user_id=auth.uid() and request_hash=p_hash and lease=p_lease and result is null;
 return found;
end $$;
create or replace function public.record_vocab_grade_failure(p_hash text,p_lease uuid,p_stage text,p_code text)
returns boolean language sql security invoker set search_path='' as $$select vocab_private.record_vocab_grade_failure(p_hash,p_lease,p_stage,p_code)$$;
revoke all on function vocab_private.record_vocab_grade_failure(text,uuid,text,text),public.record_vocab_grade_failure(text,uuid,text,text) from public,anon;
grant execute on function vocab_private.record_vocab_grade_failure(text,uuid,text,text),public.record_vocab_grade_failure(text,uuid,text,text) to authenticated;
