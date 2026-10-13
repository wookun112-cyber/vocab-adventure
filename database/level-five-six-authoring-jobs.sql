create table if not exists vocab_private.level_five_six_authoring_jobs(
 id uuid primary key default gen_random_uuid(),capability uuid not null default gen_random_uuid(),
 word text unique not null,word_data jsonb not null,seed jsonb,status text not null default 'pending',
 attempts integer not null default 0,lease uuid,leased_at timestamptz,feedback jsonb not null default '[]',
 expires_at timestamptz not null default now()+interval '24 hours',updated_at timestamptz not null default now());
alter table vocab_private.level_five_six_authoring_jobs enable row level security;
revoke all on vocab_private.level_five_six_authoring_jobs from public,anon,authenticated;
insert into vocab_private.level_five_six_authoring_jobs(word,word_data)
select c.word,jsonb_build_object('word',c.word,'definition',c.definition,'band',c.band,'domain',c.domain,'example',c.example,'confusion',c.confusion,'contrast',c.contrast)
from public.curriculum_words c where c.band in (5,6) and c.quality_status='reviewed' and not exists(
 select 1 from vocab_private.bank_authoring_items b where b.word=c.word and b.status='authored_draft')
on conflict(word) do nothing;

create or replace function public.claim_level_five_six_authoring(p_id uuid,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j vocab_private.level_five_six_authoring_jobs;
begin
 if p_id is null or p_key is null then return null;end if;
 select * into j from vocab_private.level_five_six_authoring_jobs where id=p_id and capability=p_key and expires_at>now() for update;
 if not found then return null;end if;
 if j.status='ready' then return jsonb_build_object('done',true);end if;
 if j.attempts>=4 or(j.status='working' and j.leased_at>now()-interval '6 minutes')then return null;end if;
 j.lease:=gen_random_uuid();
 update vocab_private.level_five_six_authoring_jobs set status='working',lease=j.lease,leased_at=now(),attempts=attempts+1,updated_at=now()where id=j.id;
 return jsonb_build_object('word',j.word_data,'feedback',j.feedback,'seed',j.seed,'lease',j.lease);
end; $$;
create or replace function public.finish_level_five_six_authoring(p_id uuid,p_key uuid,p_lease uuid,p_seed jsonb,p_feedback jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_id is null or p_key is null or p_lease is null or octet_length(coalesce(p_seed,'{}')::text)>40000 then return false;end if;
 update vocab_private.level_five_six_authoring_jobs set seed=p_seed,feedback=coalesce(p_feedback,'[]'),status=case when p_seed is null or jsonb_array_length(coalesce(p_feedback,'[]'))>0 then 'revision_needed' else 'ready' end,updated_at=now()
 where id=p_id and capability=p_key and lease=p_lease and status='working' and expires_at>now();
 return found;
end; $$;
revoke all on function public.claim_level_five_six_authoring(uuid,uuid),public.finish_level_five_six_authoring(uuid,uuid,uuid,jsonb,jsonb)from public,authenticated;
grant execute on function public.claim_level_five_six_authoring(uuid,uuid),public.finish_level_five_six_authoring(uuid,uuid,uuid,jsonb,jsonb)to anon;
