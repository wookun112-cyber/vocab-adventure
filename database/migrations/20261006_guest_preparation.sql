-- Extend the existing private queue without replacing child lessons or learning records.
alter table vocab_private.preparations drop constraint preparations_profile_check;
alter table vocab_private.preparations add constraint preparations_profile_check check(profile in ('ayoung','inseong','guest'));
create or replace function vocab_private.learning_saved()
returns trigger language plpgsql security definer set search_path='' as $$
declare p text;
begin
 foreach p in array array['ayoung','inseong','guest'] loop
  if tg_op='INSERT' or
   (new.state#>array['users',p,'preparationRevision']) is distinct from (old.state#>array['users',p,'preparationRevision']) or
   (new.state#>array['users',p,'sessions']) is distinct from (old.state#>array['users',p,'sessions']) or
   (new.state#>array['users',p,'levelTestCompleted']) is distinct from (old.state#>array['users',p,'levelTestCompleted']) then
    perform vocab_private.enqueue(new.user_id,p);
  end if;
 end loop;
 return new;
end $$;

create or replace function vocab_private.get_prepared_lesson(p_profile text,p_active_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j vocab_private.preparations;
begin
 if auth.uid() is null or p_profile not in ('ayoung','inseong','guest') then return null; end if;
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
 if not found then
  perform vocab_private.enqueue(auth.uid(),p_profile);
  return jsonb_build_object('status','pending');
 end if;
 if j.is_consumed and (p_active_id is null or p_active_id<>j.id) then return null; end if;
 -- No date expiration: unused validated lessons remain useful until records change.
 return jsonb_build_object('id',j.id,'status',case when j.attempts>=8 and j.status<>'ready' then 'failed' else j.status end,'payload',j.payload);
end $$;


-- One unused personalized guest lesson per account; subsequent lessons use the existing completion trigger.
insert into vocab_private.preparations(user_id,profile)
select user_id,'guest' from public.app_state where state#>'{users,guest}' is not null
on conflict(user_id,profile) do nothing;
select vocab_private.dispatch();
