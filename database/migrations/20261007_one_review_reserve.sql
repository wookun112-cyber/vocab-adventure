select vocab_private.cache_packet(user_id,payload) from vocab_private.lesson_reserves where slot=2 and payload is not null;
delete from vocab_private.lesson_reserves where slot=2;
alter table vocab_private.lesson_reserves drop constraint if exists lesson_reserves_slot_check;
alter table vocab_private.lesson_reserves add constraint lesson_reserves_slot_check check(slot=1);

create or replace function vocab_private.kick_reserve(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare j vocab_private.lesson_reserves;
begin
 select * into j from vocab_private.lesson_reserves where id=p_id for update;
 if not found or j.status not in ('pending','working') or j.attempts>=8 or j.next_attempt>now() then return;end if;
 perform net.http_post(url:='https://vocab-adventure-neon.vercel.app/api/prepare-worker',headers:=jsonb_build_object('Content-Type','application/json','x-preparation-key',j.capability::text),body:=jsonb_build_object('id',j.id),timeout_milliseconds:=10000);
 update vocab_private.lesson_reserves set next_attempt=now()+interval '6 minutes' where id=p_id;
end $$;

create or replace function vocab_private.ensure_reserves(p_user uuid,p_profile text) returns void language plpgsql security definer set search_path='' as $$
declare l jsonb; i integer;
begin
 select state#>array['users',p_profile] into l from public.app_state where user_id=p_user;
 if l is null or not exists(select 1 from jsonb_each(coalesce(l->'words','{}')) where coalesce((value->>'seen')::integer,0)>0 or value->>'introducedAt' is not null) then return; end if;
 for i in 1..1 loop
  insert into vocab_private.lesson_reserves(user_id,profile,slot) values(p_user,p_profile,i) on conflict(user_id,profile,slot) do nothing;
  update vocab_private.lesson_reserves set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,status='pending',payload=null,attempts=0,next_attempt=now(),updated_at=now()
   where user_id=p_user and profile=p_profile and slot=i and (status='consumed' or (status='ready' and (payload->>'questionPolicy' is distinct from 'vocabulary-depth-12.6' or abs(coalesce((payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35)));
 end loop;
 perform vocab_private.kick_reserve((select id from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and slot=1));
end $$;

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


revoke all on function vocab_private.kick_reserve(uuid) from public,anon,authenticated;
