-- Remove two unsuitable legacy review targets without replacing good peers.
update public.curriculum_words set quality_status='rejected' where word in ('광합성 작용','도시 문제');

create or replace function vocab_private.repair_bank_targets(data jsonb,l jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; replacement jsonb; plans jsonb:='[]'; ready jsonb; excluded text[]:='{}'; i integer:=0; st jsonb;
begin
 if not exists(select 1 from jsonb_array_elements(coalesce(data->'plans','[]')) x where x#>>'{w,w}' in ('광합성 작용','도시 문제')) then return data;end if;
 if data->'newWords' ?| array['광합성 작용','도시 문제'] then return null;end if;
 for p in select value from jsonb_array_elements(data->'plans') loop
  if p#>>'{w,w}' in ('광합성 작용','도시 문제') then
   select x into replacement from jsonb_array_elements(data->'plans') x where x#>>'{w,w}' not in ('광합성 작용','도시 문제')
    and coalesce((l#>>array['words',x#>>'{w,w}','seen'])::integer,0)>0
    and not exists(select 1 from public.curriculum_words c where c.word=x#>>'{w,w}' and c.quality_status='rejected')
    order by (select count(*) from jsonb_array_elements(data->'plans') z where z#>>'{w,w}'=x#>>'{w,w}'),x->>'id' limit 1;
   if replacement is null then return null;end if;
   st:=l#>array['words',replacement#>>'{w,w}'];
   p:=p||jsonb_build_object('w',replacement->'w','structureNote',coalesce(replacement->>'structureNote',''),'needsCard',false,'firstLearning',false,'supportLevel',coalesce((st->>'supportLevel')::integer,0),'successStreak',coalesce((st->>'streak')::integer,0));
   excluded:=array_append(excluded,i::text);
  end if;
  plans:=plans||jsonb_build_array(p);i:=i+1;
 end loop;
 select coalesce(jsonb_agg(r),'[]') into ready from jsonb_array_elements(coalesce(data->'ready','[]')) r where not ((r->>0)=any(excluded));
 return (data-'preparationIssues'-'preparationError')||jsonb_build_object('plans',plans,'ready',ready);
end $$;
revoke all on function vocab_private.repair_bank_targets(jsonb,jsonb) from public,anon,authenticated;

do $$
declare j record; repaired jsonb;
begin
 for j in select p.*,s.state#>array['users',p.profile] as learner from vocab_private.preparations p join public.app_state s using(user_id)
  where not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null'
  and exists(select 1 from jsonb_array_elements(coalesce(p.payload->'plans','[]')) x where x#>>'{w,w}' in ('광합성 작용','도시 문제')) for update of p loop
  repaired:=vocab_private.repair_bank_targets(j.payload,j.learner);
  update vocab_private.preparations set payload=repaired,capability=gen_random_uuid(),lease=null,status='pending',attempts=0,next_attempt=now(),updated_at=now() where id=j.id;
 end loop;
 for j in select p.*,s.state#>array['users',p.profile] as learner from vocab_private.lesson_reserves p join public.app_state s using(user_id)
  where p.status<>'consumed' and exists(select 1 from jsonb_array_elements(coalesce(p.payload->'plans','[]')) x where x#>>'{w,w}' in ('광합성 작용','도시 문제')) for update of p loop
  repaired:=vocab_private.repair_bank_targets(j.payload,j.learner);
  update vocab_private.lesson_reserves set payload=repaired,capability=gen_random_uuid(),lease=null,status='pending',attempts=0,next_attempt=now(),updated_at=now() where id=j.id;
 end loop;
end $$;
