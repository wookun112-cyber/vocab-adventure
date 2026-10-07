-- Keep scientific names as background and retain every validated peer.
update public.curriculum_words set quality_status='rejected',
 review_flags=array(select distinct f from unnest(coalesce(review_flags,'{}')||array['specialist_knowledge_target']) f),
 review_reason='반복 검수에서 과학 개념의 이름을 묻는 문항으로 판정되어 지문 소재로만 사용한다.',reviewed_at=now(),updated_at=now()
where word='세포' and quality_status<>'rejected';
do $$ declare j record; replacement jsonb; changed text[]; revised jsonb;
begin
 for j in select p.*,s.state->'users'->p.profile learner from vocab_private.preparations p join public.app_state s using(user_id)
 where not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null'
 and not coalesce(p.payload->'newWords','[]')?'세포'
 and exists(select 1 from jsonb_array_elements(p.payload->'plans') plan where plan#>>'{w,w}'='세포' and not exists(select 1 from jsonb_array_elements(p.payload->'ready') q where q->>0=plan->>'id'))
 loop
  select jsonb_build_object('w',w.word,'d',w.definition,'band',w.band,'cat',w.domain,'example',coalesce(w.example,''),'pair',coalesce(w.confusion,''),'contrast',coalesce(w.contrast,''),'source','fixed') into replacement
  from public.curriculum_words w where w.quality_status<>'rejected' and w.word in ('관찰','약속','협력','배려','책임','원인','확인하다')
  and coalesce((j.learner->'words'->w.word->>'seen')::int,0)>0
  and not exists(select 1 from jsonb_array_elements(j.payload->'plans') plan where plan#>>'{w,w}'=w.word)
  order by case when w.word='관찰' then 0 else 1 end,w.band limit 1;
  if replacement is null then continue; end if;
  select array_agg(plan->>'id') into changed from jsonb_array_elements(j.payload->'plans') plan where plan#>>'{w,w}'='세포'
   and not exists(select 1 from jsonb_array_elements(j.payload->'ready') q where q->>0=plan->>'id');
  select jsonb_agg(case when plan->>'id'=any(changed) then jsonb_set(plan,'{w}',replacement) else plan end order by n) into revised
  from jsonb_array_elements(j.payload->'plans') with ordinality f(plan,n);
  update vocab_private.preparations set payload=(jsonb_set(jsonb_set(j.payload,'{plans}',revised),'{baseWords}',
   (select jsonb_agg(case when w->>'w'='세포' then replacement else w end order by n) from jsonb_array_elements(j.payload->'baseWords') with ordinality f(w,n))) - 'preparationError' - 'preparationIssues'),
   status='pending',lease=null,next_attempt=now(),updated_at=now() where id=j.id;
 end loop;
end $$;
