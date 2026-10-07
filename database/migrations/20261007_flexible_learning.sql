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
