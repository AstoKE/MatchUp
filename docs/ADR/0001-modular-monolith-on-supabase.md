# ADR-0001 — Modular monolith on Supabase

**Status:** Accepted

**Context.** Solo developer with AI assistance, real-product ambitions, need for auth, relational integrity, geospatial queries, realtime and file storage without operating infrastructure. Premature microservices would multiply operational and cognitive load.

**Decision.** One deployable backend: a Supabase project (Auth, PostgreSQL + PostGIS, Realtime, Storage, Edge Functions). One client codebase. Internal modular boundaries (identity, catalog, geo, events, progression, notifications, safety, ops) enforced by naming, ownership of tables, and import rules — not by network boundaries.

**Consequences.**
+ Minimal ops, strong consistency, simple local dev (Supabase CLI).
+ Standard Postgres keeps an exit path (self-hosting or another managed Postgres) — keep logic in portable SQL, avoid proprietary features where an equivalent exists.
− Platform coupling (Auth, Realtime, PostgREST behavior, limits); mitigate by wrapping Supabase usage in `features/*/api` and `lib/`.
− All modules share one database; noisy-neighbor risk handled by indexing, timeouts and later read replicas if needed.
Revisit when: sustained load exceeds a single instance plan, or a module (e.g. payments) needs isolated compliance scope.
