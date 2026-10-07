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


-- Teach the transferable root before the subject-specific expression.
update public.curriculum_words set quality_status='rejected',
 review_flags=array(select distinct f from unnest(coalesce(review_flags,'{}')||array['root_first_context_expression']) f),
 review_reason='분배 등 핵심 어휘를 먼저 학습하고 소득 분배는 지문 속 확장 표현으로 사용한다.',reviewed_at=now(),updated_at=now()
 where regexp_replace(word,'\s+','','g')='소득분배' and quality_status<>'rejected';
-- Only unused lessons are rebuilt. Active lesson results and cursor stay intact.
do $$ declare j record; begin
 for j in select p.user_id,p.profile from vocab_private.preparations p join public.app_state s using(user_id)
 where not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null'
 and p.payload is not null and p.payload->>'questionPolicy' is distinct from 'vocabulary-depth-12.6' loop
 perform vocab_private.enqueue(j.user_id,j.profile);
 end loop;
end $$;
notify pgrst,'reload schema';
