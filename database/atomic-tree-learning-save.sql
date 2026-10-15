-- DB-only hotfix, 2026-10-15. Existing open clients continue using the same RPC.
-- No timeout increase, learner reset, privilege bypass or forced app reload.
create or replace function vocab_private.apply_learning_patch_tree(p_original jsonb,p_operations jsonb,p_prefix text[] default array[]::text[])
returns jsonb language plpgsql immutable security invoker set search_path='' as $fn$
declare op jsonb; wanted jsonb; output jsonb; kind text; count_ops integer; leaves integer;
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
  with grouped as materialized (
   select x->'path'->>0 as key,jsonb_agg(jsonb_set(x,'{path}',(x->'path')-0)) as ops
   from jsonb_array_elements(p_operations) x group by x->'path'->>0
  ), edits as materialized (
   select g.key,vocab_private.apply_learning_patch_tree(p_original->g.key,g.ops,p_prefix||g.key) as value from grouped g
  ), combined as (
   select old.key,old.value from jsonb_each(p_original) old where not exists(select 1 from edits e where e.key=old.key)
   union all select e.key,e.value from edits e where e.value is not null
  ) select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into output from combined;
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
revoke all on function vocab_private.apply_learning_patch_tree(jsonb,jsonb,text[]) from public,anon;
grant execute on function vocab_private.apply_learning_patch_tree(jsonb,jsonb,text[]) to authenticated;

create or replace function public.save_learning_patch_v2(p_operations jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare owner_id uuid:=auth.uid(); original jsonb; updated jsonb; conflict_path text;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 if jsonb_typeof(p_operations) is distinct from 'array' or jsonb_array_length(p_operations)>12000 or octet_length(p_operations::text)>5000000 then raise exception 'Invalid learning patch';end if;
 if exists(select 1 from jsonb_array_elements(p_operations) op where jsonb_typeof(op) is distinct from 'object' or jsonb_typeof(op->'path') is distinct from 'array') then raise exception 'Invalid patch path';end if;
 if exists(select 1 from jsonb_array_elements(p_operations) op where
  jsonb_array_length(op->'path')<1 or jsonb_array_length(op->'path')>24
  or exists(select 1 from jsonb_array_elements(op->'path') x where jsonb_typeof(x)<>'string')
 ) then raise exception 'Invalid patch path';end if;
 if exists(select 1 from jsonb_array_elements(p_operations) op where
  op#>>'{path,0}' not in ('users','catalog','selected','v','curriculum')
  or (op#>>'{path,0}'='users' and (jsonb_array_length(op->'path')<2 or op#>>'{path,1}' not in ('ayoung','inseong','guest')))
 ) then raise exception 'Invalid patch scope';end if;
 if exists(select 1 from jsonb_array_elements(p_operations) op where
  jsonb_typeof(op->'exists') is distinct from 'boolean'
  or (op?'remove' and jsonb_typeof(op->'remove') is distinct from 'boolean')
  or (op->'exists'='true'::jsonb and not (op?'before'))
  or (op->'remove' is distinct from 'true'::jsonb and not (op?'value'))
 ) then raise exception 'Invalid patch operation';end if;
 select state into original from public.app_state where user_id=owner_id for update;
 if not found then raise exception 'Learning state must be loaded before saving';end if;
 begin
  updated:=vocab_private.apply_learning_patch_tree(original,p_operations);
 exception when no_data_found then
  get stacked diagnostics conflict_path=pg_exception_detail;
  return jsonb_build_object('conflict',true,'path',conflict_path::jsonb);
 end;
 if updated is distinct from original then
  updated:=jsonb_set(updated,'{updatedAt}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint),true);
  update public.app_state set state=updated,updated_at=now() where user_id=owner_id;
 end if;
 return jsonb_build_object('saved',true);
end $fn$;
revoke all on function public.save_learning_patch_v2(jsonb) from public,anon;
grant execute on function public.save_learning_patch_v2(jsonb) to authenticated;

create or replace function public.save_learning_patch(p_operations jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select public.save_learning_patch_v2(p_operations)
$$;
revoke all on function public.save_learning_patch(jsonb) from public,anon;
grant execute on function public.save_learning_patch(jsonb) to authenticated;
