-- Grammar classification labels and transparent descriptions are background only.
update public.curriculum_words set quality_status='rejected',review_flags=array(select distinct f from unnest(coalesce(review_flags,'{}')||array['specialist_knowledge_target']) f),review_reason='문법 분류 이름이나 투명한 설명구는 지문 소재로만 사용한다.',reviewed_at=now(),updated_at=now()
where quality_status<>'rejected' and regexp_replace(word,'\s+','','g') in (
'꾸미는말','이어주는말','이어주는말','임자말','풀이말','명사','동사','형용사','부사','관형사','대명사','수사','조사','어미','주어','서술어','목적어','보어','관형어','부사어','독립어','문장성분','보조사','격조사','접속조사','접속조사','문장의짜임','어절','음운','음소','자외선차단' );
do $$ declare j record;begin
for j in select p.user_id,p.profile from vocab_private.preparations p join public.app_state s using(user_id)
where not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null' and exists(
 select 1 from jsonb_array_elements(p.payload->'plans') plan join public.curriculum_words w on w.word=plan#>>'{w,w}' where w.quality_status='rejected') loop
 perform vocab_private.enqueue(j.user_id,j.profile);
end loop;end $$;
notify pgrst,'reload schema';
