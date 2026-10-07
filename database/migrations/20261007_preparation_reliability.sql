-- Recover owned queue work without changing a learner or an active lesson.
create or replace function vocab_private.kick_preparation(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare j vocab_private.preparations;
begin
 select * into j from vocab_private.preparations where id=p_id for update;
 if not found or j.status not in ('pending','working') or j.attempts>=8 or j.next_attempt>now() then return; end if;
 perform net.http_post(url:='https://vocab-adventure-neon.vercel.app/api/prepare-worker',
  headers:=jsonb_build_object('Content-Type','application/json','x-preparation-key',j.capability::text),
  body:=jsonb_build_object('id',j.id),timeout_milliseconds:=10000);
 update vocab_private.preparations set next_attempt=now()+interval '6 minutes' where id=j.id;
end $$;
revoke all on function vocab_private.kick_preparation(uuid) from public,anon,authenticated;

create or replace function vocab_private.ensure_prepared_lesson(p_profile text,p_snapshot text,p_retry boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j vocab_private.preparations; active jsonb; result jsonb; day text;
begin
 if auth.uid() is null or p_profile not in ('ayoung','inseong','guest') then return null; end if;
 if p_snapshot is null or octet_length(p_snapshot)>200000 then raise exception 'Invalid snapshot'; end if;
 -- Existing recovery rules keep the exact original interrupted lesson.
 result:=vocab_private.get_prepared_lesson(p_profile,null);
 select state#>array['users',p_profile,'activeLesson'] into active from public.app_state where user_id=auth.uid();
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile for update;
 day:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
 if coalesce(active,'null')='null' and j.payload is not null and
  (j.payload->>'snapshot' is distinct from p_snapshot or
   j.payload#>>'{budget,policy}' is distinct from 'daily-3-20-25' or
   j.payload->>'plannedFor'<day) then
  perform vocab_private.enqueue(auth.uid(),p_profile);
  select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
 end if;
 -- Explicit retry retains every validated peer and rejects any old worker lease.
 if p_retry and j.attempts>=8 and j.status not in ('ready','consumed') then
  update vocab_private.preparations set status='pending',attempts=0,lease=null,next_attempt=now(),updated_at=now() where id=j.id;
 end if;
 if p_retry and j.status='pending' and j.attempts<8 then
  update vocab_private.preparations set next_attempt=now() where id=j.id;
 end if;
 perform vocab_private.kick_preparation(j.id);
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
 return jsonb_build_object('id',j.id,'status',case when j.attempts>=8 and jsonb_array_length(coalesce(j.payload->'ready','[]'))<20 then 'failed' else j.status end,'payload',j.payload);
end $$;
revoke all on function vocab_private.ensure_prepared_lesson(text,text,boolean) from public,anon,authenticated;
grant execute on function vocab_private.ensure_prepared_lesson(text,text,boolean) to authenticated;
create or replace function public.ensure_prepared_lesson(p_profile text,p_snapshot text,p_retry boolean default false)
returns jsonb language sql security invoker set search_path='' as $$select vocab_private.ensure_prepared_lesson(p_profile,p_snapshot,p_retry)$$;
revoke all on function public.ensure_prepared_lesson(text,text,boolean) from public,anon,authenticated;
grant execute on function public.ensure_prepared_lesson(text,text,boolean) to authenticated;

create or replace function vocab_private.save_preparation(p_id uuid,p_key uuid,p_lease uuid,p_payload jsonb,p_failed boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if octet_length(p_payload::text)>2000000 then raise exception 'Preparation too large'; end if;
 update vocab_private.preparations set payload=p_payload,
  status=case when p_failed then 'pending' when jsonb_array_length(coalesce(p_payload->'ready','[]'))=20 then case when is_consumed then 'consumed' else 'ready' end else 'working' end,
  updated_at=now(),next_attempt=case when p_failed then now()+interval '45 seconds' else now()+interval '6 minutes' end
 where id=p_id and capability=p_key and lease=p_lease and status='working';
 return found;
end $$;

create or replace function vocab_private.consume_prepared_lesson(p_profile text,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return false; end if;
 update vocab_private.preparations set is_consumed=true,status='consumed'
 where user_id=auth.uid() and profile=p_profile and id=p_id and not is_consumed and status='ready'
  and payload->>'plannedFor'<=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD')
  and jsonb_array_length(coalesce(payload->'plans','[]'))=20
  and (select count(distinct (e->>0)::integer) from jsonb_array_elements(coalesce(payload->'ready','[]')) e where (e->>0)::integer between 0 and 19)=20;
 return found;
end $$;

-- Refresh unstarted packets for the new workload. Paused lessons and app_state
-- are deliberately untouched; obsolete worker saves are guarded by job ID/lease.
do $$ declare j record; begin
 for j in select p.user_id,p.profile from vocab_private.preparations p join public.app_state s using(user_id)
  where not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null'
   and p.payload#>>'{budget,policy}' is distinct from 'daily-3-20-25' loop
  perform vocab_private.enqueue(j.user_id,j.profile);
 end loop;
end $$;
notify pgrst,'reload schema';
