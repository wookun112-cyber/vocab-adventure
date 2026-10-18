# 12.16.38 — exact word answers cannot be overridden by delayed grades

The user's clarification concerns headword recall, not sentence-use quality. The previous release addressed a separate confirmed over-strict sentence grading problem. Sparse saved snapshots did not identify the particular exact-match incident; 운반하다 was the user's example, not a confirmed historical target.

The existing browser fast path already accepted exact words. This change also checks exact headword/answer-form identity when applying delayed or cached semantic results, preventing an incoming wrong score from overriding the stored question's exact answer. On the server, exact headword recall is resolved before cache/receipt/AI processing, but only after checking the task against the saved assignment. Sentence-use tasks and different words cannot take this path. No provider, grade lease or paid-start operation is needed for exact answers.

Hint-assisted correct responses retain their assisted credit and evidence rules but display “힌트로 맞혔어요” rather than “부분 이해”. Reveal actions now preserve a separate input-at-reveal field and action marker so later incident review can distinguish submission from answer reveal. No previous answers, scores, rewards or difficulty values are bulk rewritten.

The browser receipt lookup now includes the grading policy, matching the server's policy-specific cache identity while keeping untagged old receipt keys unchanged.

Production-source tests cover direct exact submissions, decomposed Hangul/invisible formatting, deliberately wrong delayed grades, wrong words, word-only sentence answers, hinted correctness labels, receipt policy keys, saved-assignment rejection and zero provider/lease calls. Tests demonstrate these guarded paths, not the unlocated original incident's exact cause.
