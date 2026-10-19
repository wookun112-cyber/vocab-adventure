# Durable grading repair — October 20, 2026

Production observations: grading_cache 551 identities, 523 finished, 23 started with no result, 5 never started.
Successful persisted grade latency: median 4.45s, p90 7.39s, p99 20.93s. Old OpenAI API signal aborted at 22s.
Supabase Oct19 save_learning_patch had thirteen HTTP 500 statement_timeout errors; cannot attribute all lost provider responses to this.
Vercel detailed logging HTTP403. English Path not present among connected Vercel/GitHub projects.

Fix: OpenAI Responses background mode plus durable provider response ID; free provider GET in status polling; original lease compare-and-set finish; no second paid POST after ambiguous work; increase model output token ceiling. No changes to existing scores or learner records.
Client: throttle repeated pending-state cloudSave from each 2s read-only poll to 30s, immediately save status transitions.
Prerequisite: run additive Supabase migration database/migrations/20261020_durable_grade_response.sql before merging this code.
Verify offline with node scripts/verify-all.mjs and web app build, then merge and confirm production version 12.16.42.
Historical orphan grades without provider response IDs remain preserved and ungraded. Live OpenAI/Vercel logs needed to confirm future reliability and exact failure classes.
Privacy: Responses store true enables provider-side background retrieval, so use appropriate retention/data controls for children's answers.
