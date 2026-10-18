# Learning rounds 12.16.39

Each newly prepared round starts with five new words and at most ten review words. All targets require an independently correct sentence showing their use. Repeated questions are unlimited within the round's real study time.

- Before 25 minutes, error-free completion adds matched new vocabulary from the bundled bank. Once an error or assisted answer occurs, no additional new words are introduced; remaining targets and previously missed words receive practice.
- If all targets are resolved early after an error, reinforce learned words until 25 minutes. A later reinforcement error reopens that target.
- At 25 minutes, resolved rounds finish. Unresolved targets continue in the same round until resolved, at most 30 minutes. A 30-minute round closes with unresolved vocabulary retained, including for another round that day.
- Any completed/closed round unlocks another round. There is no per-day round cap. The main and quick study buttons both start or resume the current round.
- Input/touch renews a prospective ten-second activity window. Background, break, grading and question-download waits are excluded. Clock deadlines remain bounded even when timer callbacks are late.

Round numbers are scoped to a profile and bound to the immutable lesson ID. History, archived checkpoints and the current lesson are indexed chronologically; existing numbers never change. Duplicate summary rows with one lesson ID produce one round. Historical results and times are not divided into artificial 25-minute blocks. Reports show date totals alongside individual rounds. Legacy active lessons keep their original policy and are labeled accordingly; new rules apply to new rounds.

Completed history is checked before rewards and summaries are written, preventing duplicate completion after a stale final cursor. Unresolved words are not marked mastered. Outstanding grade payloads at a hard boundary are retained as needing review, excluded from accuracy and ability changes; typed unsubmitted text is retained separately.

Apply `database/round-learning.sql` and `database/round-registry-protection.sql` before serving this client. Full-round reserves retain the one-reserve-per-profile structure, capability/lease checks, authored-bank validation, review limits and current-level revalidation. Same-day carry requires a saved completed source round explicitly listing that unfinished target. Older clients may omit the numbering metadata but cannot renumber existing rounds.

Validation: full offline regressions; actual production-patched browser fixtures covering four same-day server packet starts, resume, error/reinforcement transitions, 25/28/30-minute boundaries, delayed timers, ten-second idle exclusion, pending grades, duplicate completion and historical totals. SQL rollback tests accepted a 5+10 round and reserve, accepted authorized same-day carry, rejected a missing completed source, retained the registry across omitted metadata and rejected renumbering. No live paid provider calls were made.
