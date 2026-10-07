-- Real queue fixtures are used only inside this rolled-back transaction.
begin;
do $$
declare j vocab_private.preparations; changed uuid; day text:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'); yesterday text:=to_char(now() at time zone 'Asia/Seoul'-interval '1 day','YYYY-MM-DD'); n integer;
begin
 select p.* into j from vocab_private.preparations p join public.app_state s using(user_id)
  where p.status='ready' and not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null' limit 1 for update of p;
 if j.id is null then raise exception 'An unused prepared lesson is required'; end if;
 update vocab_private.preparations set payload=jsonb_set(payload,'{plannedFor}',to_jsonb(yesterday)) where id=j.id;
 n:=vocab_private.replenish_current_day();
 select id into changed from vocab_private.preparations where user_id=j.user_id and profile=j.profile;
 if n<1 or changed=j.id or (select payload is not null from vocab_private.preparations where id=changed) then raise exception 'New-day background refresh failed'; end if;
 if vocab_private.replenish_current_day()<>0 then raise exception 'Repeated refresh replaced a pending lesson'; end if;
 update vocab_private.preparations set status='ready',is_consumed=false,payload=jsonb_set(j.payload,'{plannedFor}',to_jsonb(yesterday)) where id=changed;
 update public.app_state set state=jsonb_set(state,array['users',j.profile,'activeLesson'],j.payload||jsonb_build_object('id',changed,'version',1)) where user_id=j.user_id;
 if vocab_private.replenish_current_day()<>0 or (select id from vocab_private.preparations where user_id=j.user_id and profile=j.profile)<>changed then raise exception 'Paused lesson replaced at midnight'; end if;
 if has_function_privilege('anon','vocab_private.replenish_current_day()','EXECUTE') or has_function_privilege('authenticated','vocab_private.replenish_current_day()','EXECUTE') then raise exception 'Private calendar worker exposed'; end if;
end $$;
rollback;
