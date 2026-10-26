-- One upgrade retry for failures predating the repaired review-window policy.
-- Never reset a new failure's bounded retry budget or an active learner lesson.
do $retry$
declare item record;
begin
 for item in select p.user_id,p.profile from vocab_private.preparations p join public.app_state a using(user_id)
 where p.user_id='06c78577-b96e-4919-b979-58683ff5946e' and p.status<>'ready' and p.attempts>=8 and not p.is_consumed
 and p.last_failure->>'reason'='review_window_invalid' and p.last_failure->>'at'<'2026-10-26T00:00:00'
 and coalesce(a.state#>array['users',p.profile,'activeLesson'],'null')='null'
 for update of p loop perform vocab_private.enqueue(item.user_id,item.profile);end loop;
end $retry$;
