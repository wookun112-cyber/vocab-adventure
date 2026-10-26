# Reliability repair 12.16.62 — 2026-10-26

The production audit found timed-out learning saves, an old noun-form 예측 with no MC recovery, exhausted guest preparation retries, and fourteen archived requests with neither a cached result nor a provider response identifier.

## Storage

`database/sparse-learning-save.sql` retains owner RLS, expected-value conflict checks, answer-count protection, history merging, day-switch protection and immutable round numbers. The patch walker updates only changed object branches instead of aggregating every unchanged sibling. Save triggers cache profile subtrees, skip unchanged profiles/word evidence and avoid rewriting identical round registries. The family row remains shared; this is a sparse-update optimization, not a completed profile-table migration.

On the same production data, a dedicated-profile save rolled back after verification took 1205 ms before and 544 ms after. A further authenticated-role check took 359 ms. These samples include DB processing, not device/network latency, and do not guarantee all future request times. No timeout was raised. All QA writes rolled back, with exact family-state equality assertions.

## Historical content

An explicit alias maps the original noun 예측 (its original definition, domain and band) to the already authored prediction situations. New vocabulary selection is unchanged. Both old noun and current verb remain separate canonical identities. The additive bank import preserves all learner records and old grades.

## Archived results

All fourteen audited old jobs had no stored result, provider ID or receipt; thirteen recorded a provider start and one never started. They cannot safely be assigned invented grades or automatically charged again. Their original answers and payloads are preserved. Pending-only unknown placeholders are relabeled explicitly ungraded, with the original placeholder retained in `legacyOriginalResult`; no score is assigned. Metadata records `legacy_unavailable` and the original cache hash. Active pending counts exclude these terminal unavailable requests, while a separate original-ungraded count remains visible. A later real cache result makes the job eligible again. Recovery uses its original hash, independent of later model/policy changes.

The settlement maintenance script checks owner, age, cache absence, response absence and raw-answer invariants under locks. It does not call AI, change scores/mastery or delete submissions. Production index counts are zero pending, one original-ungraded for 아영 and thirteen for 인성.

## Preparation

The guest queue was re-enqueued after the already-deployed review-window fix. It reached ready with all 15 questions on one attempt using the bank-only policy. The upgrade retry script is bounded to known failures predating this repair, with no active lesson and no unbounded retry reset.

## Validation

Live DB tests cover mixed array/object patching, idempotency, conflicting writes, sibling preservation, learning regression rejection, round renumbering rejection, unavailable-result suppression, later real-result eligibility and cross-family isolation. Synthetic fixtures and fake cache results always roll back. Regression tests cover the old noun through the real recovery handler, unchanged future grading semantics and bank feedback integrity. Deployment must also pass both GitHub checks before merge.
