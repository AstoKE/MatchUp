# CLAUDE.md — MatchUp engineering rules

Durable rules only. Details live in `docs/` (read the relevant doc before changing its area). Product: sports-event community app, Ankara/Turkey pilot, 18+, real users — treat it as production software.

## Where truth lives
- Scope/roles: `docs/PRD.md` · Schema, state machines, invariants, RPCs, RLS: `docs/DATABASE.md` · System/versions: `docs/ARCHITECTURE.md` · Scores/XP: `docs/RATING_SYSTEM.md` · Threats/privacy: `docs/SECURITY.md` · Plan/backlog: `docs/ROADMAP.md` · Decisions: `docs/ADR/`.
- **Visual identity: the founder's `design.md` wins** over `docs/UI_DESIGN_SYSTEM.md` (except accessibility minimums). Do not build final screens before it is reconciled.
- Changing a documented requirement, state machine, or invariant = update the doc and (if architectural) add an ADR **in the same change**. Never silently change product requirements.

## Workflow
- Small, testable increments; vertical slices; always leave the repo buildable (`pnpm check` green). One milestone at a time; don't start the next phase without explicit instruction.
- Before a major module: state objective, files, data-model changes, security impact, test plan, acceptance criteria. After a milestone report: implemented / tested / incomplete / limitations / risks / next step.
- Never claim something works unless it was actually run at the relevant level. Never fabricate test results; show real output. If tests can't run, say so.
- Ask before irreversible/outward-facing actions (publishing, deploying, destructive DB operations, store identifiers, region). Describe effects first for anything destructive.
- Commits only when asked. Never commit secrets or `.env*` (only `.env.example`).

## Architecture guardrails
- Modular monolith: Expo app (`apps/app`) + `packages/domain` + `packages/config` + `supabase/`. No new packages/services/dependencies without need; justify new dependencies and pin compatible versions (`npx expo install` for Expo-managed ones).
- **Authoritative logic is in Postgres**: writes via `SECURITY DEFINER` RPCs (`search_path = ''`, check `auth.uid()`, revoke from `anon`), reads via RLS. No client writes to core tables. Capacity changes lock the event row. Every new table: RLS + policies + tests in the same migration.
- Never trust the client for authorization, capacity, eligibility, scores, or roles. Admin = `platform_admins` row (+MFA), never JWT metadata. No service-role key or secret in client code.
- Lifecycle states are only `DRAFT/PUBLISHED/CANCELED/COMPLETED`; "full / closed / started / finalized" are derived — don't add states for them. Attendance is a separate field from participation status. Skill, reliability and XP stay independent.
- RPC/API changes must stay backward compatible for installed mobile apps (additive; version new functions). Migrations are forward-only; never edit an applied migration.
- Layering: routes thin → `features/*` (api/hooks/components/screens) → `ui`/`lib`/`@matchup/domain`. Supabase calls only in `features/*/api`. Cross-feature imports via `index.ts` only.
- Brand name/tagline/URLs/identifiers only from `packages/config` — no literals elsewhere; no brand in schema or domain logic.

## Code standards
- TypeScript `strict` (+ `noUncheckedIndexedAccess`), no `any` without a justified comment; validate external input with Zod at boundaries; parse RPC results.
- Errors: stable `DomainErrorCode`s, localized at the UI; never leak internals; no PII/tokens/free text/coordinates in logs, analytics, or notification payloads.
- UI copy: Turkish (default) + English via i18n resources — no hard-coded strings; code, identifiers, docs in English. `tr` locale for case transforms (İ/ı).
- Accessibility is a requirement: labels/roles, ≥44pt targets, focus order, contrast from tokens, reduced motion, dynamic text. Every list has loading/empty/error/offline states.
- Match surrounding style; keep comments sparse and about *why*. No mock data in production flows (dev seeds live in `supabase/seed/dev/` only). No speculative commercial features (payments, ads, bookings) in MVP.

## Testing (see docs/TESTING.md)
- Vitest: `packages/domain` + DB integration/concurrency (real Postgres, parallel connections). jest-expo + RNTL: components. Playwright (+axe): web E2E. pgTAP: schema/RLS.
- Each feature ships with its listed critical tests including negative authorization paths. Capacity must be proven under concurrency, not assumed.

## Privacy/safety defaults
- Privacy by default; location optional and transient; hide exact event location until approval when chosen; minimal data collection. Reporting, blocking, deletion and export are core features. Legal/KVKK items in `docs/SECURITY.md §8` need counsel — never claim compliance.

## Commands (available after Phase 1 M1)
`pnpm check` (typecheck+lint+format+unit) · `pnpm test:db` · `pnpm test:app` · `pnpm test:e2e` · `supabase start|stop|db reset|test db`
