begin;
do $$
declare target uuid; snapshot jsonb; before_history bigint; profile text; word text; rejected boolean;
begin
 if has_table_privilege('anon','vocab_private.app_state_history','SELECT') or has_table_privilege('authenticated','vocab_private.app_state_history','SELECT') then raise exception 'History exposed'; end if;
 if has_function_privilege('authenticated','vocab_private.protect_learning_state()','EXECUTE') then raise exception 'Guard exposed'; end if;
 select user_id,state into target,snapshot from public.app_state where exists(select 1 from jsonb_each(state->'users') u where jsonb_array_length(u.value->'sessions')>0) limit 1;
 if target is null then raise exception 'No learned state for guard regression'; end if;
 select count(*) into before_history from vocab_private.app_state_history where user_id=target;
 for profile in select jsonb_object_keys(snapshot->'users') loop
  select key into word from jsonb_each(snapshot#>array['users',profile,'words']) where coalesce((value->>'seen')::int,0)>0 limit 1;
  if word is null then continue; end if;
  rejected:=false;
  begin
   update public.app_state set state=jsonb_set(state,array['users',profile,'words',word,'seen'],'0') where user_id=target;
  exception when sqlstate 'P0001' then
   if sqlerrm not like 'LEARNING_STATE_REGRESSION:%' then raise; end if;
   rejected:=true;
  end;
  if not rejected then raise exception 'Lost counters accepted for %',profile; end if;
 end loop;
 if (select state from public.app_state where user_id=target) is distinct from snapshot then raise exception 'Guard changed real data'; end if;
 update public.app_state set state=state where user_id=target;
 if (select count(*) from vocab_private.app_state_history where user_id=target)<>before_history+1 then raise exception 'Missing pre-save history'; end if;
end $$;
rollback;
select 'passed' state_protection;
