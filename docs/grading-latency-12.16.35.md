# 12.16.35 — faster retrieval of completed grades

## Changes
- Polling uses a read-only server branch and owner-scoped `read_vocab_grade_status` RPC. Reads cannot claim leases, start providers, or mutate cache results. Completed in-memory/signed results remain deliverable without another provider request.
- Foreground initial wait is 12 seconds instead of 8, allowing normal grading plus authentication/storage to finish directly. Pending queues are checked on a 2-second foreground interval instead of 15 seconds. Normal pending is not counted as an error and does not escalate to the previous 60–120-second delay.
- A server `retryable` status is required before another submission. Started work with a missing result remains recovery-required, never automatically rebilled. Actual transport failures use bounded backoff; daily budget, account, and exhausted-credit safeguards remain.
- Saved legacy transient waits migrate to the fast status policy. Multiple jobs rotate by last poll time. Session/account/profile guards prevent results crossing learner boundaries.
- Final waiting screen displays pending count and distinguishes normal checking, connectivity failure and recovery/account issues. Waiting remains excluded from study time; no unresolved answer counts as correct or complete.
- Exact matches to validated string-form accepted answers use the existing deterministic fast path. Synonym acceptance stays distinct from target-word recall. Sentence use still requires semantic grading.

## Verification
- Offline server tests: cache miss/pending/ready/recovery, cold worker, no polling writes/new paid calls, current copied-answer flags, unauthenticated/account isolation.
- Foreground queue tests: repeated pending with no error escalation, explicit retry permission, legacy wait migration, quota preservation, final-screen count, exact approved synonyms.
- Existing recovery, interruption, time, mastery and storage suites remain required (50 regression scripts total), plus Chromium CI.
- Production SQL migration `read_only_grade_status_polling`; rollback-only test verifies all statuses, no insertion on miss, owner isolation and anonymous EXECUTE denial. No learner records changed for testing.

## Limits
The 2-second interval is result checking, not a guarantee of total AI latency. Provider/network time remains. The model, prompt and sentence evaluation criteria are unchanged; no paid model tests were run. This release does not infer correctness from the mere presence of the target word.
