# 12.16.33 — daily settlement, due-review capacity, archived grades

## Behavior

- The 30-minute daily stop now commits earned ranking ability, learning-day count and a `time_limit` session summary. It never marks unfinished vocabulary mastered, sets the daily mastery date, grants a completion reward, or deletes the saved draft. The summary references its source lesson so historical time is not imported twice. Settlement is idempotent for the lesson/day.
- Daily selection reserves up to two available, due review targets before filling the remaining review slots with unfinished words. The review maximum remains ten, basic new words remain five, and overflow remains pending. Protected due targets appear within the first four review targets as recall tasks, so they are not buried behind the backlog. No reserved seats are wasted when due candidates are unavailable. Updated snapshot policy invalidates old unused reserve plans.
- At a safe cloud-load boundary, after device-only work is flushed, the app checks archived grading jobs. Recovery reads existing cache results or verifies a signed receipt. It never starts a provider call or a paid-grade lease. Work is bounded and a conflict leaves the job pending for the next load.
- Recovery replaces the original pending answer on its original date, updates word/use evidence and daily accuracy, preserves active drafts, and does not retroactively change today's ability. Older results cannot roll back newer success/review dates or complete a newer assignment. Missing results remain pending, without guessed grades or automatic rebilling.
- Atomic owner-scoped RPCs compare the entire learner snapshot, update archive and learner together, and increment the existing state sequence to reject stale devices. The ordinary client merge flushes unsynced device work before initiating recovery.

## Database

`database/archived-grade-recovery.sql` is the canonical source for the deployed `archived_grade_recovery` migration. It adds cache lookup, archived-job lookup and atomic recovery RPCs. No learner records are backfilled by the migration. Existing browser code is compatible.

## Verification

- Full offline regression suite: 49 scripts, with no provider requests.
- New recovery checks: original date/time, newer progress, current draft, duplicate jobs, cache misses, account isolation and compare-and-swap conflicts.
- Expanded clock/review checks: 30-minute ranking/day settlement, unchanged unfinished draft, no duplicate time, 8 unfinished + 2 due targets, overflow preservation.
- Effective browser-source load-boundary check: unsynced local checkpoint is flushed before reconciliation and the committed server snapshot is then loaded.
- Live database rollback-only checks: atomic commit, stale snapshot, duplicate job, anonymous denial and other-owner isolation. Test changes rolled back.
- Database advisory scan found no finding on the new functions. Pre-existing warnings were not changed in this release.

Recovery runs on login/record reload and day-switch load boundaries, not while the child is typing. A cached grade existed for the outstanding archived Ayoung job at release preparation; it will be reconciled through the safe load flow.
