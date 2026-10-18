# 12.16.40 — automatic recovery from missing grades and failed cloud saves

A provider-started request could expire without a stored result. The queue polled indefinitely until the learner explicitly held it. Home also kept a failed cloud save pending without retrying while the network stayed online.

The browser now checks the original grade through the existing cache/receipt path first. When the server certifies a missing result for that exact submission and it is at least 90 seconds old, the browser preserves the full original answer in `ungradedSubmissions`, excludes it from accuracy and level assessment, and releases its vocabulary for another practice. Each job requires its own fresh status check. A normal pending response, timeout, temporary outage, or quota error never certifies a lost result. A draft currently being written is left on screen. A saved final-cursor lesson resumes without requiring the manual hold button.

This does not recreate an absent historical AI judgment. Ayoung's pending 맨틀 submission is still stored, and the new resume path handles it without assigning a made-up score or submitting the same lost request to the provider again. Existing signed receipts and available cached results take priority. Original answers, times, levels and completed lessons are preserved.

Failed cloud saves retry after 15, 30, 60 and up to 120 seconds, including while idle on Home. Hidden/offline pages defer retries and retry on return/online. The existing single writer and account/auth-epoch checks remain in force. Authorization, validation and stale-state conflicts do not trigger automatic writes. Success clears backoff. Device checkpoints remain until cloud confirmation.

No schema, credential, provider-call or paid-retry policy changes. Round 25+up-to-5-minute timing, 10-second idle exclusion and existing vocabulary selection are unchanged.

Validation: `verify-automatic-recovery.mjs` exercises the production-patched browser code with simulated provider/storage failures, cache success, repeated ticks, multiple jobs, restart, drafts and an idle-home controlled clock. Existing regression and Chromium storage suites also run in CI. No paid model requests or child learning submissions are used in validation.
