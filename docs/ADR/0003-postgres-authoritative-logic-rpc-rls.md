# ADR-0003 — Postgres-authoritative logic: RPC writes, RLS reads

**Status:** Accepted

**Context.** Capacity must never be exceeded under concurrency; state transitions must be unambiguous; authorization must not depend on the client. Supabase exposes tables through PostgREST, so a table grant is an API.

**Decision.**
1. Core tables (events, participations, progression, safety, notifications…) have **no write grants or policies** for `anon`/`authenticated`. All writes go through `SECURITY DEFINER` RPCs in `public` that: verify `auth.uid()`, check account status/email verification, authorize by ownership/role, validate input and state, take the event-row lock where capacity is involved, write notifications in the same transaction, and raise stable error codes.
2. Reads use RLS policies plus read RPCs for masked or computed projections (`search_events`, `get_event`).
3. Every function sets `search_path = ''`, fully qualifies objects, revokes `PUBLIC`/`anon` execute, grants `authenticated` explicitly. Helper predicates live in `private` (not exposed).
4. Invariants are also expressed as constraints/triggers (defense in depth).
5. **`profiles.id` equals the auth user id but has no foreign key to `auth.users`.** This lets account deletion remove the auth user while retaining an anonymized tombstone profile for historical integrity, keeps `auth.uid() = profiles.id` in policies, and avoids cascade surprises. Referential health is checked by trigger + daily reconciliation.
6. Admin status = row in `platform_admins` (service-only writes), never JWT metadata.

**Consequences.**
+ One enforcement point, atomic multi-row changes, testable with real Postgres, no client trust.
− PL/pgSQL is verbose; migrations carry logic; need discipline (small functions, tests, conventions). Mitigated per ADR-0004 and TESTING.
− RPC signature changes need compatibility handling for installed mobile apps (DEPLOYMENT API policy).
− No FK from `profiles` to `auth.users` means the DB cannot itself prevent orphan profiles; covered by trigger + monitoring.
