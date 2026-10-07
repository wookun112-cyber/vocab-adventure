create table vocab_private.app_state_history(
 id bigint generated always as identity primary key,
 user_id uuid not null,
 source text not null,
 state jsonb not null,
 captured_at timestamptz not null default now()
);
alter table vocab_private.app_state_history enable row level security;
revoke all on vocab_private.app_state_history from public,anon,authenticated;
insert into vocab_private.app_state_history(user_id,source,state) select user_id,'incident_app_state',state from public.app_state;
insert into vocab_private.app_state_history(user_id,source,state) select user_id,'incident_preparation',to_jsonb(p) from vocab_private.preparations p;
insert into vocab_private.app_state_history(user_id,source,state) select user_id,'incident_reserve',to_jsonb(p) from vocab_private.lesson_reserves p;
create function vocab_private.protect_learning_state() returns trigger
language plpgsql security definer set search_path='' as $$
declare profile text; old_child jsonb; new_child jsonb; word text; stats jsonb;
begin
 for profile in select jsonb_object_keys(coalesce(old.state->'users','{}'::jsonb)) loop
  old_child:=old.state->'users'->profile;
  new_child:=new.state->'users'->profile;
  if new_child is null
   or coalesce((new_child->>'learningDays')::numeric,0)<coalesce((old_child->>'learningDays')::numeric,0)
   or jsonb_array_length(coalesce(new_child->'sessions','[]'::jsonb))<jsonb_array_length(coalesce(old_child->'sessions','[]'::jsonb))
   or (coalesce((old_child->>'levelTestCompleted')::boolean,false) and not coalesce((new_child->>'levelTestCompleted')::boolean,false))
  then raise exception using errcode='P0001',message='LEARNING_STATE_REGRESSION: reload cloud records before saving'; end if;
  for word,stats in select key,value from jsonb_each(coalesce(old_child->'words','{}'::jsonb)) loop
   if coalesce((new_child->'words'->word->>'seen')::numeric,0)<coalesce((stats->>'seen')::numeric,0) then
    raise exception using errcode='P0001',message='LEARNING_STATE_REGRESSION: reload cloud records before saving';
   end if;
  end loop;
 end loop;
 insert into vocab_private.app_state_history(user_id,source,state) values(old.user_id,'before_update',old.state);
 return new;
end; $$;
revoke all on function vocab_private.protect_learning_state() from public,anon,authenticated;
create trigger a_protect_learning_state before update on public.app_state for each row execute function vocab_private.protect_learning_state();
