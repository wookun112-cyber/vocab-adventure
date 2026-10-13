-- Authenticated, atomic compare-and-set patches; owner RLS remains in force.
create or replace function public.save_learning_patch(p_operations jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); original jsonb; updated jsonb; op jsonb; path text[]; current_value jsonb; desired jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_operations) is distinct from 'array' or jsonb_array_length(p_operations)>12000 or octet_length(p_operations::text)>5000000 then raise exception 'Invalid learning patch'; end if;
 select state into original from public.app_state where user_id=owner_id for update;
 if not found then raise exception 'Learning state must be loaded before saving'; end if;
 updated:=original;
 for op in select value from jsonb_array_elements(p_operations) loop
  if jsonb_typeof(op->'path') is distinct from 'array' or jsonb_array_length(op->'path')<1 or jsonb_array_length(op->'path')>24 then raise exception 'Invalid patch path'; end if;
  select array_agg(value order by ord) into path from jsonb_array_elements_text(op->'path')with ordinality e(value,ord);
  if path[1] not in ('users','catalog','selected','v','curriculum') or (path[1]='users' and (cardinality(path)<2 or path[2] not in('ayoung','inseong','guest'))) then raise exception 'Invalid patch scope'; end if;
  current_value:=original#>path;
  desired:=case when coalesce((op->>'remove')::boolean,false) then null else op->'value' end;
  if current_value is not distinct from desired then continue; end if;
  if (current_value is not null) is distinct from coalesce((op->>'exists')::boolean,false) or
    (coalesce((op->>'exists')::boolean,false) and current_value is distinct from op->'before') then
   return jsonb_build_object('conflict',true,'path',path);
  end if;
  if coalesce((op->>'remove')::boolean,false) then updated:=updated#-path;
  else
   if not(op?'value') then raise exception 'Missing patch value'; end if;
   updated:=jsonb_set(updated,path,desired,true);
  end if;
 end loop;
 if updated is distinct from original then
  updated:=jsonb_set(updated,'{updatedAt}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint),true);
  update public.app_state set state=updated,updated_at=now() where user_id=owner_id;
 end if;
 return jsonb_build_object('saved',true);
end; $$;
revoke all on function public.save_learning_patch(jsonb) from public,anon;
grant execute on function public.save_learning_patch(jsonb) to authenticated;

-- Keep regression checks, but snapshot on a bounded interval or completion.
create index if not exists app_state_history_owner_time on vocab_private.app_state_history(user_id,captured_at desc);
create or replace function vocab_private.protect_learning_state()
returns trigger language plpgsql security definer set search_path='' as $$
declare profile text;old_child jsonb;new_child jsonb;word text;stats jsonb;completed boolean:=false;
trusted_maintenance boolean:=session_user='postgres' and coalesce(current_setting('role',true),'none') in ('none','postgres');
begin
 for profile in select jsonb_object_keys(coalesce(old.state->'users','{}'::jsonb)) loop
  old_child:=old.state->'users'->profile;new_child:=new.state->'users'->profile;
  if new_child is null
   or (not trusted_maintenance and old_child#>>'{gradeBackfill,id}' is not null and old_child#>>'{gradeBackfill,id}' is distinct from new_child#>>'{gradeBackfill,id}')
   or coalesce((new_child->>'learningDays')::numeric,0)<coalesce((old_child->>'learningDays')::numeric,0)
   or jsonb_array_length(coalesce(new_child->'sessions','[]'::jsonb))<jsonb_array_length(coalesce(old_child->'sessions','[]'::jsonb))
   or (coalesce((old_child->>'levelTestCompleted')::boolean,false) and not coalesce((new_child->>'levelTestCompleted')::boolean,false))
  then raise exception using errcode='P0001',message='LEARNING_STATE_REGRESSION: reload cloud records before saving';end if;
  for word,stats in select key,value from jsonb_each(coalesce(old_child->'words','{}'::jsonb)) loop
   if coalesce((new_child->'words'->word->>'seen')::numeric,0)<coalesce((stats->>'seen')::numeric,0) then
    raise exception using errcode='P0001',message='LEARNING_STATE_REGRESSION: reload cloud records before saving';
   end if;
  end loop;
  completed:=completed or jsonb_array_length(coalesce(new_child->'sessions','[]'))>jsonb_array_length(coalesce(old_child->'sessions','[]'));
 end loop;
 if completed or not exists(select 1 from vocab_private.app_state_history where user_id=old.user_id and source in('checkpoint','completed_checkpoint') and captured_at>now()-interval '30 minutes') then
  insert into vocab_private.app_state_history(user_id,source,state) values(old.user_id,case when completed then 'completed_checkpoint' else 'checkpoint' end,old.state);
  perform vocab_private.prune_learning_checkpoints();
 end if;
 return new;
end; $$;
revoke all on function vocab_private.protect_learning_state() from public,anon,authenticated;

-- Routine snapshots: latest 12 plus the last snapshot of each of 30 days.
-- Incident and maintenance checkpoints are never removed here.
create or replace function vocab_private.prune_learning_checkpoints()
returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
 with ranked as (
  select id,captured_at,row_number()over(partition by user_id order by captured_at desc,id desc)recent,
   row_number()over(partition by user_id,(captured_at at time zone 'Asia/Seoul')::date order by captured_at desc,id desc)daily
  from vocab_private.app_state_history where source in('before_update','checkpoint','completed_checkpoint')
 ), expired as (select id from ranked where recent>12 and (daily>1 or captured_at<now()-interval '30 days') order by id limit 50)
 delete from vocab_private.app_state_history h using expired e where h.id=e.id;
 get diagnostics removed=row_count;return removed;
end; $$;
revoke all on function vocab_private.prune_learning_checkpoints() from public,anon,authenticated;
