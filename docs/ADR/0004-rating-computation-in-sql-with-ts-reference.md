# ADR-0004 — Rating, reliability and XP computed in SQL with a TypeScript reference spec

**Status:** Accepted

**Context.** Scores must be computed atomically with attendance finalization and review-window closing, deduplicated, versioned and explainable. The math (Bayesian averages, decay, caps) is easier to read and test in TypeScript, but computing in Edge Functions would split one logical operation across non-transactional calls and require privileged write paths from outside the DB.

**Decision.** The authoritative implementation is SQL/PL-pgSQL executed inside the finalization/window-close transactions. `packages/domain` contains a pure TypeScript reference implementation and constants (single source: the constants module generates a `rating_config` seed so SQL and TS cannot drift). Golden vectors and randomized-fixture tests assert SQL output equals the TS reference. Level is derived at read time in TS from `xp_total` (never stored as truth).

**Consequences.**
+ Atomic, idempotent, no privileged client path, easy replay (raw reviews/reliability events are kept; derived snapshots can be recomputed under a new `algorithm_version`).
+ TS reference doubles as executable documentation and powers UI explanations ("how this score works").
− Two implementations to keep aligned (mitigated by generated config + equivalence tests in CI).
− Algorithm changes require migrations and recompute jobs.
Fallback: if SQL complexity proves unmanageable, move computation to a single Edge Function invoked by pg_cron that writes through one audited RPC; the TS reference makes this a contained change.
