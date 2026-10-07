CREATE OR REPLACE FUNCTION vocab_private.bank_candidates(p_user uuid, p_level numeric)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('question',b.question,'readerLevel',b.reader_level,'supportLevel',b.support_level)),'[]') from (
 select * from vocab_private.question_bank where user_id=p_user and policy='vocabulary-level-fit-12.8' and reader_level between p_level-.35 and p_level+.35 order by created_at desc limit 800
 ) b;
$function$
;

CREATE OR REPLACE FUNCTION vocab_private.cache_packet(p_user uuid, p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   j.payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.8' or
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

CREATE OR REPLACE FUNCTION vocab_private.ensure_reserves(p_user uuid, p_profile text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l jsonb; i integer;
begin
 select state#>array['users',p_profile] into l from public.app_state where user_id=p_user;
 if l is null or not exists(select 1 from jsonb_each(coalesce(l->'words','{}')) where coalesce((value->>'seen')::integer,0)>0 or value->>'introducedAt' is not null) then return; end if;
 for i in 1..1 loop
  insert into vocab_private.lesson_reserves(user_id,profile,slot) values(p_user,p_profile,i) on conflict(user_id,profile,slot) do nothing;
  update vocab_private.lesson_reserves set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,status='pending',payload=null,attempts=0,next_attempt=now(),updated_at=now()
   where user_id=p_user and profile=p_profile and slot=i and (status='consumed' or (status='ready' and (payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.8' or abs(coalesce((payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35)));
 end loop;
 perform vocab_private.kick_reserve((select id from vocab_private.lesson_reserves where user_id=p_user and profile=p_profile and slot=1));
end $function$
;

CREATE OR REPLACE FUNCTION vocab_private.replenish_current_day()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j record; n integer:=0; day text:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
begin
 for j in select p.user_id,p.profile from vocab_private.preparations p join public.app_state s using(user_id)
  where p.status='ready' and not p.is_consumed and p.payload->>'plannedFor'<day
   and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null' for update of p skip locked loop
  perform vocab_private.enqueue(j.user_id,j.profile); n:=n+1;
 end loop;
 return n;
end $function$
;

CREATE OR REPLACE FUNCTION vocab_private.reserve_usable(p_payload jsonb, l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; q jsonb; st jsonb; h jsonb; used text[];
begin
 if p_payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.8' or jsonb_array_length(coalesce(p_payload->'ready','[]'))<>20 or jsonb_array_length(coalesce(p_payload->'plans','[]'))<>20
  or abs(coalesce((p_payload->>'difficulty')::numeric,0)-coalesce((l->>'difficulty')::numeric,2))>.35 then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'plans') x where coalesce((x#>>'{w,band}')::numeric,3)>=greatest(1,floor(coalesce((l->>'difficulty')::numeric,2))-1)) and
  (select count(*) from jsonb_array_elements(p_payload->'plans') x where coalesce((x#>>'{w,band}')::numeric,3)<greatest(1,floor(coalesce((l->>'difficulty')::numeric,2))-1))>4 then return false;end if;
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
end $function$
;
-- Preserve every interrupted/consumed lesson and every learning record.
do $$
declare j record;
begin
 for j in select p.user_id,p.profile from vocab_private.preparations p join public.app_state s using(user_id)
  where not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null'
  and p.payload->>'questionPolicy' is distinct from 'vocabulary-level-fit-12.8' loop
  perform vocab_private.enqueue(j.user_id,j.profile);
 end loop;
end $$;
notify pgrst,'reload schema';
