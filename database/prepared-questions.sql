-- Durable, private work queue. Public RPCs enforce either account ownership
-- or an unguessable per-job capability; no service-role key is sent to clients.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create schema if not exists vocab_private;
revoke all on schema vocab_private from public, anon, authenticated;
create table if not exists vocab_private.preparations (
 user_id uuid not null references auth.users(id) on delete cascade,
 profile text not null check(profile in ('ayoung','inseong','guest')),
 id uuid not null default gen_random_uuid(),
 capability uuid not null default gen_random_uuid(),
 lease uuid,
 is_consumed boolean not null default false,
 status text not null default 'pending' check(status in ('pending','working','ready','consumed')),
 payload jsonb,
 attempts integer not null default 0,
 next_attempt timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(user_id,profile), unique(id)
);
alter table vocab_private.preparations enable row level security;
revoke all on vocab_private.preparations from public,anon,authenticated;

create or replace function vocab_private.enqueue(p_user uuid,p_profile text)
returns void language sql security definer set search_path='' as $$
 insert into vocab_private.preparations(user_id,profile) values(p_user,p_profile)
 on conflict(user_id,profile) do update set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,is_consumed=false,status='pending',payload=null,attempts=0,next_attempt=now(),updated_at=now();
$$;

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
drop trigger if exists prepare_next_lesson on public.app_state;
create trigger prepare_next_lesson after insert or update on public.app_state
for each row execute function vocab_private.learning_saved();

create or replace function vocab_private.dispatch()
returns integer language plpgsql security definer set search_path='' as $$
declare j record; n integer:=0;
begin
 for j in select id,capability from vocab_private.preparations
  where status in ('pending','working') and attempts<8 and next_attempt<=now()
  order by next_attempt limit 4 for update skip locked loop
  -- A short HTTP request only accepts the work. waitUntil continues on Vercel.
  perform net.http_post(url:='https://vocab-adventure-neon.vercel.app/api/prepare-worker',
   headers:=jsonb_build_object('Content-Type','application/json','x-preparation-key',j.capability::text),
   body:=jsonb_build_object('id',j.id),timeout_milliseconds:=10000);
  update vocab_private.preparations set next_attempt=now()+interval '6 minutes' where id=j.id;
  n:=n+1;
 end loop;
 return n;
end $$;

create or replace function vocab_private.claim_preparation(p_id uuid,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j vocab_private.preparations; s jsonb; l jsonb; desired_band integer; lease_id uuid; words jsonb;
begin
 -- Worker-only capability authorization. The key lives in the private queue
 -- and the database's outbound header; account RPCs never return it.
 select * into j from vocab_private.preparations where id=p_id and capability=p_key for update;
 if not found or j.status in ('ready','consumed') or j.attempts>=8 or
   (j.status='working' and j.updated_at>now()-interval '5 minutes') then return null; end if;
 select state into s from public.app_state where user_id=j.user_id;
 l:=s#>array['users',j.profile];
 if l is null then return null; end if;
 desired_band:=greatest(1,least(9,round(coalesce((l->>'difficulty')::numeric,2))::integer));
 select jsonb_agg(to_jsonb(w)) into words from (
  select * from public.curriculum_words where quality_status<>'rejected' and
   (word in (select key from jsonb_each(coalesce(l->'words','{}')) where coalesce((value->>'seen')::integer,0)>0)
    or id in (select id from public.curriculum_words where quality_status<>'rejected' and band between greatest(1,desired_band-1) and least(9,desired_band+1) order by random() limit 540))
 ) w;
 lease_id:=gen_random_uuid();
 update vocab_private.preparations set status='working',lease=lease_id,attempts=attempts+1,updated_at=now(),next_attempt=now()+interval '6 minutes' where id=p_id;
 return jsonb_build_object('id',j.id,'lease',lease_id,'account',j.user_id,'profile',j.profile,'learner',l,'catalog',s->'catalog','curriculum',coalesce(words,'[]'),'payload',j.payload);
end $$;

create or replace function vocab_private.save_preparation(p_id uuid,p_key uuid,p_lease uuid,p_payload jsonb,p_failed boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if octet_length(p_payload::text)>2000000 then raise exception 'Preparation too large'; end if;
 update vocab_private.preparations set payload=p_payload,
  status=case when p_failed then 'pending' when jsonb_array_length(coalesce(p_payload->'ready','[]'))=20 then case when is_consumed then 'consumed' else 'ready' end else 'working' end,
  updated_at=now(),next_attempt=case when p_failed then now()+interval '2 minutes' else now()+interval '6 minutes' end
 where id=p_id and capability=p_key and lease=p_lease and status='working';
 return found;
end $$;

-- Preserve the original lesson and all accepted questions while the worker
-- validates only its missing base questions. Learner records are never edited.
create or replace function vocab_private.enqueue_resume(p_user uuid,p_profile text,p_lesson jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare data jsonb;
begin
 data:=jsonb_build_object('engine',p_lesson->'engine','model',p_lesson->'model','target',p_lesson->'target','introAt',p_lesson->'introAt','plannedFor',p_lesson->'plannedFor','budget',p_lesson->'budget','resumeId',p_lesson->'id','account',p_user,'profile',p_profile,
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
  active->>'engine' in ('10.8.0','12.0.0') and active->>'mode'='daily' and jsonb_array_length(coalesce(active->'plans','[]'))=20 and
  jsonb_array_length(coalesce(active->'ready','[]'))<20 then
  if j.id is null or j.payload->>'resumeId' is distinct from active->>'id' then
   perform vocab_private.enqueue_resume(auth.uid(),p_profile,active);
   select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
  end if;
 elsif j.id is null or (p_active_id is null and coalesce(active,'null')='null' and
  (j.is_consumed or (j.payload is not null and j.payload->>'engine' is distinct from '12.0.0'))) then
  -- Never send a missing/consumed lesson back to live browser generation.
  perform vocab_private.enqueue(auth.uid(),p_profile);
  return jsonb_build_object('status','pending');
 end if;
 if j.is_consumed and (p_active_id is null or p_active_id<>j.id) then return null; end if;
 return jsonb_build_object('id',j.id,'status',case when j.attempts>=8 and jsonb_array_length(coalesce(j.payload->'ready','[]'))<20 then 'failed' else j.status end,'payload',j.payload);
end $$;

create or replace function vocab_private.consume_prepared_lesson(p_profile text,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return false; end if;
 update vocab_private.preparations set is_consumed=true,
  status=case when status='ready' then 'consumed' else status end
 where user_id=auth.uid() and profile=p_profile and id=p_id and not is_consumed and
  exists(select 1 from jsonb_array_elements(coalesce(payload->'ready','[]')) e where e->>0='0');
 return found;
end $$;


create or replace function public.claim_preparation(p_id uuid,p_key uuid)
returns jsonb language sql security invoker set search_path='' as $$select vocab_private.claim_preparation(p_id,p_key)$$;
create or replace function public.save_preparation(p_id uuid,p_key uuid,p_lease uuid,p_payload jsonb,p_failed boolean default false)
returns boolean language sql security invoker set search_path='' as $$select vocab_private.save_preparation(p_id,p_key,p_lease,p_payload,p_failed)$$;
create or replace function public.get_prepared_lesson(p_profile text,p_active_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select vocab_private.get_prepared_lesson(p_profile,p_active_id)$$;
create or replace function public.consume_prepared_lesson(p_profile text,p_id uuid)
returns boolean language sql security invoker set search_path='' as $$select vocab_private.consume_prepared_lesson(p_profile,p_id)$$;

revoke all on all functions in schema vocab_private from public,anon,authenticated;
grant usage on schema vocab_private to anon,authenticated;
grant execute on function vocab_private.claim_preparation(uuid,uuid),vocab_private.save_preparation(uuid,uuid,uuid,jsonb,boolean) to anon;
grant execute on function vocab_private.get_prepared_lesson(text,uuid),vocab_private.consume_prepared_lesson(text,uuid) to authenticated;
revoke all on function public.claim_preparation(uuid,uuid),public.save_preparation(uuid,uuid,uuid,jsonb,boolean),public.get_prepared_lesson(text,uuid),public.consume_prepared_lesson(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_preparation(uuid,uuid),public.save_preparation(uuid,uuid,uuid,jsonb,boolean) to anon;
grant execute on function public.get_prepared_lesson(text,uuid),public.consume_prepared_lesson(text,uuid) to authenticated;

-- Only retries existing unfinished work. It does not generate a new lesson every day.
select cron.schedule('vocab-prepare-next-lesson','* * * * *','select vocab_private.dispatch()');

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

-- Flexible daily continuation (12.4.0).
-- Continue learning on the same day; preserve every learner and paused lesson.
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
   j.payload#>>'{budget,policy}' is distinct from 'daily-3-20-25-flex' or
   j.payload->>'plannedFor' is distinct from day) then
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

-- Refresh after the Seoul date changes, even while every app is closed.
create or replace function vocab_private.replenish_current_day()
returns integer language plpgsql security definer set search_path='' as $$
declare j record; n integer:=0; day text:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
begin
 for j in select p.user_id,p.profile from vocab_private.preparations p join public.app_state s using(user_id)
  where p.status='ready' and not p.is_consumed and p.payload->>'plannedFor'<day
   and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null' for update of p skip locked loop
  perform vocab_private.enqueue(j.user_id,j.profile); n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function vocab_private.replenish_current_day() from public,anon,authenticated;

create or replace function vocab_private.dispatch()
returns integer language plpgsql security definer set search_path='' as $$
declare j record; n integer:=0;
begin
 perform vocab_private.replenish_current_day();
 for j in select id,capability from vocab_private.preparations
  where status in ('pending','working') and attempts<8 and next_attempt<=now()
  order by next_attempt limit 4 for update skip locked loop
  perform net.http_post(url:='https://vocab-adventure-neon.vercel.app/api/prepare-worker',
   headers:=jsonb_build_object('Content-Type','application/json','x-preparation-key',j.capability::text),
   body:=jsonb_build_object('id',j.id),timeout_milliseconds:=10000);
  update vocab_private.preparations set next_attempt=now()+interval '6 minutes' where id=j.id;
  n:=n+1;
 end loop;
 return n;
end $$;

-- Existing unused packets can be reused today when all their new words still
-- fit today's allowance. Only scheduling/early-practice metadata changes.
do $$
declare j record; day text:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'); today_count integer; data jsonb; plans jsonb; ready jsonb;
begin
 for j in select p.*,s.state#>array['users',p.profile] learner from vocab_private.preparations p join public.app_state s using(user_id)
  where p.status='ready' and not p.is_consumed and p.payload->>'engine'='12.0.0'
   and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null' for update of p loop
  select count(*) into today_count from jsonb_each(coalesce(j.learner->'words','{}')) w where w.value->>'introducedAt'=day;
  if jsonb_array_length(coalesce(j.payload->'newWords','[]'))>greatest(0,3-today_count) or
   exists(select 1 from jsonb_array_elements_text(j.payload->'newWords') w where coalesce((j.learner#>>array['words',w,'seen'])::integer,0)>0 or j.learner#>>array['words',w,'introducedAt'] is not null) then
   perform vocab_private.enqueue(j.user_id,j.profile); continue;
  end if;
  select jsonb_agg(p || jsonb_build_object('practiceOnly',coalesce(j.learner#>>array['words',p#>>'{w,w}','nextReviewAt']>day,false) and not (j.payload->'newWords' ? (p#>>'{w,w}'))) order by n)
   into plans from jsonb_array_elements(j.payload->'plans') with ordinality t(p,n);
  select jsonb_agg(jsonb_build_array(e->0,(e->1)||jsonb_build_object('practiceOnly',plans#>array[e->>0,'practiceOnly'])) order by n)
   into ready from jsonb_array_elements(j.payload->'ready') with ordinality t(e,n);
  data:=j.payload||jsonb_build_object('plannedFor',day,'plans',plans,'ready',ready);
  data:=jsonb_set(data,'{budget,policy}','"daily-3-20-25-flex"');
  update vocab_private.preparations set payload=data where id=j.id;
 end loop;
end $$;
notify pgrst,'reload schema';
