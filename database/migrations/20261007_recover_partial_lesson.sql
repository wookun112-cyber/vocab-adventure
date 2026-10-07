-- Preserve the original lesson and all accepted questions while the worker
-- validates only its missing base questions. Learner records are never edited.
create or replace function vocab_private.enqueue_resume(p_user uuid,p_profile text,p_lesson jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare data jsonb;
begin
 data:=jsonb_build_object('engine',p_lesson->'engine','resumeId',p_lesson->'id','account',p_user,'profile',p_profile,
  'mode','daily','created',p_lesson->'created','snapshot',null,'difficulty',p_lesson->'difficulty',
  'newWords',p_lesson->'newWords','baseWords',p_lesson->'baseWords','plans',p_lesson->'plans','ready',p_lesson->'ready');
 insert into vocab_private.preparations(user_id,profile,payload) values(p_user,p_profile,data)
 on conflict(user_id,profile) do update set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,is_consumed=false,
  status='pending',payload=data,attempts=0,next_attempt=now(),updated_at=now();
end $$;
revoke all on function vocab_private.enqueue_resume(uuid,text,jsonb) from public,anon,authenticated;

create or replace function vocab_private.get_prepared_lesson(p_profile text,p_active_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j vocab_private.preparations; active jsonb;
begin
 if auth.uid() is null or p_profile not in ('ayoung','inseong','guest') then return null; end if;
 select state#>array['users',p_profile,'activeLesson'] into active from public.app_state where user_id=auth.uid();
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile for update;
 if active->>'version'='1' and active->>'account'=auth.uid()::text and active->>'profile'=p_profile and
  active->>'engine'='10.8.0' and active->>'mode'='daily' and jsonb_array_length(coalesce(active->'plans','[]'))=20 and
  jsonb_array_length(coalesce(active->'ready','[]'))<20 then
  if j.id is null or j.payload->>'resumeId' is distinct from active->>'id' then
   perform vocab_private.enqueue_resume(auth.uid(),p_profile,active);
   select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
  end if;
 elsif j.id is null or (j.is_consumed and p_active_id is null and coalesce(active,'null')='null') then
  -- Never send a missing/consumed lesson back to live browser generation.
  perform vocab_private.enqueue(auth.uid(),p_profile);
  return jsonb_build_object('status','pending');
 end if;
 if j.is_consumed and (p_active_id is null or p_active_id<>j.id) then return null; end if;
 return jsonb_build_object('id',j.id,'status',case when j.attempts>=8 and jsonb_array_length(coalesce(j.payload->'ready','[]'))<20 then 'failed' else j.status end,'payload',j.payload);
end $$;
