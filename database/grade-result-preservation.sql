-- Backward-compatible with the old handler until the new release is deployed.
alter table vocab_private.grading_cache add column if not exists provider_started boolean not null default false;
create or replace function vocab_private.claim_vocab_grade(p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); row vocab_private.grading_cache;
begin
 if owner_id is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid grade request';end if;
 insert into vocab_private.grading_cache(user_id,request_hash) values(owner_id,p_hash) on conflict do nothing returning * into row;
 if found then return jsonb_build_object('lease',row.lease);end if;
 select * into row from vocab_private.grading_cache where user_id=owner_id and request_hash=p_hash for update;
 if row.result is not null then return jsonb_build_object('result',row.result);end if;
 if row.lease_until>now() then return jsonb_build_object('pending',true);end if;
 if row.provider_started then return jsonb_build_object('recoveryRequired',true,'lease',row.lease);end if;
 update vocab_private.grading_cache set lease=gen_random_uuid(),lease_until=now()+interval '45 seconds',updated_at=now() where user_id=owner_id and request_hash=p_hash returning * into row;
 return jsonb_build_object('lease',row.lease);
end $$;
create or replace function vocab_private.start_vocab_grade(p_hash text,p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 update vocab_private.grading_cache set provider_started=true,updated_at=now()
 where user_id=auth.uid() and request_hash=p_hash and lease=p_lease and result is null and not provider_started and lease_until>now();
 return found;
end $$;
create or replace function vocab_private.finish_vocab_grade(p_hash text,p_lease uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_result is not null and (octet_length(p_result::text)>12000 or p_result->>'score' not in ('0','0.5','1') or jsonb_typeof(p_result->'contextSuccess') is distinct from 'boolean') then raise exception 'Invalid grade result';end if;
 update vocab_private.grading_cache set result=p_result,provider_started=false,lease_until=now(),updated_at=now()
 where user_id=auth.uid() and request_hash=p_hash and lease=p_lease and result is null;
 return found;
end $$;
create or replace function public.start_vocab_grade(p_hash text,p_lease uuid)
returns boolean language sql security invoker set search_path='' as $$select vocab_private.start_vocab_grade(p_hash,p_lease)$$;
revoke all on function vocab_private.start_vocab_grade(text,uuid) from public,anon;
revoke all on function public.start_vocab_grade(text,uuid) from public,anon;
grant execute on function vocab_private.start_vocab_grade(text,uuid) to authenticated;
grant execute on function public.start_vocab_grade(text,uuid) to authenticated;
