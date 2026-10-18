-- An older device may omit new metadata, but cannot renumber an existing round.
create or replace function vocab_private.protect_study_rounds()
returns trigger language plpgsql security definer set search_path='' as $$
declare profile text; previous jsonb; incoming jsonb; entries jsonb; item record;
begin
 foreach profile in array array['ayoung','inseong','guest'] loop
  previous:=old.state#>array['users',profile,'studyRounds','entries'];
  if jsonb_typeof(previous) is distinct from 'object' then continue;end if;
  incoming:=new.state#>array['users',profile,'studyRounds','entries'];
  if jsonb_typeof(incoming) is distinct from 'object' then incoming:='{}';end if;
  for item in select key,value from jsonb_each(previous) loop
   if incoming ? item.key and incoming#>>array[item.key,'number'] is distinct from item.value->>'number' then
    raise exception 'LEARNING_STATE_REGRESSION: round numbering must be preserved';end if;
  end loop;
  entries:=previous||incoming;
  if exists(select 1 from jsonb_each(entries) where coalesce(value->>'number','') !~ '^[1-9][0-9]*$')
   or (select count(*) from jsonb_each(entries))<>(select count(distinct value->>'number') from jsonb_each(entries)) then
   raise exception 'LEARNING_STATE_REGRESSION: round numbers must be unique';end if;
  new.state:=jsonb_set(new.state,array['users',profile,'studyRounds'],jsonb_build_object('version',1,'entries',entries),true);
 end loop;return new;
end $$;
revoke all on function vocab_private.protect_study_rounds() from public,anon,authenticated;
drop trigger if exists c_protect_study_rounds on public.app_state;
create trigger c_protect_study_rounds before update on public.app_state for each row execute function vocab_private.protect_study_rounds();
