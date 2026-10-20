# Grading reliability investigation and repair — 12.16.42

## Scope and provenance

- Vocabulary baseline: main `85a60e64ffa07937be5b09fcc38413757b3273e5` (12.16.41), Vercel project `prj_Kl5CWUkSM9rwmryxdndtXHrrZ5Ns`, Supabase `qhqumfgbbsurgmlpyira`.
- English Path: located with Sites discovery, not in the connected GitHub installation or Vercel inventory. Inspected saved version 59, source `f5978239568e132e24482d0ece462fcb34136bec`, and its relay in Startrail version 100, source `86277f977a7f20d3a50c7121d9713fd9adc0b533`. Neither Site was edited or published in this task.
- Vercel runtime logs and project listing returned 403. No separately authenticated local CLI was available. GitHub deployment checks and public assets can still verify deployment. No claim below attributes an individual failure to a Vercel timeout.

## Observed production evidence

At inspection, the vocabulary cache contained 23 provider-started requests with no result across October 17–19 (13, 4 and 6 respectively). These are unresolved starts, not proof the model completed or was billed for every one. A provider response ID and specific failure reason were not recorded by the old implementation, so the historical requests cannot be conclusively split into network abort, incomplete output, model failure, function termination and lost result write.

For 313 successful cache entries with matching paid-start metadata since October 17, elapsed time from start reservation to result save was median 4.42s, mean 5.19s, p95 9.28s and maximum 21.02s. This includes model, network and save time; it excludes the preceding authentication/assignment/claim. It is not a model-only latency measurement or a complete failure distribution.

In the 24-hour Supabase log window ending October 20 03:00 UTC, confirmed PostgreSQL statement-timeout events affected learning-state save (18), preparation claim (6), preparation save (4) and reserve save (3). No matching grade-RPC statement-timeout event appeared in that window. Thus learning-state save pressure is confirmed; grade-result SQL timeout is a code-level exposure, not a confirmed explanation for all 23 missing results. Cumulative pg_stat_statements showed finish-grade maximum 3.91s versus the client persistence attempt's 2s budget; assignment maximum 6.60s versus its 5s HTTP deadline. These cumulative outliers are not individual failed-request traces. No active lock waiter was present at the inspection instant; that does not exclude earlier contention.

The English D1 attempt sample confirms `gpt-4.1-mini-2025-04-14` for completed grade/chat requests (sample grade outputs 91–116 tokens). The sample also includes quota, recognition and outstanding transcription states; English is not claimed failure-free. Recent Worker logs are accessible, but the bounded sample did not establish an equivalent English latency percentile or failure rate. Vocabulary token usage was previously console-only and cannot be reconstructed from the unavailable Vercel logs.

## Implementation comparison

| Layer | Vocabulary baseline | English Path inspected source |
| --- | --- | --- |
| Immediate answers | Choice/validated recall local; arbitrary own sentences require AI | Choice, contracted/accepted answers, closed recall and structured tasks often local; free answers use AI |
| Provider | Responses, gpt-6-luna confirmed in saved results, reasoning low | Responses through restricted Sites relay, GPT-4.1-mini confirmed in D1 sample, no reasoning parameter |
| Output budget | 650 total output tokens including reasoning; 9 result fields plus four-axis sentence rubric | Six core grade fields, additional feedback/error metadata where required; configured 450/900/1800 depending on task |
| Timeouts | Browser initial 12s, status 8s; provider 22s; grade function 45s; assignment 5s and save attempt up to 2s | Browser 45s; relay 22s; provider 18s; Cloudflare Worker, not Vercel |
| Learner storage | CAS patch of nested family JSON; repeated pending polls also checkpointed/cloud-saved | Append-only D1 events, acknowledged in bounded batches |
| Lost provider request | Started flag, cache, warm memory and signed final-grade receipt; no durable provider ID | D1 job/attempt states, warm memory, preserved pending answers; no durable provider-ID recovery either |

The model and required output are meaningful differences. They do not by themselves prove why a historical call failed. Both old implementations have an uncertainty window; the vocabulary app repeatedly entered it and then could only block or hold the answer. A reasoning response hitting max_output_tokens can be incomplete without visible JSON; this is an official API behavior and a reproduced parser failure mode, not a verified diagnosis of every old missing request.

## Repair

1. Create one background Responses request with explicit storage. Persist its provider ID and lease before waiting for a score. Normal calls retain a bounded 6.5s fast wait; longer calls continue at the provider and resolve through GET of that same ID.
2. Store terminal provider envelope separately before semantic parsing/final grade persistence. A cold worker can re-read the original response or re-parse that envelope without creating another response. Do not change the original rubric, model or historical hash.
3. Return an authenticated, owner/hash/lease-bound signed provider receipt on pending responses. Browser saves it before rejecting 202 as pending. It survives device restart and can recover even if the initial DB ID checkpoint failed. The existing signed final-grade receipt also repairs cache on status polls after a DB outage.
4. Store bounded failure stage/code/time and provider status/usage; log no prompts, answers, API keys or authorization headers. Incomplete/invalid output remains ungraded, with no automatic paid replacement. The output ceiling increases from 650 to 1400; actual use is not forced to that ceiling. Reasoning stays low to preserve assessment behavior.
5. Status polls do not rewrite the large learner tree every two seconds. Changed results/errors still save immediately, and pending-only work retains local checkpoints plus a 30s cloud heartbeat. Assignment validation, family authorization, budget controls and single-start lease remain.
6. Browser initial/poll budgets become 22s/15s and server maxDuration 60s, with bounded provider creation/retrieval requests. These are transport budgets, not counted learning time. No maxDuration increase is relied upon for durability: a saved ID can be retrieved after function restart.
7. Archived pending jobs also use the authenticated GET-only recovery path when available. Historical jobs without any ID, valid receipt or result stay ungraded; no invented score, historical rewrite or duplicate paid call.

## Limits and validation

There remains an unavoidable cross-service uncertainty window if the provider accepts a POST but its ID reaches neither the database nor the signed receipt returned to the device. Such a job is never automatically resubmitted. This release reduces and makes recoverable the much larger generation/parsing/save window; it does not claim mathematically exactly-once delivery across two independent services.

`verify-durable-grading.mjs` reproduces queued responses, cold restart, provider GET timeout, missing create acknowledgement, DB ID/result outages, signed provider and grade receipts, concurrent duplicates, incomplete output, terminal envelope reparse, owner/hash isolation and archive recovery. Production-patched browser tests cover pending-receipt persistence, resumed learning, preserved drafts and reduced cloud writes. Existing assessment, difficulty, long-term mastery, round timing, bank-only and storage tests remain enabled. Provider calls are mocked; no child submissions or paid test generation are used. SQL fixtures execute against the actual database in rollback transactions, asserting immutable provider ID, terminal-state protection, owner isolation, write-once grades and unchanged learner-state hash. Chromium storage recovery runs in CI on the exact release tree.

Production latency and failure-rate improvement require subsequent real use; they were not measured by paid tests in this task.

Official API references: https://developers.openai.com/api/docs/guides/background ; https://developers.openai.com/api/docs/guides/reasoning ; https://developers.openai.com/api/docs/models/gpt-6-luna
