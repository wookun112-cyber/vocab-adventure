-- Retain every good item; regenerate only unused usage choices with name clues.
update vocab_private.preparations p set payload=jsonb_set(p.payload,'{ready}',coalesce((
 select jsonb_agg(q order by (q->>0)::int) from jsonb_array_elements(p.payload->'ready') q
 where not(q->1->>'type'='mc_usage' and exists(
 select 1 from jsonb_array_elements(q->1->'opts') o where position(regexp_replace(q->1#>>'{w,w}','\s+','','g') in regexp_replace(o->>'t','\s+','','g'))>0))),'[]')),
 status='pending',lease=null,next_attempt=now(),updated_at=now()
from public.app_state s where s.user_id=p.user_id and not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null'
and exists(select 1 from jsonb_array_elements(p.payload->'ready') q where q->1->>'type'='mc_usage' and exists(
 select 1 from jsonb_array_elements(q->1->'opts') o where position(regexp_replace(q->1#>>'{w,w}','\s+','','g') in regexp_replace(o->>'t','\s+','','g'))>0));
