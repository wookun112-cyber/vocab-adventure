# 12.16.37 — meaning-first vocabulary grading

October 18 saved history contains sentence-use answers penalized for failing to recite a definition, including an ordinary sentence about taking an antibiotic. Other answers were penalized for minor particle usage even though the target meaning was conveyed. Available nonempty recall records did not show an exact headword being graded wrong; that part of the user's report remains unconfirmed.

The existing single provider call now returns a structured meaning/target/completeness assessment. Correct target usage in a comprehensible sentence receives full vocabulary credit; form-only corrections are feedback. Incorrect meanings, missing targets, fragments and word-only responses remain distinct. Explicit examples prohibit demanding a definition, drug mechanism, or invented context. The server derives score/result/contextSuccess from the assessment and prevents contradictory partial-credit feedback when the derived result is full credit.

New submissions carry `meaning-first-20261018`, separating their grade cache identities from earlier judgments. Untagged saved jobs and signed receipts retain their original hash, avoiding duplicate paid requests. Exact local comparisons normalize NFC and invisible zero-width formatting; different words stay different.

Verified with mocked provider responses: structured schema, form-only credit, incorrect/missing/incomplete gates, word-only rejection, one call per submission, Unicode equivalence, cache isolation, legacy receipt identity and existing regression scripts. This does not prove all future model judgments are correct; no live provider quality claim is made. Historical scores were not bulk rewritten or inferred from keyword matching.

Work continues from current main b46b7fa, retaining optional same-day study and the newer login/recovery changes. An older unfinished local login patch was preserved separately and was not applied over current main.
