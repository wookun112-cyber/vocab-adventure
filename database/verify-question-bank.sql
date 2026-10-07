-- Read-only assertions for populated production buffers. No learner changes.
begin;
do $$
declare j record; other record; r jsonb; q jsonb; t jsonb;
begin
 if has_table_privilege('anon','vocab_private.question_bank','SELECT') or has_table_privilege('authenticated','vocab_private.question_bank','SELECT') then raise exception 'Question bank exposed';end if;
 if has_table_privilege('anon','vocab_private.lesson_reserves','SELECT') or has_function_privilege('anon','vocab_private.claim_reserve(uuid,uuid)','EXECUTE') then raise exception 'Reserve capability exposed';end if;
 if public.claim_preparation('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000') is not null then raise exception 'Invalid capability accepted';end if;
 for j in select p.*,s.state#>array['users',p.profile] as learner from vocab_private.lesson_reserves p join public.app_state s using(user_id) where p.status='ready' loop
  if jsonb_array_length(j.payload->'newWords')<>0 or not vocab_private.reserve_usable(j.payload,j.learner) then raise exception 'Unusable reserve: %, %',j.profile,j.slot;end if;
  for r in select value from jsonb_array_elements(j.payload->'ready') loop
   q:=r->1;
   if not exists(select 1 from vocab_private.question_bank b where b.user_id=j.user_id and b.fingerprint=vocab_private.question_fingerprint(q)) then raise exception 'Validated question not saved';end if;
   for other in select p.payload from vocab_private.lesson_reserves p where p.user_id=j.user_id and p.profile=j.profile and p.id<>j.id and p.status='ready'
    union all select p.payload from vocab_private.preparations p where p.user_id=j.user_id and p.profile=j.profile loop
    for t in select value->1 from jsonb_array_elements(coalesce(other.payload->'ready','[]')) where value#>>'{1,w,w}'=q#>>'{w,w}' loop
     if vocab_private.question_sentences(q)&&vocab_private.question_sentences(t) then raise exception 'Repeated sentence in buffers: %',j.profile;end if;
    end loop;
   end loop;
  end loop;
 end loop;
end $$;
rollback;
