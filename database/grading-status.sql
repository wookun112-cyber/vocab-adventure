-- Owner-scoped status reads never claim a lease, start work, or change a result.
create or replace function vocab_private.read_vocab_grade_status(p_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); row vocab_private.grading_cache;
begin
 if owner_id is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid grade request' using errcode='42501';end if;
 select * into row from vocab_private.grading_cache where user_id=owner_id and request_hash=p_hash;
 if not found then return jsonb_build_object('status','retryable');end if;
 if row.result is not null then return jsonb_build_object('status','ready','result',row.result);end if;
 if row.lease_until>now() then return jsonb_build_object('status','pending');end if;
 if row.provider_started then return jsonb_build_object('status','recovery_required');end if;
 return jsonb_build_object('status','retryable');
end $$;
create or replace function public.read_vocab_grade_status(p_hash text)
returns jsonb language sql stable security invoker set search_path='' as $$ select vocab_private.read_vocab_grade_status(p_hash) $$;
revoke all on function vocab_private.read_vocab_grade_status(text),public.read_vocab_grade_status(text) from public,anon;
grant execute on function vocab_private.read_vocab_grade_status(text),public.read_vocab_grade_status(text) to authenticated;
