# Missing remediation bridge on resume

A saved active lesson had cursor 25 / target 35, 34 ready items, and no item 25. Its current plan required mc_usage after failed sentence writing, but the saved practice pool contained only a sentence template for that word. History exclusion could exhaust every approved multiple-choice variant. The local-only pump could neither create nor retrieve a replacement, leaving resume blocked.

Future bundles prefer fresh passages and retain one approved MC fallback when exhausted. Existing adopted lessons with a missing sentence-cycle MC retrieve a canonical approved bank question through an authenticated, read-only endpoint. The endpoint does not generate questions, invoke grading, change results, or write learner data. Concurrent pumps share a repair; successful repair checkpoints through the existing lesson mechanism. Failure remains explicit and retryable. Account/profile switches and cancelled preparations discard stale responses.

Regression coverage includes exhausted history, unchanged learner data, rejected altered definitions, legacy sentence-only pools, concurrent repair requests, and preserved ready prefixes. Existing 48-retry and restart checks remain in place. Vercel runtime logs were unavailable to the connector (403); the root cause was confirmed from saved lesson structure and code, then reproduced in the actual app pump test.
