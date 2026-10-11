-- Preserve a learner's dated lesson snapshots even when an older client syncs.
create or replace function vocab_private.merge_study_history(p_old jsonb,p_new jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb;entry record;previous jsonb;combined jsonb;day record;old_day jsonb;chosen jsonb;newer boolean;
begin
 if p_new->>'version' is distinct from '1' or jsonb_typeof(p_new->'entries') is distinct from 'object' then return p_old;end if;
 result:=case when p_old->>'version'='1' and jsonb_typeof(p_old->'entries')='object' then p_old else '{"version":1,"entries":{}}'::jsonb end;
 for entry in select key,value from jsonb_each(p_new->'entries') loop
  if jsonb_typeof(entry.value) is distinct from 'object' or jsonb_typeof(entry.value->'days') is distinct from 'object' then continue;end if;
  previous:=result#>array['entries',entry.key];
  if previous is null then result:=jsonb_set(result,array['entries',entry.key],entry.value,true);continue;end if;
  if previous->>'status'='completed' then continue;end if;
  newer:=coalesce((entry.value->>'updatedAt')::numeric,0)>=coalesce((previous->>'updatedAt')::numeric,0);
  combined:=case when newer then previous||entry.value else entry.value||previous end;
  combined:=jsonb_set(combined,'{days}',coalesce(previous->'days','{}'));
  for day in select key,value from jsonb_each(entry.value->'days') loop
   old_day:=previous#>array['days',day.key];
   if old_day is null then combined:=jsonb_set(combined,array['days',day.key],day.value,true);continue;end if;
   chosen:=case when coalesce((day.value->>'total')::numeric,0)>coalesce((old_day->>'total')::numeric,0)
     or coalesce((day.value->>'total')::numeric,0)=coalesce((old_day->>'total')::numeric,0) and newer then day.value else old_day end;
   chosen:=jsonb_set(chosen,'{activeMs}',to_jsonb(greatest(coalesce((day.value->>'activeMs')::numeric,0),coalesce((old_day->>'activeMs')::numeric,0))));
   chosen:=jsonb_set(chosen,'{timeKnown}',to_jsonb(coalesce(day.value->'timeKnown','true')<>'false'::jsonb or coalesce(old_day->'timeKnown','true')<>'false'::jsonb));
   combined:=jsonb_set(combined,array['days',day.key],chosen,true);
  end loop;
  result:=jsonb_set(result,array['entries',entry.key],combined,true);
 end loop;
 return result;
end; $$;
revoke all on function vocab_private.merge_study_history(jsonb,jsonb) from public,anon,authenticated;

create or replace function vocab_private.protect_study_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare profile text;merged jsonb;
begin
 for profile in select jsonb_object_keys(coalesce(new.state->'users','{}')) loop
  merged:=vocab_private.merge_study_history(old.state#>array['users',profile,'studyHistory'],new.state#>array['users',profile,'studyHistory']);
  if merged is not null then new.state:=jsonb_set(new.state,array['users',profile,'studyHistory'],merged,true);end if;
 end loop;
 return new;
end; $$;
revoke all on function vocab_private.protect_study_history() from public,anon,authenticated;
create trigger b_protect_study_history before update on public.app_state
for each row execute function vocab_private.protect_study_history();
