-- Sparse saves: retain CAS, RLS and regression guards; avoid rebuilding unchanged JSON.

-- DB-only optimization, 2026-10-26. Existing open clients keep the same RPC.
-- No timeout increase, learner reset, privilege bypass or forced app reload.
create or replace function vocab_private.apply_learning_patch_tree(p_original jsonb,p_operations jsonb,p_prefix text[] default array[]::text[])
returns jsonb language plpgsql immutable security invoker set search_path='' as $fn$
declare op jsonb; wanted jsonb; output jsonb; kind text; count_ops integer; leaves integer; edit record; changed jsonb;
begin
 count_ops:=jsonb_array_length(p_operations);
 if count_ops=0 then return p_original;end if;
 op:=p_operations->0;
 if count_ops=1 and jsonb_array_length(op->'path')=0 then
  wanted:=case when coalesce((op->>'remove')::boolean,false) then null else op->'value' end;
  if p_original is not distinct from wanted then return p_original;end if;
  if (p_original is not null) is distinct from coalesce((op->>'exists')::boolean,false)
   or (coalesce((op->>'exists')::boolean,false) and p_original is distinct from op->'before') then
    raise exception using errcode='P0002',message='LEARNING_PATCH_CONFLICT',detail=to_jsonb(p_prefix)::text;
  end if;
  return wanted;
 end if;
 if exists(select 1 from jsonb_array_elements(p_operations) x where jsonb_array_length(x->'path')=0) then raise exception 'Invalid overlapping learning patch';end if;
 kind:=jsonb_typeof(p_original);
 if kind='object' then
  output:=p_original;
  for edit in
   select x->'path'->>0 as key,jsonb_agg(jsonb_set(x,'{path}',(x->'path')-0)) as ops
   from jsonb_array_elements(p_operations) x group by x->'path'->>0
  loop
   changed:=vocab_private.apply_learning_patch_tree(p_original->edit.key,edit.ops,p_prefix||edit.key);
   if changed is not distinct from p_original->edit.key then continue;end if;
   if changed is null then output:=output-edit.key;
   else output:=jsonb_set(output,array[edit.key],changed,true);end if;
  end loop;
  return output;
 elsif kind='array' then
  -- JS Object.keys produces canonical nonnegative array indices. Reject
  -- ambiguous indices instead of changing an unrelated historical answer.
  if exists(select 1 from jsonb_array_elements(p_operations) x where (x->'path'->>0) !~ '^(0|[1-9][0-9]{0,8})$') then raise exception 'Invalid learning array index';end if;
  with grouped as materialized (
   select (x->'path'->>0)::integer as idx,jsonb_agg(jsonb_set(x,'{path}',(x->'path')-0)) as ops
   from jsonb_array_elements(p_operations) x group by (x->'path'->>0)::integer
  ), edits as materialized (
   select g.idx,vocab_private.apply_learning_patch_tree(p_original->g.idx,g.ops,p_prefix||g.idx::text) as value from grouped g
  ), combined as (
   select (old.ord-1)::integer as idx,old.value from jsonb_array_elements(p_original) with ordinality old(value,ord)
   where not exists(select 1 from edits e where e.idx=old.ord-1)
   union all select e.idx,e.value from edits e where e.value is not null
  ) select coalesce(jsonb_agg(value order by idx),'[]'::jsonb) into output from combined;
  return output;
 end if;
 -- A normal client diff replaces an absent/scalar parent in one operation.
 -- Reject descendants of unavailable parents instead of falsely saving them.
 raise exception using errcode='P0002',message='LEARNING_PATCH_CONFLICT',detail=to_jsonb(p_prefix)::text;
end $fn$;


CREATE OR REPLACE FUNCTION vocab_private.protect_learning_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_users jsonb;new_users jsonb; profile text;old_child jsonb;new_child jsonb;word text;stats jsonb;completed boolean:=false;
trusted_maintenance boolean:=session_user='postgres' and coalesce(current_setting('role',true),'none') in ('none','postgres');
begin
 old_users:=old.state->'users';new_users:=new.state->'users';
 for profile in select jsonb_object_keys(coalesce(old_users,'{}'::jsonb)) loop
  old_child:=old_users->profile;new_child:=new_users->profile;
  if old_child is not distinct from new_child then continue;end if;
  if new_child is null
   or (not trusted_maintenance and old_child#>>'{gradeBackfill,id}' is not null and old_child#>>'{gradeBackfill,id}' is distinct from new_child#>>'{gradeBackfill,id}')
   or coalesce((new_child->>'learningDays')::numeric,0)<coalesce((old_child->>'learningDays')::numeric,0)
   or jsonb_array_length(coalesce(new_child->'sessions','[]'::jsonb))<jsonb_array_length(coalesce(old_child->'sessions','[]'::jsonb))
   or (coalesce((old_child->>'levelTestCompleted')::boolean,false) and not coalesce((new_child->>'levelTestCompleted')::boolean,false))
  then raise exception using errcode='P0001',message='LEARNING_STATE_REGRESSION: reload cloud records before saving';end if;
  if old_child->'words' is distinct from new_child->'words' then
  for word,stats in select key,value from jsonb_each(coalesce(old_child->'words','{}'::jsonb)) loop
   if coalesce((new_child->'words'->word->>'seen')::numeric,0)<coalesce((stats->>'seen')::numeric,0) then
    raise exception using errcode='P0001',message='LEARNING_STATE_REGRESSION: reload cloud records before saving';
   end if;
  end loop;
  end if;
  completed:=completed or jsonb_array_length(coalesce(new_child->'sessions','[]'))>jsonb_array_length(coalesce(old_child->'sessions','[]'));
 end loop;
 if completed or not exists(select 1 from vocab_private.app_state_history where user_id=old.user_id and source in('checkpoint','completed_checkpoint') and captured_at>now()-interval '30 minutes') then
  insert into vocab_private.app_state_history(user_id,source,state) values(old.user_id,case when completed then 'completed_checkpoint' else 'checkpoint' end,old.state);
  perform vocab_private.prune_learning_checkpoints();
 end if;
 return new;
end; $function$;


CREATE OR REPLACE FUNCTION vocab_private.protect_study_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  old_users jsonb;new_users jsonb;
  profile text;
  existing_history jsonb;
  incoming_history jsonb;
  merged jsonb;
BEGIN
  old_users:=old.state->'users';new_users:=new.state->'users';
  FOR profile IN SELECT jsonb_object_keys(coalesce(new_users,'{}'::jsonb)) LOOP
    existing_history := old_users #> array[profile,'studyHistory'];
    incoming_history := new_users #> array[profile,'studyHistory'];
    IF existing_history IS NOT DISTINCT FROM incoming_history THEN
      CONTINUE;
    END IF;
    merged := vocab_private.merge_study_history(existing_history,incoming_history);
    IF merged IS NOT NULL AND merged IS DISTINCT FROM incoming_history THEN
      new.state := jsonb_set(new.state,array['users',profile,'studyHistory'],merged,true);
    END IF;
  END LOOP;
  RETURN new;
END;
$function$;


CREATE OR REPLACE FUNCTION vocab_private.protect_day_switch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_users jsonb;new_users jsonb; profile_name text; prev jsonb; incoming jsonb;
begin
 old_users:=old.state->'users';new_users:=new.state->'users';
 foreach profile_name in array array['ayoung','inseong','guest','test'] loop
  prev:=old_users->profile_name;incoming:=new_users->profile_name;
  if prev is not distinct from incoming then continue;end if;
  if coalesce((incoming->>'daySwitchSequence')::bigint,0)<coalesce((prev->>'daySwitchSequence')::bigint,0) then
   raise exception 'LEARNING_STATE_REGRESSION: newer daily lesson must be preserved';end if;
  if incoming#>>'{activeLesson,id}' is not null and exists(select 1 from vocab_private.paused_lessons p where p.user_id=new.user_id and p.profile=profile_name and p.lesson_id=incoming#>>'{activeLesson,id}' and p.status='paused') then
   raise exception 'LEARNING_STATE_REGRESSION: use the paused lesson restore action';end if;
 end loop;return new;
end $function$;


CREATE OR REPLACE FUNCTION vocab_private.protect_study_rounds()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_users jsonb;new_users jsonb; profile text; previous jsonb; incoming jsonb; entries jsonb; item record;
begin
 old_users:=old.state->'users';new_users:=new.state->'users';
 foreach profile in array array['ayoung','inseong','guest','test'] loop
  previous:=old_users#>array[profile,'studyRounds','entries'];
  if jsonb_typeof(previous) is distinct from 'object' then continue;end if;
  incoming:=new_users#>array[profile,'studyRounds','entries'];
  if (old_users#>array[profile,'studyRounds']) is not distinct from (new_users#>array[profile,'studyRounds']) then continue;end if;
  if jsonb_typeof(incoming) is distinct from 'object' then incoming:='{}';end if;
  for item in select key,value from jsonb_each(previous) loop
   if incoming ? item.key and incoming#>>array[item.key,'number'] is distinct from item.value->>'number' then
    raise exception 'LEARNING_STATE_REGRESSION: round numbering must be preserved';end if;
  end loop;
  entries:=previous||incoming;
  if exists(select 1 from jsonb_each(entries) where coalesce(value->>'number','') !~ '^[1-9][0-9]*$')
   or (select count(*) from jsonb_each(entries))<>(select count(distinct value->>'number') from jsonb_each(entries)) then
   raise exception 'LEARNING_STATE_REGRESSION: round numbers must be unique';end if;
  if (new_users#>array[profile,'studyRounds']) is distinct from jsonb_build_object('version',1,'entries',entries) then
  new.state:=jsonb_set(new.state,array['users',profile,'studyRounds'],jsonb_build_object('version',1,'entries',entries),true);
  end if;
 end loop;return new;
end $function$;


CREATE OR REPLACE FUNCTION vocab_private.learning_saved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_users jsonb;new_users jsonb; previous jsonb;incoming jsonb; p text;
begin
 if tg_op='UPDATE' then old_users:=old.state->'users';end if;new_users:=new.state->'users';
 foreach p in array array['ayoung','inseong','guest','test'] loop
  previous:=old_users->p;incoming:=new_users->p;
  if tg_op='UPDATE' and previous is not distinct from incoming then continue;end if;
  if tg_op='INSERT' or
   (incoming->'preparationRevision') is distinct from (previous->'preparationRevision') or
   (incoming->'sessions') is distinct from (previous->'sessions') or
   (incoming->'levelTestCompleted') is distinct from (previous->'levelTestCompleted') then
    perform vocab_private.enqueue(new.user_id,p);
  end if;
 end loop;
 return new;
end $function$;
