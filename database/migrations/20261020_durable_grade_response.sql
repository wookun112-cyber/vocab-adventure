-- Additive schema update; never modify prior grades or children records.
alter table vocab_private.grading_cache add column if not exists provider_response_id text;
create or replace function vocab_private.attach_vocab_grade_response(p_hash text,p_lease uuid,p_response_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_hash !~ '^[a-f0-9]{64}$' or p_response_id !~ '^resp_[A-Za-z0-9_-]{3,150}$'
 then raise exception 'Invalid provider response ID' using errcode='42501';end if;
 update vocab_private.grading_cache
 set provider_response_id=p_response_id,updated_at=now()
 where user_id=auth.uid() and request_hash=p_hash and lease=p_lease and provider_started and result is null
  and (provider_response_id is null or provider_response_id=p_response_id);
 return found;
end $$;
create or replace function public.attach_vocab_grade_response(p_hash text,p_lease uuid,p_response_id text)
returns boolean language sql security invoker set search_path='' as $$
 select vocab_private.attach_vocab_grade_response(p_hash,p_lease,p_response_id)
$$;
revoke all on function vocab_private.attach_vocab_grade_response(text,uuid,text) from public,anon;
revoke all on function public.attach_vocab_grade_response(text,uuid,text) from public,anon;
grant execute on function vocab_private.attach_vocab_grade_response(text,uuid,text) to authenticated;
grant execute on function public.attach_vocab_grade_response(text,uuid,text) to authenticated;
-- Return provider ID and the original lease ONLY to the authenticated owner.
-- Read-only: status checks never start paid AI or renew a lease.
create or replace function vocab_private.read_vocab_grade_status(p_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); row vocab_private.grading_cache;
begin
 if owner_id is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid grade request' using errcode='42501';end if;
 select * into row from vocab_private.grading_cache where user_id=owner_id and request_hash=p_hash;
 if not found then return jsonb_build_object('status','retryable');end if;
 if row.result is not null then return jsonb_build_object('status','ready','result',row.result);end if;
 if row.provider_started and row.provider_response_id is not null then
  return jsonb_build_object('status','pending','providerResponseId',row.provider_response_id,'lease',row.lease);
 end if;
 if row.lease_until>now() then return jsonb_build_object('status','pending');end if;
 if row.provider_started then return jsonb_build_object('status','recovery_required');end if;
 return jsonb_build_object('status','retryable');
end $$;
