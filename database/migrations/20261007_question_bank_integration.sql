CREATE OR REPLACE FUNCTION vocab_private.claim_preparation(p_id uuid, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j vocab_private.preparations; s jsonb; l jsonb; desired_band integer; lease_id uuid; words jsonb;
begin
 -- Worker-only capability authorization. The key lives in the private queue
 -- and the database's outbound header; account RPCs never return it.
 select * into j from vocab_private.preparations where id=p_id and capability=p_key for update;
 if not found then return vocab_private.claim_reserve(p_id,p_key); end if;
 if j.status in ('ready','consumed') or j.attempts>=8 or
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
 return jsonb_build_object('id',j.id,'lease',lease_id,'account',j.user_id,'profile',j.profile,'learner',l,'catalog',s->'catalog','curriculum',coalesce(words,'[]'),'payload',j.payload,'bank',vocab_private.bank_candidates(j.user_id,coalesce((l->>'difficulty')::numeric,2)),'reserved',vocab_private.reserved_questions(j.user_id,j.profile,j.id));
end $function$
;

CREATE OR REPLACE FUNCTION vocab_private.save_preparation(p_id uuid, p_key uuid, p_lease uuid, p_payload jsonb, p_failed boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare saved_user uuid;
begin
 if octet_length(p_payload::text)>2000000 then raise exception 'Preparation too large'; end if;
 update vocab_private.preparations set payload=p_payload,
  status=case when p_failed then 'pending' when jsonb_array_length(coalesce(p_payload->'ready','[]'))=20 then case when is_consumed then 'consumed' else 'ready' end else 'working' end,
  updated_at=now(),next_attempt=case when p_failed then now()+interval '45 seconds' else now()+interval '6 minutes' end
 where id=p_id and capability=p_key and lease=p_lease and status='working' returning user_id into saved_user;
 if not found then return false; end if;
 perform vocab_private.cache_packet(saved_user,p_payload);
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION vocab_private.ensure_prepared_lesson(p_profile text, p_snapshot text, p_retry boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j vocab_private.preparations; active jsonb; result jsonb; day text;
begin
 if auth.uid() is null or p_profile not in ('ayoung','inseong','guest') then return null; end if;
 if p_snapshot is null or octet_length(p_snapshot)>200000 then raise exception 'Invalid snapshot'; end if;
 -- Existing recovery rules keep the exact original interrupted lesson.
 result:=vocab_private.get_prepared_lesson(p_profile,null);
 select state#>array['users',p_profile,'activeLesson'] into active from public.app_state where user_id=auth.uid();
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile for update;
 perform vocab_private.refresh_reserve(j.id,p_snapshot);
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
 day:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
 if coalesce(active,'null')='null' and j.payload is not null and
  (j.payload->>'snapshot' is distinct from p_snapshot or
   j.payload#>>'{budget,policy}' is distinct from 'daily-3-20-25-flex' or
   j.payload->>'questionPolicy' is distinct from 'vocabulary-depth-12.6' or
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
 perform vocab_private.refresh_reserve(j.id,p_snapshot);
 perform vocab_private.kick_preparation(j.id);
 select * into j from vocab_private.preparations where user_id=auth.uid() and profile=p_profile;
 return jsonb_build_object('id',j.id,'status',case when j.attempts>=8 and jsonb_array_length(coalesce(j.payload->'ready','[]'))<20 then 'failed' else j.status end,'payload',j.payload);
end $function$
;

CREATE OR REPLACE FUNCTION vocab_private.dispatch()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 n:=n+vocab_private.dispatch_reserves();
 return n;
end $function$
;

select vocab_private.cache_packet(user_id,payload) from vocab_private.preparations where payload is not null;
notify pgrst,'reload schema';
