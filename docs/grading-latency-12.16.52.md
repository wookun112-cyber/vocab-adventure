# Grading dispatch reliability

Confirmed production evidence on 2026-10-23: dispatch timeouts, assignment-not-yet-saved responses, and a start reservation committed about 2.5 seconds before its timeout diagnostic. Recent submissions also spent 5–10 seconds before provider dispatch. Provider/result-retrieval time remains a separate source of latency.

Changes:

- Newly submitted tasks include the existing lesson UUID and zero-based problem slot as `assignmentId`. This metadata is excluded from the existing grade hash, preserving prior results, provider receipts and idempotency.
- The existing assignment RPC targets that saved lesson and ready entry, then verifies its canonical task fields and approved question. Old payloads retain the unchanged legacy path. No registry table, save trigger or additional privilege grants are introduced.
- The deployed frontend waits for a successful server save before a new grade request. Failed saves preserve the raw answer and do not invoke the grader. Polling and already-received results bypass this dependency. Account/session switches discard stale submissions.
- The start RPC gets an 8-second acknowledgement window. A transport timeout reads the existing status and confirms the exact reserved lease before invoking the provider. It does not re-reserve, restart or re-bill an already created provider response.
- RPC operation/duration/error logs contain no answers or tokens.

Verification: actual patched frontend submission ordering; lost-start-acknowledgement and cache/restart/provider checkpoint/result-save regression tests; SQL rollback tests using a saved canonical task, rejected changed meaning/lesson/anonymous/other owner, unchanged app_state hash. Full CI and browser suite are required for release.

Scope limits: this reduces dispatch/search/save races, not all AI computation time. Vercel runtime log access returned 403, so five historical dispatch failures cannot each be assigned to an exact RPC from the existing coarse diagnostic alone. The new per-RPC timings address this gap.

A broader registry-table/save-trigger migration was rejected by automatic approval review without a detailed reason. The smaller existing-function change above was chosen instead.
