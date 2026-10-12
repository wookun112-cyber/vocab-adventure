-- Run only after the 12.16.15 deployment is READY.
-- Refill unstarted packets with fixed-bank time topups. Keep consumed lessons
-- and the complete learner-state JSON unchanged, including historical times.
do $guard$
declare before_users text;after_users text;kicked bigint;
begin
 select md5((state->'users')::text) into before_users from public.app_state
 where user_id='06c78577-b96e-4919-b979-58683ff5946e' for share;
 with reset as (
  update vocab_private.preparations
  set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,status='pending',payload=null,attempts=0,next_attempt=now(),updated_at=now()
  where user_id='06c78577-b96e-4919-b979-58683ff5946e' and not is_consumed returning id
 ) select count(vocab_private.kick_preparation(id)) into kicked from reset;
 with reset as (
  update vocab_private.lesson_reserves
  set id=gen_random_uuid(),capability=gen_random_uuid(),lease=null,status='pending',payload=null,attempts=0,next_attempt=now(),updated_at=now()
  where user_id='06c78577-b96e-4919-b979-58683ff5946e' and status<>'consumed' returning id
 ) select count(vocab_private.kick_reserve(id)) into kicked from reset;
 select md5((state->'users')::text) into after_users from public.app_state
 where user_id='06c78577-b96e-4919-b979-58683ff5946e';
 if before_users is distinct from after_users then raise exception 'Learner records changed';end if;
end
$guard$;
