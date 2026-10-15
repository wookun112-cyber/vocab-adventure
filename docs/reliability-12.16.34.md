# 12.16.34 — close-boundary recovery and original submission dates

Three reproduced functional gaps are repaired:

- Archived grading accepts a saved submitted job when closing prevented creation of its pending result. The original plan/word and cursor must match, and an existing result cannot be inserted twice. The owner-scoped CAS transaction updates the result, queue status, resume cursor, learner and archive index together. Recovery remains cache/receipt-only, with no paid grading calls.
- Durable checkpoints and account loads settle recorded 30-minute days before resume controls enforce the cap. Missed previous-day settlement uses the original study day. Settlement is idempotent and preserves unfinished words and drafts; it creates no mastery or completion bonus. Later level adjustments cannot be overwritten by an older recovered day.
- Foreground delayed grading consistently uses the submission date for evidence, use confirmation and review scheduling. Historical results do not move today's level or issue today's activity reward. Later exposure, success, streak and review schedules survive older results.

Validation:

- All 49 offline regression scripts passed.
- Expanded effective-browser VM coverage: close exactly at cap before timer delivery, same-day restart, next-day recovery, load-boundary cloud flush and repeat-load idempotence, original-date delayed success/error and preservation of later progress.
- Archive unit/API tests cover a missing placeholder, cursor gap, mismatched word, duplicate result and cache misses without model calls.
- Deployed canonical SQL through migration `recover_submitted_grade_without_placeholder`. A rollback-only production transaction verified missing-placeholder lookup, stale CAS rejection, atomic result/cursor/job commit and duplicate rejection. No test learner changes were committed.

The app cannot recover a grade that was never produced; those submitted answers remain saved for the existing grading retry path. This release addresses loss of already available results and missed settlement, rather than removing network/provider latency.
