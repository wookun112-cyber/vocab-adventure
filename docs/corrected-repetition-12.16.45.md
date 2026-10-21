# Corrected-word repetition — 12.16.45

Production learner records showed repeated unassisted full-credit answers for 냉각, 문맥, 감동하다 and 까다롭다. appendRoundReinforcement built its candidate list from every historical error in the round. A later success never removed the word from that candidate list, and the generic sentence-use fallback could repeat the identical writing instruction.

For current breadth rounds, use roundUnfinished as the correction source. Exclude pending grades and already queued words. Once a target is resolved, do not select it again in that round. Before the 25-minute minimum, use another previously learned word in the current level range that has not been attempted or scheduled in the round; add it to the tracked base targets so a real error is still corrected. No new-word quota, grade, mastery, or timing policy is changed. Existing legacy rounds retain their original contract.

Also skip saved future reinforcement questions whose word was resolved after they were queued. Add an excluded checkpoint entry rather than changing any original answer or awarding credit. Deferred grading delivery and explicitly preserved current questions retain their recovery protections.

Regression coverage executes production-patched browser logic: error followed by full correct response, rotation to another known word, unresolved correction with a different task type, no duplicate answer request during grading, stale saved reinforcement skip, unchanged submitted answers and no network/provider call. Existing breadth/round timing, reading and mastery tests remain enabled.
