# CLAUDE.md — MatchUp engineering rules

Durable rules only. Details live in `docs/` (read the relevant doc before changing its area). Product: sports-event community app, pilot across all of Turkey (81 provinces), 18+, real users — treat it as production software.

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
- Match surrounding style; keep comments sparse and about _why_. No mock data in production flows (dev seeds live in `supabase/seed/dev/` only). No speculative commercial features (payments, ads, bookings) in MVP.

## Testing (see docs/TESTING.md)

- Vitest: `packages/domain` + DB integration/concurrency (real Postgres, parallel connections). jest-expo + RNTL: components. Playwright (+axe): web E2E. pgTAP: schema/RLS.
- Each feature ships with its listed critical tests including negative authorization paths. Capacity must be proven under concurrency, not assumed.

## Privacy/safety defaults

- Privacy by default; location optional and transient; hide exact event location until approval when chosen; minimal data collection. Reporting, blocking, deletion and export are core features. Legal/KVKK items in `docs/SECURITY.md §8` need counsel — never claim compliance.

## Commands (see docs/DEVELOPMENT.md)

`pnpm check` (typecheck + lint + format + brand + script tests + unit/component) · `pnpm db:start|stop|reset|test|types` (Docker required) · `pnpm test:integration` · `pnpm test:e2e` (`REQUIRE_STACK=1` to fail instead of skip) · `pnpm env:local` · `pnpm check:bundle` / `check:bundle-size` after `export:web`.

- Gate on **real exit codes**, not on piped/grepped output. Write source files with the editor tools, not shell heredocs/`node -e` (quoting bugs cost real time). Never run formatters over the repo-root `settings.json` (the owner's local hook; it is in `.prettierignore`).
- **Commit only when the gates exit 0**: `pnpm check`, `pnpm db:test` and `pnpm test:integration` (and `pnpm test:e2e` when UI changed). Chain them with `&&`/exit-code checks; a piped or `;`-separated command can commit a red tree.
- Use **`zod/mini`**, never classic `zod` (ESLint blocks it): the unused locale/JSON-Schema modules are resolved to an empty module in `apps/app/metro.config.js`; re-check `node scripts/bundle-files.mjs zod` after zod upgrades. Bundle ratchets (total + initial) live in `scripts/check-bundle-size.mjs`; numbers and plan in `docs/PERFORMANCE.md`.
- Web controls must use `aria-checked` / `aria-expanded` (not only `accessibilityState`): React Native Web does not map them and axe fails.

## Native Android (Windows host, see docs/ANDROID_SETUP.md and docs/NATIVE_VALIDATION.md)

- The repo lives at `C:\dev\matchup` (not OneDrive). Native builds run in the pinned Linux container (ADR-0015, MAX_PATH makes Windows builds impossible); the app runs on the Windows emulator with JS from Metro.
- From PowerShell use `.\scripts\android\dev.ps1 up|down|validate`; plain `bash` there is WSL. **Never start Metro with `CI=1`** (no file watching → stale JS). After changing `metro.config.js` restart Metro with `--clear`.
- Device suite: `node scripts/android/native-validation.mjs --skip-install` (22 checks incl. database assertions). It takes ~8 minutes: run it in the background and do not edit app code while it runs (Metro hot-reloads the device).
- Say what is verified on the emulator and what is not (physical devices, iOS, real TalkBack use are not).

## State of the repo

Phases 0–6 are built and on hosted. Phase 7 (pilot readiness, docs/PHASE7_PLAN.md) runs M1–M7. Legal texts are **drafts**, and counsel review is deferred by the founder. Hosted public sign-up opens only through the ordered steps of docs/DEPLOYMENT.md §14 (ADR-0026: CAPTCHA plus new-account quotas, founder-accepted legal risk); the founder flips it, never Claude. GitHub is connected (`AstoKE/MatchUp`, private, free plan → **no branch protection**): work on a branch, open a PR, merge only with all four CI checks green, or, while the free Actions minutes are used up, with a green `pnpm ci:local --comment <PR>` on the PR's last commit (docs/GITHUB_SETUP.md §5b; founder, 2026-11-09). Hosted Supabase is connected (`wmgeugsqblwnhnqnczab`, Paris, ADR-0018). Push only migrations already on `main`, dry-run first, then run the advisor (docs/DEPLOYMENT.md §9); hosted pushes and reads are the founder's. Automated tests always use the local stack. The next phase starts only on explicit instruction.
