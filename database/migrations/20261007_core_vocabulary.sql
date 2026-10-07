-- Transparent phrases remain in records and passages, not target vocabulary.
update public.curriculum_words set quality_status='rejected',
 review_flags=array(select distinct f from unnest(coalesce(review_flags,'{}')||array['context_only_expression']) f),
 review_reason='독립된 목표 어휘 대신 지문에서 사용하는 설명형 표현. 핵심 단어를 별도로 학습한다.',reviewed_at=now(),updated_at=now()
 where quality_status<>'rejected' and regexp_replace(word,'\s+','','g') in ('생활정보격차','정보격차','지역격차','지역발전격차','빈부격차','소득격차','생활정보의판단기준','개인정보보관기간','개인정보의보관기간','정보제공범위','정보의객관성','정보의최신성','정보의타당성','정보의위계','정보검증','정보선별','정보전달','개인정보유출','생활폐기물배출기준','생활비지출항목','재난정보확인경로','비교기준','해결방안','발표자료','관찰기록','관계회복','생활안전수칙','생활속위험요인','독서목적','독서의목적','독서태도','독서기록','예약확인','보관방법','보관상태','식품보관온도','사실과의견의구별','비판적읽기전략','자료수집계획','주민의견수렴');
insert into public.curriculum_words(word,definition,band,domain,source,quality_status,review_reason,reviewed_at)
 select v.word,v.definition,v.band,v.domain,'editorial-core-12.4.1','reviewed','설명형 표현을 대신하는 핵심 어휘. 문맥에서 여러 상황에 적용한다.',now()
 from (values ('격차','둘 사이에 벌어진 수준이나 정도의 차이이다.',4,'국어'),
('갱신','기존 내용을 고치거나 더 새롭게 바꾸는 일이다.',5,'국어'),
('검증','근거나 자료를 살펴 사실이나 주장이 맞는지 확인하는 일이다.',5,'국어'),
('선별','여럿 가운데 목적이나 기준에 맞는 것을 골라내는 일이다.',4,'국어'),
('유출','안에 있던 물질이나 정보가 밖으로 빠져나가는 일이다.',5,'국어'),
('회복','나빠지거나 잃었던 상태를 되찾는 일이다.',4,'국어'),
('반경','활동이나 영향이 미치는 범위이다.',5,'국어'),
('최신성','내용이 현재 상황에 맞게 새롭게 되어 있는 성질이다.',6,'국어'),
('타당성','이유나 근거에 비추어 알맞고 옳다고 볼 수 있는 성질이다.',5,'국어'),
('위계','지위나 중요도 등에 따라 구분되는 높고 낮음의 질서이다.',6,'국어')) as v(word,definition,band,domain)
 where not exists(select 1 from public.curriculum_words w where w.word=v.word);
-- An interrupted lesson keeps its questions and cursor. Replace unused work only.
do $$ declare j record; begin
 for j in select p.user_id,p.profile from vocab_private.preparations p join public.app_state s using(user_id)
 where not p.is_consumed and coalesce(s.state#>array['users',p.profile,'activeLesson'],'null')='null'
 and exists(select 1 from jsonb_array_elements(coalesce(p.payload->'plans','[]')) t where regexp_replace(t#>>'{w,w}','\s+','','g') in ('생활정보격차','정보격차','지역격차','지역발전격차','빈부격차','소득격차','생활정보의판단기준','개인정보보관기간','개인정보의보관기간','정보제공범위','정보의객관성','정보의최신성','정보의타당성','정보의위계','정보검증','정보선별','정보전달','개인정보유출','생활폐기물배출기준','생활비지출항목','재난정보확인경로','비교기준','해결방안','발표자료','관찰기록','관계회복','생활안전수칙','생활속위험요인','독서목적','독서의목적','독서태도','독서기록','예약확인','보관방법','보관상태','식품보관온도','사실과의견의구별','비판적읽기전략','자료수집계획','주민의견수렴')) loop
 perform vocab_private.enqueue(j.user_id,j.profile);
 end loop;
end $$;
