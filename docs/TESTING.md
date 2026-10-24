# Testing Strategy

Status: Phase 0 plan · Principle: a feature is not "working" until it has been tested at the level where the risk lives. Never report fabricated or assumed results.

Related: [SECURITY §11](SECURITY.md) · [DATABASE §7–8](DATABASE.md) · [ROADMAP](ROADMAP.md)

## 1. Layers

| Layer | What | Tooling | Runs |
|---|---|---|---|
| Unit (pure) | state-machine tables, validators/Zod schemas, level formula, skill/reliability/XP reference implementations, permission helpers, error mapping | Vitest | every commit |
| DB schema & RLS | RLS enabled, policies per role, grants, constraints, triggers | pgTAP (`supabase test db`) | PR + CI |
| DB integration | RPC behavior with real Postgres, JWT impersonation, **parallel connections** for concurrency | Vitest + `pg` against local Supabase | PR + CI |
| Component | forms, indicators, event card, states (loading/empty/error/offline), a11y roles/labels | jest-expo + RNTL | every commit |
| Web E2E | lifecycle flows + axe scans in a real browser against local stack | Playwright (+ `@axe-core/playwright`) | PR (smoke) / nightly (full) |
| Mobile E2E | smoke on dev build (sign-in, discover, join) | Maestro | pre-release, from Phase 3 |
| Load | scenarios in ARCHITECTURE §8 | k6 vs staging | before pilot; on major query changes |
| Manual | a11y with assistive tech, device matrix, usability | checklists (§6) | before pilot |

Decision record: ADR-0008 (two unit runners).

## 2. Critical-path test list (must exist before the related feature is "done")

### Unit
- Participation and event transition tables: every legal pair succeeds; every illegal pair rejected (exhaustive matrix generated from the table).
- Event validation: lead time, duration, capacity vs format bounds, skill range ordering, invite-only token rule.
- Level formula: boundary values (0, 99, 100, 299, 300, 4500), monotonic, inverse consistency.
- Skill v1: golden vectors (worked examples in RATING §3.4), properties (range, one-reviewer-no-effect, reciprocity decay, trimmed mean, **independence from attendance count**).
- Reliability v1: golden vectors (97.7 / 90.0 / 78.3 / 45.0 %), late-cancel window math, excused/neutral cases, event-cancel neutrality.
- XP rules: dedupe keys, daily/weekly caps in Istanbul calendar boundaries (UTC+3, midnight edge), idempotent re-run.
- Permission helpers and error-code mapping.

### DB integration (each also validates the relevant RLS)
- Registration creates profile/settings; onboarding atomic; consents versioned.
- Create event idempotency (`client_request_id`); publish lead time; edit rules; sport/format immutability after publish.
- Join: REQUESTED vs WAITLISTED by capacity; duplicate; request cap (3); blocked; unverified; closed registration; invite-only.
- Approve/reject/waitlist/remove: organizer-only; cross-event rejection; idempotency; notifications created exactly once.
- **Capacity concurrency (mandatory, runs in CI):**
  1. 1 slot left, 20 pending requests, 20 parallel approvals → exactly 1 `APPROVED`, 19 `EVENT_FULL`, `approved_count = capacity`.
  2. Parallel `cancel` + `approve` interleavings → counter always equals `COUNT(APPROVED)`.
  3. Parallel capacity decrease vs approve → never below approved count.
  4. Re-run of each scenario 50× (flake detection) and with random delays.
  5. Consistency query (`approved_count` vs actual count; `> capacity`) returns zero rows after every integration test run.
- Cancellation: excused vs late computation; slot reopened → organizer notification; no auto-promotion.
- Event cancel: all active users notified once; no participant penalty after finalization logic runs.
- Attendance: marking window; ABSENT→DISPUTED path; auto-finalize; NOT_CONFIRMED neutral; organizer-row default.
- Reviews: full eligibility matrix (S-8); window; double-blind visibility; duplicate; blocked pair.
- Finalization idempotency (S-9); XP ledger immutability and UQ; compensating rows after dispute.
- SQL vs TS reference equivalence on randomized fixtures (skill, reliability, XP, level).
- Deletion: anonymization leaves no PII (automated scan over all tables for the user's email/name/ids); history integrity preserved.

### Security (SECURITY §11, S-1…S-20) are part of the same suites and CI gates.

### Component
`EventCard`, `CapacityIndicator` (text alternative), `SkillIndicator`/`ReliabilityIndicator` (confidence/“Yeni oyuncu” states), forms (validation messages in tr), join sheet (disclosure shown), list states, error-code → message mapping, i18n plural/date formatting for `tr`.

### Web E2E (Playwright)
- Lifecycle: organizer creates → player requests → organizer approves (last slot) → second player lands on waitlist → approved player cancels → organizer promotes → event completes → attendance marked → finalized → reviews submitted → XP/badge visible.
- Auth: sign-up, verify (local inbucket), sign-in/out, reset.
- Authorization UI: non-organizer cannot see manage console; direct URL access shows not-found/forbidden.
- Responsive: nav at 375/768/1280 px; keyboard-only completion of join flow.
- axe scan on each key page: zero serious/critical violations.

## 3. Test data and environments

- Builders in `packages/domain/testing` (users, events, participations) and SQL helper functions for DB tests; deterministic seeds, fixed clocks (inject `now`; SQL functions take `p_now` only in test-only wrappers or use a `private.now()` indirection overridable in tests).
- Local stack per developer and in CI; each test file uses isolated schemas/transactions or unique ids; never run against staging/production.
- Dev fixtures (fake users/events) live in `supabase/seed/dev/` and are excluded from production deploys.

## 4. CI gates

PR must pass: typecheck (all packages) · ESLint · Prettier check · Vitest (unit + DB integration) · pgTAP · jest-expo · Playwright smoke · dependency audit (no critical/high with fix available) · secret scan · "every public table has RLS" check · Supabase types drift check. Nightly: full Playwright, concurrency soak (×200), license check. Coverage: `packages/domain` ≥ 90 % lines/branches; SQL coverage is tracked by the checklist above rather than a percentage.

## 5. Performance verification

Query-plan assertions (`EXPLAIN` snapshots, no seq scans on large tables) for `search_events`, `list_my_events`, organizer queues; k6 scenarios per ARCHITECTURE §8 with results archived under `docs/perf/` (numbers only after being measured).

## 6. Accessibility verification

Automated: axe in Playwright; RNTL queries by role/label; token contrast test. **Manual checklist before pilot** (record results in `docs/a11y/`):
- VoiceOver (iOS) and TalkBack (Android): sign-up, onboarding, discover, join, create event, manage requests, review.
- NVDA/Chrome + keyboard-only: same flows on web; focus order and visible focus; dialogs.
- 200 % browser zoom / large OS text: no clipped content or overlapping controls.
- Reduced motion and high-contrast OS modes.
- Color-blind simulation on capacity/status indicators.
- Screen-reader reading of Turkish text (pronunciation, dotted/dotless i).

## 7. Release criteria

All CI gates green on the release commit; manual a11y checklist complete; load results meet budgets or have signed-off waivers; security advisor clean; no open critical/high defects; known limitations list updated in release notes.

## 8. Phase 1 status (what actually exists and passes — 2026-10-24)

| Layer | Count | Notes |
|---|---|---|
| Unit — `packages/domain` / `packages/config` (Vitest) | 24 / 4 | coverage gates 90/85/90 enforced; domain ≈ 93.5 % stmts, 100 % lines |
| Component/unit — app (Jest 30 + RNTL 14) | 189 | tokens contrast (38 pairs), UI components, i18n parity, auth screens, storage, observability, guards |
| Repo scripts (node:test) | 6 | secret scanner |
| pgTAP | 48 | structure (10) + behaviour (38); mutation-verified |
| Integration (real stack) | 43 | Data API exposure 22, auth flows 10, health function 4, **concurrency harness 7** |
| Web E2E (Playwright + axe) | 28 | Chromium only |

Not yet present: Maestro/mobile E2E, domain/event test builders (no entities yet), the capacity/concurrency tests of §2 (the **harness** and its proof exist: `packages/db-tests/src/concurrency*.ts`), manual accessibility pass (§6), load tests. The two-runner decision (ADR-0008) is in effect, with Jest 30 rather than 29.

Lessons that changed the test design: RNTL role queries only match *accessible* elements; `getByLabel` needs `exact` when a button label contains the field label; Playwright + axe needs a fresh browser context; always gate scripts on real exit codes, never on piped output.
