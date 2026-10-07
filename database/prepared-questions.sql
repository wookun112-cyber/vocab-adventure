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

-- Core vocabulary selection (12.4.1).
-- Transparent phrases remain in records and passages, not target vocabulary.
update public.curriculum_words set quality_status='rejected',
 review_flags=array(select distinct f from unnest(coalesce(review_flags,'{}')||array['context_only_expression']) f),
 review_reason='독립된 목표 어휘 대신 지문에서 사용하는 설명형 표현. 핵심 단어를 별도로 학습한다.',reviewed_at=now(),updated_at=now()
 where quality_status<>'rejected' and regexp_replace(word,'\s+','','g') in ('생활정보격차','정보격차','지역격차','지역발전격차','빈부격차','소득격차','생활정보의판단기준','개인정보보관기간','개인정보의보관기간','정보제공범위','정보의객관성','정보의최신성','정보의타당성','정보의위계','정보검증','정보선별','정보전달','개인정보유출','생활폐기물배출기준','생활비지출항목','재난정보확인경로','비교기준','해결방안','발표자료','관찰기록','관계회복','생활안전수칙','생활속위험요인','독서목적','독서의목적','독서태도','독서기록','예약확인','보관방법','보관상태','식품보관온도','사실과의견의구별','비판적읽기전략','자료수집계획','주민의견수렴');
insert into public.curriculum_words(word,definition,band,domain,source,quality_status,review_reason,reviewed_at)
 select v.word,v.definition,v.band,v.domain,'editorial-core-12.4.1','reviewed','설명형 표현을 대신하는 핵심 어휘. 문맥에서 여러 상황에 적용한다.',now()
 from (values ('격차','둘 사이에 벌어진 수준이나 정도의 차이이다.',4,'국어'),
('갱신','기존 내용을 고치거나 더 새롭게 바꾸는 일이다.',5,'국어'),
('검증','근거나 자료를 살펴 사실이나 주장이 맞는지 확인하는 일이다.',5,'국어'),
('선별','여럿 가운데 목적이나 기준에 맞는 것을 골라내는 일이다.',4,'국어'),
('유출','안에 있던 물질이나 정보가 밖으로 빠져나가는 일이다.',5,'국어'),
('회복','나빠지거나 잃었던 상태를 되찾는 일이다.',4,'국어'),
('반경','활동이나 영향이 미치는 범위이다.',5,'국어'),
('최신성','내용이 현재 상황에 맞게 새롭게 되어 있는 성질이다.',6,'국어'),
('타당성','이유나 근거에 비추어 알맞고 옳다고 볼 수 있는 성질이다.',5,'국어'),
('위계','지위나 중요도 등에 따라 구분되는 높고 낮음의 질서이다.',6,'국어')) as v(word,definition,band,domain)
 where not exists(select 1 from public.curriculum_words w where w.word=v.word);
-- An interrupted lesson keeps its questions and cursor. Replace unused work only.
do $$ declare j record; begin
 for j in select p.user_id,p.profile from vocab_private.preparations p join public.app_state s using(user_id)
 where not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null'
 and exists(select 1 from jsonb_array_elements(coalesce(p.payload->'plans','[]')) t where regexp_replace(t#>>'{w,w}','\s+','','g') in ('생활정보격차','정보격차','지역격차','지역발전격차','빈부격차','소득격차','생활정보의판단기준','개인정보보관기간','개인정보의보관기간','정보제공범위','정보의객관성','정보의최신성','정보의타당성','정보의위계','정보검증','정보선별','정보전달','개인정보유출','생활폐기물배출기준','생활비지출항목','재난정보확인경로','비교기준','해결방안','발표자료','관찰기록','관계회복','생활안전수칙','생활속위험요인','독서목적','독서의목적','독서태도','독서기록','예약확인','보관방법','보관상태','식품보관온도','사실과의견의구별','비판적읽기전략','자료수집계획','주민의견수렴')) loop
 perform vocab_private.enqueue(j.user_id,j.profile);
 end loop;
end $$;

-- Vocabulary-focused reconstruction (12.5.0).
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
   j.payload->>'questionPolicy' is distinct from 'vocabulary-context-12.5' or
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


-- Keep the catalog rows and all learner records; stop selecting specialists.
update public.curriculum_words set quality_status='rejected',
 review_flags=array(select distinct f from unnest(coalesce(review_flags,'{}')||array['specialist_knowledge_target']) f),
 review_reason='일반 어휘 학습의 출제 대상에서 제외한 전문 개념·계산·문법 분류 용어. 지문 소재로는 사용 가능하다.',reviewed_at=now(),updated_at=now()
 where quality_status<>'rejected' and regexp_replace(word,'\s+','','g') in ('자리올림','가로막대그래프','가로줄','각','각도','각도기','곱','곱셈','곱셈식','곱셈표','곱하는수','규칙을세우다','그래프','꺾은선','꼭짓점','나누는수','나눗셈','나눗셈식','다각형','덧셈','덧셈식','도형','들이','리터','마름모','문제풀이','미터','반올림','버림','변','변의길이','분모','분수','분자','뺄셈','뺄셈식','사각형','삼각형','선분','세로막대그래프','세로줄','센티미터','수배열','수직','자료해석','자료표','자리값','자릿수','자연수','정사각형','직각','직각삼각형','직사각형','짝수','차','표현방법','홀수','홀수와짝수','가능한경우','가분수','각기둥','각뿔','검산','경우나누기','경우의수','계산식','공배수','공약수','구','기약분수','내림','넓이공식','넓이단위','단위분수','대각선','대략값','대분수','대응표','대칭축','등호','띠그래프','문제해결','문제해결력','반지름','받아내림','받아올림','배수','백분율','분수막대','분수의크기','비례배분','비율표','비의성질','선대칭도형','소수','소수의곱셈','소수의나눗셈','소수점','소수점이하','소인수','소인수분해','수의대소','수직선','십진법','약분','약수','약수와배수','약수의개수','어림값','역산','연산','연산순서','올림','원그래프','원기둥','원뿔','원의넓이','원의둘레','원주','원주율','이자율','입체도형','자료의편향','점대칭도형','제곱미터','제곱센티미터','좌표','좌표평면','중앙값','지름','진분수','최대공약수','최소공배수','통분','평균값','평면','평면도형','표본조사','할인율','합동','합성수','각의이등분선','거듭제곱','겉넓이','결합법칙','경우의분류','계산순서','계산의원리','공집합','공통인수','교환법칙','규칙의표현','근','근삿값','기준량','내각','내심','내접','다면체','단항식의계수','닮음비','대응각','대응변','도수','도형의구성','도형의성질','동류항','동위각','등식','등식의변형','등식의성질','맞꼭지각','문자사용','문자식','미지수의값','반비례','방정식','배수관계','보각','부등식의성질','부분집합','분배법칙','분수선','비교의기준','비례식','사다리꼴','사분면','사잇값','상수','서로소','세제곱','수의부호','수직선의원점','순서쌍','순환마디','순환소수','식의값','약수의합','양수','엇각','여각','역산방법','역수','외각','외심','외접','유리수','유리수의덧셈','유한소수','음수','일차방정식','일차방정식의해','일차부등식','일차식','전개도','절댓값','절댓값기호','정비례','정수','정수의덧셈','정수의뺄셈','제곱','제곱수','좌표축','중심선','지수','컴퍼스','평행사변형','합리적판단','항','항등식','회전체','경우분류','계급값','계수','근사계산','근호','논리적추론','누적도수','다항식','다항식의차수','단항식','대응관계','대응규칙','대칭이동','대표값','도수분포표','도형의닮음','무게중심','무리수','무리수의소수표현','무한소수','반비례관계','변수의범위','부등식','부등식의해','부등호','부채꼴','분배법칙의역','분수의역수','비례관계식','비례배치','비율의해석','사건의확률','사고의유연성','산점도','산포','삼각형의합동','상대도수','상수항','수량관계','수직이등분선','수학적근거','수학적표현','실수의대소관계','연립방정식','연립부등식','연립일차방정식','원주각','이차방정식의근','이차항','일차함수','일차함수의절편','일차항','자료의경향','작도','절편','제곱근','조건해석','좌표해석','좌표의대응','중심각','최빈값','추론과정','측정단위의일관성','판단유보','평행선의성질','평행선의엇각','평행이동','표면적','표본공간','표본의크기','풀이과정검토','함수','함수값','함수의감소','함수의증가','합동조건','해집합','호','확률실험','확률의비교','회전이동','히스토그램','경우의수의곱셈원리','계산의효율','근과계수의관계','근사화','근의공식','근의판별','내분','대표값비교','도형변환','반올림오차','분수식','비례상수','사인','산포도','삼각비','수학적모델','수학적의사소통','식의변형','역비례','완전제곱식','외분','원의접선','이차방정식','이차함수','이차함수의꼭짓점','인수분해','일차함수의그래프','일차함수의기울기','자료의분포','정다면체','추세선','축의대칭','축의방정식','코사인','판별식','평균변화율','포물선','포물선의축','풀이의타당성','피타고라스정리','피타고라스정리의역','함수의대응','가중평균','공간적추론','공비','공집합기호','공차','귀납적추론','극값조건','극한값','근사오차','근의개수','근의중복도','기댓값','기하평균','나머지정리','논리곱','논리합','누적비율','다항식의나눗셈','대수적표현','대우명제','대우증명','독립변수','독립사건','두점사이의거리','등비수열의합','등비중항','등차수열의합','등차중항','매개변수','명제','명제의부정','명제의역','명제의진릿값','무한집합','미분가능성','반례구성','벡터의성분','변동계수','변수의허용범위','사분위범위','사분위수','산술평균','산포비교','상관관계와인과관계','상대오차','상수함수','성급한일반화','수열의일반항','수학적귀결','수학적모델의한계','수학적추상화','순열','역명제','역함수','연역적추론','오차범위','오차한계','원의방정식','유리화','유한집합','이차함수의최댓값','이차함수의최솟값','인과추론','인수정리','자료간상관성','자료의대표성','자료의변동성','전제조건','절대오차','정규분포','정의역','제약조건','조건부명제','종속변수','종속사건','중점공식','증감률','집합의교집합','집합의여집합','집합의원소','집합의원소수','집합의차집합','집합의포함관계','집합의합집합','최적화문제','최적화해','추정값','치역','통계적해석','팩토리얼','표본공간','표본크기','표본편향','표준점수','표준편차','피보나치수열','필요조건과충분조건','필요충분조건','함숫값','합성함수','허근','확률모형','확률분포','확률적예측','가설검정','계산자원의제약','공리','공역','공통원인','교란변수','교란요인','귀류법','극한','근사해','급수','기댓값의선형성','기하적변환','내적','논리적비판','대수의법칙','도함수','도형변환의합성','등비수열','로그','명제의동치변형','명제의참값','명제함수','무리함수','미분','미분계수','복소수','부정적분','분포의비대칭성','사인법칙','산점도의추세','상관계수','수열의극한','수열의단조성','수열의점화식','수학적귀납법','수학적귀류법','수학적반례','식의동치','신뢰구간','역함수의그래프','예측구간','오차의누적','유리함수','자료분포의모양','자료의이질성','자료의중심경향','적분','점근선','점화식','접선','접선의기울기','정의역제한','정적분','조건부독립','조건부확률','중근','중복순열','중심극한정리','최적해','추론의비약','추세외삽','추정오차','추정의편향','코사인법칙','통계량의편향','통계적불확실성','통계적추정','표본의대표성','표본의선택편향','표준오차','함수의단조구간','함수의단조성','함수의대칭성','함수의변곡점','합성함수의정의역','행렬','허수','확률변수','효과크기','개념의조작화','고유값','고유벡터','공리계','공분산','극값','극단값의영향','급수의수렴','급수의수렴여부','논리적귀결관계','논리적동치','로그함수','명제의동치','모형과적합','모형적합도','모형의과적합','목적함수','무한급수','민감도분석','베이즈정리','벡터의내적','변수의종속성','볼록함수','부정적분상수','선형변환','역행렬','오목함수','유의수준','이항분포','조건의충분성','조건의필요성','중간값정리','집합론','최댓값정리','추정값의안정성','통계적대표성','통계적유의성의한계','표본선택편향','표본오차와비표본오차','필요충분성','함수의극값조건','행렬식','확률모형의가정','확률의조건화','확률적독립성','회귀계수','사동표현','피동표현','사동','피동','관형절','명사절','부사절','안긴문장','안은문장','복합문장','서술격조사','보조용언','사잇소리현상','설의법','대구법','도치법','절대온도','기압골','열의평형','염화나트륨','질량보존법칙','보일법칙','샤를법칙','기체상태방정식','뉴턴운동법칙','옴의법칙','멘델의법칙','아보가드로법칙','도플러효과','플랑크상수','가속도','각가속도','각속도','각운동량','간섭무늬','감각수용체','감쇠진동','감염위험도','강우','강제진동','개체군밀도','개체군성장','개체군의유전적부동','개체군의회복력','결정화','결합에너지','결합조직','경쟁배제','계통분류','계통오차','계통수','계통적오차','고분자','고유진동수','공명','공명주파수','공유결합','공유전자쌍','공진','공진주파수','공진화','공통조상','과학모형의적용한계','과학모형의활용','과학윤리','과학적모델','과학적불확실성','과학적설명','과학적추론','관다발','관성모멘트','관찰자효과','관측자료의시간해상도','광섬유','광전효과','광합성속도','구경꾼이온','구심가속도','구심력','군집','군집천이','굴절률','굽힘모멘트','균류','극상군집','극성','극성결합','극성분자','근육조직','기계학습','기능적다양성','기단','기상재해','기압차','기전력','기체분자운동론','기후민감도','기후완화','기후탄력성','기후피드백','기후회복력','기후변화','나노미터','난류','내부에너지','내분비계','내성균','논리회로','단백질접힘','단백질합성','단색광','단열변화','달의위상','담수화','당량점','대기경계층','대기전력','대기질지수','대기권','대류열전달','대륙붕','대륙성기후','대립형질','대립유전자','대사산물','대사율','대수층','데이터편향','도시열섬','돌연변이','동적평형','등속운동','등온변화','렌즈의초점거리','로지스틱성장','리보솜','림프','마디','막전위','먹이그물','면역기억','면역계','모세관현상','모형의예측력','모형의적용한계','모형의적합성','모형의타당성','모형의한계','몰','몰농도','몰부피','몰질량','몰수','물리적성질','물질수송체','물질수율','물질수지','물질순환','물질체류시간','물질대사','물질의보존','물질의순도','물질의순환경로','물질의이동경로','미세플라스틱','미세먼지농도','반감기','반복가능성','반응경로','반응선택성','반응속도','반응속도식','반응수득률','반응수율','반응엔탈피','반응열','반응조건','반응조건의영향','반응지수','반응차수','반응환경','반응식','반응열','반증가능성','발생과정','발생유전자','발화점','방사능','방사선량','방사성동위원소','배란','배아','백색광','변수통제','변위','변형률','별의밝기','병목효과','병원체농도','병원체의전파','복사열전달','복사평형','복사열','복원생태학','부도체','부분압력','부영양화','분별증류','분압법칙','분자간상호작용','분자간인력','분자간힘','분자구조','분자극성','분자배열','분자운동','분자진동','분자간상호작용','분자량','분자의배열','불확정성원리','비교집단','비극성결합','비극성분자','비열','빙하후퇴','빛의간섭','빛의속력','빛의편광','빛의회절','산해리','산해리상수','산성도','산성비','산소요구량','산화','산화반응','산화환원','산화환원반응식','산화환원적정','산화환원전위','산화물','산화수','산화제','삼투','삼투현상','삼투압','삼투압차','상대연령','상동기관','상전이','상태방정식','상피조직','생명윤리','생명공학','생명공학기술','생물계절변화','생물군집의변화','생물다양성지수','생물분포','생물지리','생물지표','생물지표종','생물진화','생물다양성보전','생물막','생물의구성','생물의방어','생물의항상성','생물학적다양성','생물학적분류','생물학적성','생물학적시계','생물학적적응도','생산자생물량','생성형인공지능','생식세포','생식전략','생식세포','생식적격리','생장점','생체물질','생체시계','생체정보','생체막','생태복원','생태복원력','생태회랑','생태계교란','생태계교란요인','생태계복원','생태계서비스','생태계에너지효율','생태계저항력','생태계저항성','생태계회복','생태계회복속도','생태계의안정성','생태계의에너지효율','생태계의저항성','생태계의회복력','생태적교란','생태적발자국','생태적복원','생태적상호의존','생태적안정성','생태적연결','생태적연결성','생태적임계점','생태적저항성','생태적지위','생태적지위분화','생태적지표','생태적천이','생태적회복력','서식지단편화','서식지의질','선택압력','선택압','선팽창','성운','세포골격','세포내공생','세포내수송','세포배양','세포분열','세포분화','세포소기관','세포자멸','세포호흡','세포막','세포막의선택투과성','세포의기능','세포질','소기관','소비전력','소성변형','소수성','소화액','수소결합','수정란','수직전달','수평유전자전달','수평전달','순이온반응식','순환자원','승화열','시냅스','신경가소성','신경전달','신경전달물질','신경전달속도','신경조직','신경회로','신경계의조절','신체조절','신호전달경로','실내공기질','실험결과의해석','실험변인통제','실험재현','실험의한계','아보가드로상수','알베도','암석권','암흑물질','압축률','양성되먹임','양성자','양이온','양자화','에너지보존','에너지손실률','에너지수지','에너지전달과정','에너지전환효율','에너지전환의손실','에너지준위','에너지효율','에너지효율성','에너지흐름','에너지의저장형태','엔트로피','역학적에너지','역학적일','역학적평형','연구윤리','연소생성물','열기관','열대야','열량보존','열섬현상','열성','열에너지','열역학제1법칙','열역학제2법칙','열역학적안정성','열역학적평형','열용량','열응력','열의출입','열저항','열적팽창계수','열적평형','열적평형상태','열전달저항','열전도율','열팽창계수','열확산','열효율','염기서열','염기서열분석','염기해리상수','염색체','염색체수','영률','영양단계','오차전파','오차율','오차의원인','온도구배','완충용액','완충작용','외래생물','용액의농도','용액의희석','용해평형','용해도곡선','우주배경복사','우주팽창','운동마찰력','운동량','운동의변화','원생생물','원소기호','원소주기성','원소주기율표','원심력','원운동주기','원자모형','원자번호','원자가전자','원자량','원자핵','원핵생물','위상차','유도기전력','유도전류','유전상담','유전암호','유전정보','유전정보의전달','유전형질','유전자발현','유전자발현조절','유전자발현량','유전자발현의조절단계','유전자부동','유전자빈도','유전자재조합','유전자조절','유전자편집','유전자풀','유전자흐름','유전자형','유전적다양성','유전적변이','유전적병목','유전적부동','유전적차이','유전적표류','유효숫자','유효충돌','유효숫자','음성되먹임','음이온','응력','응집력','이동거리','이상기체','이온','이온결합','이온화','이온화에너지','이온화도','이차전령','인과모형','일률','일주기리듬','임계각','입자간인력','입자충돌빈도','입자충돌이론','자극수용','자극과반응','자기선속','자기장의변화','자료구조','자료해석의불확실성','자료의오차원인','자연선택','자연순환','자연선택','자원효율성','자유낙하운동','자율신경계','작용·반작용','잠열','재결정','적색편이','적외선','적응방산','적정','전극','전극반응','전극전위','전기도금','전기분해장치','전기쌍극자','전기에너지전환','전기음성도','전기음성도차','전기저항','전기저항률','전기력','전기력선','전기장','전기장세기','전기적상호작용','전기적중성','전기화학전지','전단력','전도성고분자','전력','전력량','전류의세기','전반사','전사','전선','전압강하','전자','전자배치','전자전이','전자기유도','전자기력','전자기파','전자껍질','전자쌍반발','전지전압','전하','전하분포','전하량','전해질','전해질용액','절대연령','정상파','종균등도','종다양성','종풍부도','종간경쟁','종분화','줄기세포','중력가속도','중성자','중화','중화적정','중화점','증발산','증산량','지구복사균형','지구시스템','지구에너지수지','지구환경의변화','지시약','지질구조','지질시대','지질연대','지질연대측정','지질작용','지층대비','지하수함양','진동주기','진동수','진핵생물','진화적안정전략','질량중심','질병감시','질소순환','집단면역','짝산','짝염기','창시자효과','체적팽창','촉매의선택성','촉매의활성','최적온도','추천알고리즘','충격량','충돌횟수','측정도구의눈금','측정분해능','측정불확도','측정장치의분해능','측정재현성','측정의검출한계','측정의반복성','측정의불확도','측정의재현성','측정의정밀성','친수성','침입종','침전반응','크로마토그래피','탄성한계','탄소격리','탄소고정','탄소배출','탄소순환','탄소저장','탄소저장고','탄소집약도','탄소흡수','탄소흡수원','토양산도','토양완충능력','퇴적환경','파동간섭','파동함수','파동의간섭','파동의속력','파동의에너지전달','파동의위상','파동의위상차','파동의중첩','파동의진동수','파동의파장','파면','판구조론','편광','편광판','평균속도','평균운동에너지','평형상수','평형상태','평형이동','폭염일수','표현형','하천유량','한계반응물','항상성유지','항상성조절','항상성의유지','항생제감수성','항생제내성','항원','항원항체반응','해구','해령','해수순환','해양산성화','해양순환','해양성기후','핵분열','핵융합','행성경계','혈당조절','혈당항상성','혈액형','혈장','호르몬조절','호르몬의작용','호흡량','화학결합','화학반응식의계수','화학반응의양적관계','화학평형','화학평형상수','화학평형이동','화학식량','화학적변화의증거','화학적성질','화합물','확산속도','환경노출','환경노출도','환경변화의지표','환경수용력','환경스트레스','환경스트레스요인','환경용량','환경지표','환원반응','환원제','활동전위','활성부위','활성화에너지','회로의개방','회로의단락','회절','회절무늬','회절격자','효소활성','후성유전','후성유전','후성적변화','흔적기관','흡착','힘의모멘트','힘의합성');
-- Use the transferable meaning of retained, polysemous core vocabulary.
update public.curriculum_words w set definition=v.definition,domain='국어',updated_at=now()
 from (values ('수렴','흩어진 것이 한곳으로 모이거나 여러 의견을 모으는 일이다.'),('발산','안에 있던 힘이나 느낌을 밖으로 내보내거나 여러 방향으로 퍼뜨리는 일이다.'),('독립성','다른 것에 기대거나 영향을 받지 않고 스스로 판단하거나 이루어지는 성질이다.'),('편차','기준이나 평균과 비교했을 때 나타나는 차이이다.'),('표준화','서로 다른 방식이나 기준을 공통된 기준에 맞추는 일이다.'),('번역','한 언어로 표현한 내용을 다른 언어로 옮기는 일이다.'),('환원','본래의 상태로 되돌리거나 어떤 일을 더 기본적인 문제로 바꾸어 보는 일이다.'),('촉매','어떤 변화나 일이 더 쉽게 일어나도록 돕는 역할을 하는 것. 화학에서는 반응 속도를 바꾸면서 자신은 반응 전후에 유지되는 물질이다.'),('임계점','그 정도를 넘으면 상태나 현상이 크게 달라지기 시작하는 경계이다.')) v(word,definition) where w.word=v.word and w.quality_status<>'rejected';
-- New unused packets must be independently checked with vocabularyFocus.
-- Original interrupted lesson and its answered records are never rewritten.
do $$ declare j record; begin
 for j in select p.user_id,p.profile from vocab_private.preparations p join public.app_state s using(user_id)
 where not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null'
 and p.payload is not null and p.payload->>'questionPolicy' is distinct from 'vocabulary-context-12.5' loop
 perform vocab_private.enqueue(j.user_id,j.profile);
 end loop;
end $$;
notify pgrst,'reload schema';
