-- Private, owner-scoped, independently validated questions and one review buffer.
create table if not exists vocab_private.question_bank (
 user_id uuid not null references auth.users(id) on delete cascade,
 fingerprint text not null, word text not null, task_type text not null,
 reader_level numeric not null, support_level integer not null default 0,
 policy text not null, question jsonb not null, created_at timestamptz not null default now(),
 primary key(user_id,fingerprint)
);
create index if not exists question_bank_lookup on vocab_private.question_bank(user_id,word,task_type,policy,reader_level);
alter table vocab_private.question_bank enable row level security;
create policy bank_owner on vocab_private.question_bank for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on vocab_private.question_bank from public,anon,authenticated;

create table if not exists vocab_private.lesson_reserves (
 user_id uuid not null references auth.users(id) on delete cascade, profile text not null check(profile in ('ayoung','inseong','guest')),
 slot integer not null check(slot=1), id uuid not null default gen_random_uuid(),
 capability uuid not null default gen_random_uuid(), lease uuid,
 status text not null default 'pending' check(status in ('pending','working','ready','consumed')),
 payload jsonb, attempts integer not null default 0, next_attempt timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,profile,slot), unique(id)
);
create index if not exists lesson_reserves_pending on vocab_private.lesson_reserves(next_attempt) where status in ('pending','working');
alter table vocab_private.lesson_reserves enable row level security;
create policy reserve_owner on vocab_private.lesson_reserves for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on vocab_private.lesson_reserves from public,anon,authenticated;

create or replace function vocab_private.question_fingerprint(q jsonb) returns text language sql immutable set search_path='' as $$
 select md5(coalesce(q#>>'{w,w}','')||'|'||coalesce(q#>>'{w,d}','')||'|'||coalesce(q->>'type','')||'|'||coalesce(q->>'ctx','')||'|'||coalesce((select jsonb_agg(o->>'t' order by o->>'t')::text from jsonb_array_elements(coalesce(q->'opts','[]')) o),''));
$$;
create or replace function vocab_private.question_sentences(q jsonb) returns text[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(distinct clean),'{}') from (
 select lower(regexp_replace(s,'[[:space:][:punct:]]','','g')) as clean from (
 select coalesce(q->>'ctx','') as t union all select o->>'t' from jsonb_array_elements(coalesce(q->'opts','[]')) o
 ) t cross join lateral regexp_split_to_table(t.t,'[.!?。！？\n]+') s
 ) c where length(clean)>=12;
$$;

create or replace function vocab_private.cache_packet(p_user uuid,p_payload jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare r jsonb; q jsonb; plan jsonb; n integer:=0;
begin
 if p_payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.8' then return 0; end if;
 for r in select value from jsonb_array_elements(coalesce(p_payload->'ready','[]')) loop
  q:=r->1;plan:=p_payload->'plans'->((r->>0)::integer);
  if q#>>'{validation,policy}'='vocabulary-level-fit-12.8' and q#>>'{validation,aiVerified}'='true' and q#>>'{validation,deterministic}'='true'
   and q#>>'{validation,checks,coherentSituation}'='true' and q#>>'{validation,checks,vocabularyFocus}'='true' and q#>>'{validation,checks,levelDemandFit}'='true' then
   insert into vocab_private.question_bank(user_id,fingerprint,word,task_type,reader_level,support_level,policy,question)
    values(p_user,vocab_private.question_fingerprint(q),q#>>'{w,w}',q->>'type',coalesce((q->>'bankReaderLevel')::numeric,(p_payload->>'difficulty')::numeric,2),coalesce((q->>'bankSupportLevel')::integer,(plan->>'supportLevel')::integer,0),'vocabulary-level-fit-12.8',q)
    on conflict(user_id,fingerprint) do nothing;
   n:=n+1;
  end if;
 end loop;
 return n;
end $$;

create or replace function vocab_private.bank_candidates(p_user uuid,p_level numeric) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('question',b.question,'readerLevel',b.reader_level,'supportLevel',b.support_level)),'[]') from (
 select * from vocab_private.question_bank where user_id=p_user and policy='vocabulary-level-fit-12.8' and reader_level between p_level-.35 and p_level+.35 order by created_at desc limit 800
 ) b;
$$;

create or replace function vocab_private.reserved_questions(p_user uuid,p_profile text,p_exclude uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(r->1),'[]') from (
 select p.payload as data from vocab_private.preparations p where p.user_id=p_user and p.profile=p_profile and p.id is distinct from p_exclude
 union all select p.payload from vocab_private.lesson_reserves p where p.user_id=p_user and p.profile=p_profile and p.id is distinct from p_exclude and p.status<>'consumed'
 union all select s.state#>array['users',p_profile,'activeLesson'] from public.app_state s where s.user_id=p_user
 ) packs cross join lateral jsonb_array_elements(coalesce(packs.data->'ready','[]')) r;
$$;

create or replace function vocab_private.kick_reserve(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare j vocab_private.lesson_reserves;
begin
 select * into j from vocab_private.lesson_reserves where id=p_id for update;
 if not found or j.status not in ('pending','working') or j.attempts>=8 or j.next_attempt>now() then return;end if;
 perform net.http_post(url:='https://vocab-adventure-neon.vercel.app/api/prepare-worker',headers:=jsonb_build_object('Content-Type','application/json','x-preparation-key',j.capability::text),body:=jsonb_build_object('id',j.id),timeout_milliseconds:=10000);
 update vocab_private.lesson_reserves set next_attempt=now()+interval '6 minutes' where id=p_id;
end $$;

CREATE OR REPLACE FUNCTION vocab_private.ensure_reserves(p_user uuid, p_profile text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$;
declare l jsonb; s jsonb; i integer;
begin
 select state into s from public.app_state where user_id=p_user;l:=s#>array['users',p_profile];
 if l is null or not exists(
  select 1 from jsonb_each(coalesce(l->'words','{}')) w
  left join public.curriculum_words c on c.word=w.key
  where (coalesce((w.value->>'seen')::integer,0)>0 or w.value->>'introducedAt' is not null)
   and coalesce(c.quality_status,'reviewed')<>'rejected' and w.key<>'민사 재판'
   and coalesce(c.band,(s#>>array['catalog',w.key,'band'])::integer,0)
    between greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)) and least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1))
 ) then return;end if;
 for i in 1..1 loop
  insert into vocab_private.lesson_reserves(user_id,profile,slot) values(p_user,p_profile,i) on conflict(user_id,profile,slot) do nothing;
  update vocab_private.lesson_reserves set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,status='pending',payload=null,attempts=0,next_attempt=now(),updated_at=now()
   where user_id=p_user and profile=p_profile and slot=i and (status='consumed' or (status='ready' and (payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.8' or payload->>'selectionPolicy' is distinct from 'target-band-12.9' or abs(coalesce((payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35)));
 end loop;
 perform vocab_private.kick_reserve((select id from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and slot=1));
end $function$;


create or replace function vocab_private.claim_reserve(p_id uuid,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j vocab_private.lesson_reserves; s jsonb; l jsonb; words jsonb; lease_id uuid; desired_band integer;
begin
 select * into j from vocab_private.lesson_reserves where id=p_id and capability=p_key for update;
 if not found or j.status in ('ready','consumed') or j.attempts>=8 or (j.status='working' and j.updated_at>now()-interval '5 minutes') then return null; end if;
 if exists(select 1 from vocab_private.lesson_reserves p where p.user_id=j.user_id and p.profile=j.profile and p.id<>j.id and p.status='working' and p.updated_at>now()-interval '5 minutes') then return null; end if;
 select state into s from public.app_state where user_id=j.user_id;l:=s#>array['users',j.profile];if l is null then return null;end if;
 desired_band:=greatest(1,least(9,round(coalesce((l->>'difficulty')::numeric,2))::integer));
 select jsonb_agg(to_jsonb(w)) into words from (select * from public.curriculum_words where quality_status<>'rejected' and (word in(select key from jsonb_each(coalesce(l->'words','{}')) where coalesce((value->>'seen')::integer,0)>0 or value->>'introducedAt' is not null) or band between greatest(1,desired_band-1) and least(9,desired_band+1))) w;
 lease_id:=gen_random_uuid();update vocab_private.lesson_reserves set status='working',lease=lease_id,attempts=attempts+1,updated_at=now(),next_attempt=now()+interval '6 minutes' where id=p_id;
 return jsonb_build_object('kind','reserve','slot',j.slot,'id',j.id,'lease',lease_id,'account',j.user_id,'profile',j.profile,'learner',l,'catalog',s->'catalog','curriculum',coalesce(words,'[]'),'payload',j.payload,'bank',vocab_private.bank_candidates(j.user_id,coalesce((l->>'difficulty')::numeric,2)),'reserved',vocab_private.reserved_questions(j.user_id,j.profile,j.id));
end $$;

create or replace function vocab_private.save_reserve_preparation(p_id uuid,p_key uuid,p_lease uuid,p_payload jsonb,p_failed boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
declare j vocab_private.lesson_reserves;
begin
 if octet_length(p_payload::text)>2000000 or jsonb_array_length(coalesce(p_payload->'newWords','[]'))<>0 then raise exception 'Invalid reserve';end if;
 update vocab_private.lesson_reserves set payload=p_payload,status=case when p_failed then 'pending' when jsonb_array_length(coalesce(p_payload->'ready','[]'))=20 then 'ready' else 'working' end,
  updated_at=now(),next_attempt=case when p_failed then now()+interval '45 seconds' else now()+interval '6 minutes' end
  where id=p_id and capability=p_key and lease=p_lease and status='working' returning * into j;
 if not found then return false;end if;
 perform vocab_private.cache_packet(j.user_id,p_payload);return true;
end $$;
create or replace function public.save_reserve_preparation(p_id uuid,p_key uuid,p_lease uuid,p_payload jsonb,p_failed boolean default false) returns boolean language sql security invoker set search_path='' as $$select vocab_private.save_reserve_preparation(p_id,p_key,p_lease,p_payload,p_failed)$$;

-- Reject used sentences, stale levels, and words not yet learned before promotion.
CREATE OR REPLACE FUNCTION vocab_private.reserve_usable(p_payload jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$;
declare r jsonb; q jsonb; st jsonb; h jsonb; used text[];
begin
 if p_payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.8' or p_payload->>'selectionPolicy' is distinct from 'target-band-12.9' or jsonb_array_length(coalesce(p_payload->'ready','[]'))<>20 or jsonb_array_length(coalesce(p_payload->'plans','[]'))<>20
  or abs(coalesce((p_payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35 then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x where coalesce((x#>>'{w,band}')::numeric,0) not between greatest(1,ceil(coalesce((l->>'difficulty')::numeric,2)-1)) and least(9,floor(coalesce((l->>'difficulty')::numeric,2)+1))) then return false;end if;
 for r in select value from jsonb_array_elements(p_payload->'ready') loop
  q:=r->1;st:=l#>array['words',q#>>'{w,w}'];
  if st is null or (coalesce((st->>'seen')::integer,0)=0 and st->>'introducedAt' is null)
   or q#>>'{validation,policy}' is distinct from 'vocabulary-level-fit-12.8' or q#>>'{validation,aiVerified}' is distinct from 'true'
   or q#>>'{validation,deterministic}' is distinct from 'true' or q#>>'{validation,checks,coherentSituation}' is distinct from 'true'
   or q#>>'{validation,checks,vocabularyFocus}' is distinct from 'true' or q#>>'{validation,checks,levelDemandFit}' is distinct from 'true'
   or coalesce((p_payload->'plans'->((r->>0)::integer)->>'supportLevel')::integer,0)<coalesce((st->>'supportLevel')::integer,0)
   or exists(select 1 from public.curriculum_words where word=q#>>'{w,w}' and quality_status='rejected') then return false;end if;
  if coalesce(q->'bankPassageKeys','[]') ?| array(select jsonb_array_elements_text(coalesce(st->'usedPassageKeys','[]'))) then return false;end if;
  for h in select value from jsonb_array_elements(coalesce(st->'problemHistory','[]')) loop
   used:=vocab_private.question_sentences(jsonb_build_object('ctx',h->>'context','opts',coalesce((select jsonb_agg(jsonb_build_object('t',o)) from jsonb_array_elements_text(coalesce(h->'options','[]')) o),'[]')));
   if vocab_private.question_sentences(q)&&used then return false;end if;
  end loop;
 end loop;
 return true;
end $function$;


create or replace function vocab_private.promote_reserve(p_user uuid,p_profile text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j vocab_private.lesson_reserves; l jsonb; day text; fresh_count integer; r jsonb; q jsonb; ready jsonb:='[]'; data jsonb; st jsonb; practice boolean; plans jsonb:='[]'; pl jsonb;
begin
 select state#>array['users',p_profile] into l from public.app_state where user_id=p_user;day:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
 if coalesce(l->'activeLesson','null')<>'null' then return null;end if;
 select count(*) into fresh_count from jsonb_each(coalesce(l->'words','{}')) w where value->>'introducedAt'=day and not exists(select 1 from public.curriculum_words c where c.word=w.key and c.quality_status='rejected');
 if fresh_count<3 then return null;end if;
 for j in select * from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and status='ready' order by slot for update skip locked loop
  if not vocab_private.reserve_usable(j.payload,l) then update vocab_private.lesson_reserves set status='consumed' where id=j.id;continue;end if;
  data:=j.payload;
  for r in select value from jsonb_array_elements(data->'ready') loop
   q:=r->1;st:=l#>array['words',q#>>'{w,w}'];practice:=coalesce(st->>'nextReviewAt','')>day or st->>'lastFeedbackDate'=day or st->>'introducedAt'=day;
   q:=q||jsonb_build_object('needsCard',false,'learningCard',null,'practiceOnly',coalesce(practice,false));ready:=ready||jsonb_build_array(jsonb_build_array(r->0,q));
  end loop;
  for r in select value from jsonb_array_elements(ready) loop
   pl:=data->'plans'->((r->>0)::integer);plans:=plans||jsonb_build_array(pl||jsonb_build_object('needsCard',false,'practiceOnly',r#>'{1,practiceOnly}'));
  end loop;
  data:=data||jsonb_build_object('plans',plans,'ready',ready,'snapshot',null,'fromReserve',true,'newWords','[]'::jsonb,'introAt',0,'plannedFor',day,'created',extract(epoch from now())*1000,'account',p_user,'profile',p_profile);
  data:=jsonb_set(data,'{budget,newCount}','0');update vocab_private.lesson_reserves set status='consumed' where id=j.id;return data;
 end loop;
 return null;
end $$;

create or replace function vocab_private.enqueue(p_user uuid,p_profile text) returns void language plpgsql security definer set search_path='' as $$
declare data jsonb;
begin
 data:=vocab_private.promote_reserve(p_user,p_profile);
 insert into vocab_private.preparations(user_id,profile,payload,status) values(p_user,p_profile,data,case when data is null then 'pending' else 'ready' end)
 on conflict(user_id,profile) do update set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,is_consumed=false,status=excluded.status,payload=excluded.payload,attempts=0,next_attempt=now(),updated_at=now();
 perform vocab_private.ensure_reserves(p_user,p_profile);
end $$;

-- A promoted review keeps its texts while refreshing the learner snapshot.
create or replace function vocab_private.refresh_reserve(p_id uuid,p_snapshot text) returns void language plpgsql security definer set search_path='' as $$
declare j vocab_private.preparations; l jsonb;
begin
 select * into j from vocab_private.preparations where id=p_id and user_id=auth.uid() and not is_consumed for update;
 if not found or j.payload->>'fromReserve' is distinct from 'true' then return;end if;
 select state#>array['users',j.profile] into l from public.app_state where user_id=j.user_id;
 if vocab_private.reserve_usable(j.payload,l) then update vocab_private.preparations set payload=jsonb_set(payload,'{snapshot}',to_jsonb(p_snapshot)) where id=p_id;end if;
end $$;

create or replace function vocab_private.dispatch_reserves() returns integer language plpgsql security definer set search_path='' as $$
declare j record; u record; n integer:=0;
begin
 for u in select user_id,profile from vocab_private.preparations loop perform vocab_private.ensure_reserves(u.user_id,u.profile);end loop;
 for j in select r.id,r.capability from vocab_private.lesson_reserves r where r.status in ('pending','working') and r.attempts<8 and r.next_attempt<=now()
  and not exists(select 1 from vocab_private.lesson_reserves other where other.user_id=r.user_id and other.profile=r.profile and other.id<>r.id and other.status='working' and other.updated_at>now()-interval '5 minutes')
  order by r.slot,r.next_attempt limit 3 for update of r skip locked loop
  perform net.http_post(url:='https://vocab-adventure-neon.vercel.app/api/prepare-worker',headers:=jsonb_build_object('Content-Type','application/json','x-preparation-key',j.capability::text),body:=jsonb_build_object('id',j.id),timeout_milliseconds:=10000);
  update vocab_private.lesson_reserves set next_attempt=now()+interval '6 minutes' where id=j.id;n:=n+1;
 end loop;
 return n;
end $$;

-- Least privilege: only the two capability-checked worker entry points are public.
revoke all on function vocab_private.question_fingerprint(jsonb),vocab_private.question_sentences(jsonb),vocab_private.cache_packet(uuid,jsonb),vocab_private.bank_candidates(uuid,numeric),vocab_private.reserved_questions(uuid,text,uuid),vocab_private.ensure_reserves(uuid,text),vocab_private.kick_reserve(uuid),vocab_private.claim_reserve(uuid,uuid),vocab_private.reserve_usable(jsonb,jsonb),vocab_private.promote_reserve(uuid,text),vocab_private.refresh_reserve(uuid,text),vocab_private.dispatch_reserves() from public,anon,authenticated;
revoke all on function vocab_private.save_reserve_preparation(uuid,uuid,uuid,jsonb,boolean),public.save_reserve_preparation(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function vocab_private.save_reserve_preparation(uuid,uuid,uuid,jsonb,boolean),public.save_reserve_preparation(uuid,uuid,uuid,jsonb,boolean) to anon,authenticated;
