begin;
do $test$
declare l jsonb:='{"words":{"의견":{"days":["2026-10-21"]}}}';
begin
 if vocab_private.correct_word_blocked(l,'의견','2026-10-21') then raise exception 'recognition cannot block sentence practice';end if;
 l:='{"words":{"의견":{"useDays":["2026-10-21"]}}}';
 if not vocab_private.correct_word_blocked(l,'의견','2026-10-27') or vocab_private.correct_word_blocked(l,'의견','2026-10-28') then raise exception 'seven-day boundary';end if;
 l:='{"words":{"의견":{"sentenceReviewStage":"month","sentenceReviewDue":"2026-11-27"}}}';
 if not vocab_private.correct_word_blocked(l,'의견','2026-11-26') or vocab_private.correct_word_blocked(l,'의견','2026-11-27') then raise exception 'month boundary';end if;
 l:='{"words":{"의견":{"sentenceReviewStage":"learning","sentenceReviewDue":null,"useDays":["2026-10-21"]}}}';
 if vocab_private.correct_word_blocked(l,'의견','2026-10-21') then raise exception 'lapse must permit relearning';end if;
end $test$;
rollback;
