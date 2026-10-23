# Start reliability — 12.16.49 (2026-10-23)

## Confirmed cause

Postgres logs showed repeated `Invalid review window` failures at 07:19 UTC. The affected queue had attempts=8 and no saved payload. Replaying the learner's mixed historical state offline produced all 15 valid questions in about one second, but the production `review_packet_valid` rejected the packet. A lower-stage coverage target had an old successful sentence (`useDays`, `useSuccess`), no next review date, and insufficient long-term mastery. JavaScript's `lowerVocabularyBacklog` correctly kept it until `masteryConfirmed`; SQL's `coverage_plan_valid` still rejected any target with prior usage. This inconsistency prevented the whole packet from being saved.

The same replay passed after aligning SQL with the existing JS mastery requirements. The affected preparation was retried through the owner-scoped existing ensure RPC and became ready with 15/15 saved questions. Both children's actual consume RPCs passed in a transaction that was rolled back, preserving their learning/queue progress.

A separate visible symptom was deterministic: the `buildSession` catch always called `show('home')`, whose implementation scrolls to zero. Failing while already on the home card therefore looked like a button that only jumps to the page top. The finalizer also overwrote the error badge with “클라우드 연결”. A manual click could join an already failing warm-up promise and miss its explicit retry. Also, `packet_complete(NULL)` returns SQL NULL; both status RPCs used `not packet_complete(payload)`, so exhausted jobs without a first checkpoint remained “pending” rather than “failed”.

## Changes

- Private `mastery_confirmed` mirrors JS: no outstanding mastery refresh, at least 3 independent recall days, a successful 7-day retention check, and sentence-use evidence. Coverage remains blocked during the 7/30-day sentence cooldown. Curriculum word/definition/band, origin level, owner, counts and question validation are retained. `coverage_usage_confirmed` is unchanged for retention purposes.
- Both status RPCs now treat a missing packet as incomplete when classifying exhausted jobs, preventing endless pending polling.
- Failed starts stay at the current home scroll and retain a visible failure/pending status. Genuine screen transitions still scroll normally.
- A deliberate click joining a failed background warm-up makes one explicit retry; shared request cleanup cannot delete a newer request. No browser question generation is introduced.
- Worker storage errors retain bounded stage/code/reason diagnostics through the exact capability and lease. Failure reporting preserves accepted peers, never stores raw DB details, and falls back to the old RPC on older deployments. Failure metadata is stored separately from lesson payloads so an error-only record cannot be mistaken for an obsolete lesson and re-enqueued forever.

## Verification

- Real rejected packet replay: before=false, after=true. Actual queue recovered to ready 15/15. No original learner answer or score was changed.
- Rollback SQL checks: prior use but incomplete mastery, mastered exclusion, lapse reopening, exact due boundary/future review exclusion, definition/origin guards, foreign capability/stale lease rejection, accepted-peer preservation and diagnostic sanitization.
- Delivered-browser-source tests: failed start retains scroll/status/unlocked controls and unchanged records; failed warm-up followed by click retries once and consumes once; offline full packet for the mixed historical state.
- Real Chromium mobile-page tests click the production start function for terminal and pending failures and verify unchanged scroll with no home navigation. Existing IndexedDB/cloud recovery checks remain. The browser CI runner is fixed to Ubuntu 24.04 because `ubuntu-latest` moved to 26.04, which the pinned Playwright 1.55 installer does not support.
- Existing full regression/build and GitHub browser CI must pass before merge. No paid AI calls in tests.

Vercel runtime logs returned a 403 permission error. The cause above is established through Postgres logs, actual source, real learner-state replay, production SQL validation and rolled-back start confirmation, rather than inferred from absent Vercel logs.
