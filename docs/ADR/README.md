# Architecture Decision Records

Format: Context · Decision · Consequences · Status. One decision per file, immutable once **Accepted** (supersede with a new ADR). Status values: **Proposed** (needs founder confirmation), **Accepted**, **Superseded**.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith-on-supabase.md) | Modular monolith on Supabase | Accepted |
| [0002](0002-expo-web-instead-of-nextjs.md) | Expo Web SPA instead of a Next.js app | Accepted (revisit trigger defined) |
| [0003](0003-postgres-authoritative-logic-rpc-rls.md) | Postgres-authoritative logic: RPC writes, RLS reads, profile id without auth FK | Accepted |
| [0004](0004-rating-computation-in-sql-with-ts-reference.md) | Rating/reliability/XP computed in SQL with a TypeScript reference spec | Accepted |
| [0005](0005-in-app-notifications-first-outbox.md) | In-app notifications first, transactional outbox | Accepted |
| [0006](0006-admin-console-in-app.md) | Admin console as a web-only route group in the main app | Accepted |
| [0007](0007-monorepo-and-sharing-domain-code.md) | Monorepo layout and sharing `domain` code | Accepted |
| [0008](0008-two-unit-test-runners.md) | Vitest for pure/DB tests, Jest for React Native | Accepted |
| [0009](0009-expo-sdk-and-toolchain-versions.md) | Expo SDK 58 baseline with SDK 57 fallback; TS 6, ESLint 9 | Accepted (D-01) |
| [0010](0010-identifiers-and-branding.md) | Store identifiers and temporary branding | Accepted (D-05, temporary ids) |
| [0011](0011-location-data-and-map-providers.md) | Location data, tiles and geocoding | Accepted (provider choice deferred to Phase 4) |
| [0012](0012-participation-and-attendance-model.md) | Single participation table with independent attendance field | Accepted |
| [0013](0013-guest-discovery.md) | Guest (unauthenticated) event discovery | Accepted (D-09) |
| [0014](0014-auth-sessions-and-enumeration-posture.md) | Auth sessions, email links and account-enumeration posture | Accepted |
| [0015](0015-native-android-build-in-container.md) | Build Android in a pinned Linux container; run on the emulator | Accepted |
