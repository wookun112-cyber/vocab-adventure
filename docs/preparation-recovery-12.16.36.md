# 12.16.36 — unfinished targets can start today's lesson

The October 17 home-screen wait came from a mismatch between the worker and database. The worker selected genuinely assigned but unfinished words, including targets never answered and words with a future review date. The database still treated these as ordinary due reviews, rejected the packet, and rejected the error checkpoint through the same validation path. No payload was saved; one queue retried eight times.

The database now validates carryover against the learner's saved unfinished assignment and current eligible curriculum. It requires sentence-use practice, excludes level evidence, rejects already-completed/same-day/forged assignments, and retains the five-new/ten-review limits and all ordinary review restrictions. No answers, grades, history or archives are rewritten.

A separate capability-and-lease-scoped failure transition ends rejected work without deleting saved peers. A deliberate retry revokes the old lease, including exhausted reserves. The browser identifies failed storage after polling instead of labeling it preparation in progress.

Validation: both affected real learner plans failed the old database validator and passed the corrected validator. SQL rollback tests cover unanswered/out-of-band and future-review assignments, forged/completed/same-day targets, duplicate words, non-use tasks, ability eligibility, wrong capabilities, stale leases, and immutable ready packets. Both production queues were safely retried and reached ready with 15/15 questions; a rollback-only consume check verifies both can start. Offline regression checks and release CI cover the deployed browser source. No paid AI request was used.
