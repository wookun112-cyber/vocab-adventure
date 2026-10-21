begin;
do $test$
declare d text:='2026-10-21'; l jsonb; i integer;
begin
 l:='{"words":{"의견":{"seen":3,"days":["2026-10-21"],"nextReviewAt":"2026-10-21"}}}';
 for i in 0..6 loop
  if not vocab_private.correct_word_blocked(l,'의견',to_char(d::date+i,'YYYY-MM-DD')) then raise exception 'Day % escaped cooldown',i;end if;
 end loop;
 if vocab_private.correct_word_blocked(l,'의견','2026-10-28') then raise exception 'Day seven remains blocked';end if;
 if vocab_private.correct_word_blocked('{"words":{"의견":{"seen":3,"wrong":3}}}','의견',d) then raise exception 'Wrong-only word was blocked';end if;
 if not vocab_private.correct_word_blocked('{"words":{},"learningEvidence":[{"word":"의견","success":true,"date":"2026-10-21"}]}','의견',d) then raise exception 'Historical evidence ignored';end if;
 if vocab_private.reserve_usable('{"plans":[{"w":{"w":"의견"}}]}',l) then raise exception 'Recent-correct reserve was usable';end if;
end $test$;
select 'PASS: seven-day SQL cooldown boundaries, old evidence and reserve exclusion' as result;
rollback;
