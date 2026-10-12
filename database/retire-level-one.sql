-- User-requested removal of level-one targets; historical answers stay intact.
-- Run after 12.16.13 is ready so refills use the new eligibility rule.
create table if not exists vocab_private.level_one_retirement_archive (
 kind text not null,
 record_key text not null,
 snapshot jsonb not null,
 retired_at timestamptz not null default now(),
 primary key(kind,record_key)
);
alter table vocab_private.level_one_retirement_archive enable row level security;
revoke all on vocab_private.level_one_retirement_archive from public,anon,authenticated;

insert into vocab_private.level_one_retirement_archive(kind,record_key,snapshot)
select 'curriculum',id::text,to_jsonb(c) from public.curriculum_words c
where band=1 and quality_status<>'rejected' on conflict do nothing;
update public.curriculum_words c set quality_status='rejected',
 review_flags=(select array_agg(distinct f) from unnest(coalesce(c.review_flags,'{}'::text[])||array['removed_level_one']) f),
 review_reason=concat_ws('; ',nullif(c.review_reason,''),'보호자 요청: 1단계 어휘 학습 대상에서 제거 (12.16.13)'),updated_at=now()
where band=1 and quality_status<>'rejected';
do $block$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.curriculum_words'::regclass and conname='curriculum_words_no_level_one') then
  alter table public.curriculum_words add constraint curriculum_words_no_level_one check(band<>1 or quality_status='rejected');
 end if;
end $block$;

-- Preserve only non-secret metadata and packets; never copy worker capabilities.
insert into vocab_private.level_one_retirement_archive(kind,record_key,snapshot)
select 'preparation',id::text,jsonb_build_object('owner',user_id,'profile',profile,'status',status,'payload',payload)
from vocab_private.preparations j where not is_consumed and exists(
 select 1 from jsonb_array_elements(coalesce(j.payload->'plans','[]')) p
 left join public.curriculum_words c on c.word=p#>>'{w,w}' where p#>>'{w,band}'='1' or c.band=1
) on conflict do nothing;
insert into vocab_private.level_one_retirement_archive(kind,record_key,snapshot)
select 'reserve',id::text,jsonb_build_object('owner',user_id,'profile',profile,'slot',slot,'status',status,'payload',payload)
from vocab_private.lesson_reserves j where status<>'consumed' and exists(
 select 1 from jsonb_array_elements(coalesce(j.payload->'plans','[]')) p
 left join public.curriculum_words c on c.word=p#>>'{w,w}' where p#>>'{w,band}'='1' or c.band=1
) on conflict do nothing;
with reset as (
 update vocab_private.preparations j set payload=null,status='pending',attempts=0,lease=null,next_attempt=now(),updated_at=now()
 where not is_consumed and exists(
  select 1 from jsonb_array_elements(coalesce(j.payload->'plans','[]')) p
  left join public.curriculum_words c on c.word=p#>>'{w,w}' where p#>>'{w,band}'='1' or c.band=1
 ) returning id
) select vocab_private.kick_preparation(id) from reset;
with reset as (
 update vocab_private.lesson_reserves j set payload=null,status='pending',attempts=0,lease=null,next_attempt=now(),updated_at=now()
 where status<>'consumed' and exists(
  select 1 from jsonb_array_elements(coalesce(j.payload->'plans','[]')) p
  left join public.curriculum_words c on c.word=p#>>'{w,w}' where p#>>'{w,band}'='1' or c.band=1
 ) returning id
) select vocab_private.kick_reserve(id) from reset;
