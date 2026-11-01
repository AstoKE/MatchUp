# Roadmap

Status: Phase 0 · Source of scope: [PRD](PRD.md) · Priorities: **P0** launch-blocking · **P1** launch-critical, may slip one iteration · **P2** first post-MVP · **P3** later · Complexity: S (≤ 2 d) · M (≤ 1 wk) · L (1–2 wk) · XL (> 2 wk) for a solo developer working with Claude Code (rough, for ordering not scheduling).

> **Status 2026-11-01: Phases 0–3 and 5 are built** (Phase 5: Maestro smoke of its screens not done); the redesign of `docs/design.md` is in progress; Phase 4 was skipped for now and Phase 6 has not started.
>
> **Status 2026-10-29: Phases 0–3 are built** ([PHASE3_REPORT](PHASE3_REPORT.md): web verified, device validation of Phase 3 pending); Phase 4 has not started.
>
> **Status 2026-10-24: Phase 0 and Phase 1 are complete** ([PHASE1_REPORT](PHASE1_REPORT.md)). Recommended Phase 2 milestones (including a native-device validation spike first) are in PHASE1_REPORT §7. The Phase 1 plan below is retained as written; deviations are listed in PHASE1_REPORT §6.

## 1. Phases

| Phase | Name | Exit deliverable |
|---|---|---|
| 0 | Product & architecture | Reviewed blueprint (this docs set) |
| 1 | Foundation | Secure, tested, buildable skeleton: auth, nav shell, Supabase local stack, CI |
| 2 | User identity | Users register, onboard, configure profile/privacy |
| 3 | Event engine | Users organize and join events end-to-end (list-based, no map) |
| 4 | Location & venues | Map/geo discovery, venue directory, booking-status labels |
| 5 | Player progression | Attendance → reviews → skill/reliability/XP/badges |
| 6 | Trust, notifications, admin | Reporting, blocking, moderation, full notifications, deletion/export |
| 7 | Hardening & pilot | Perf, security, a11y, load, ops → Ankara pilot release candidate |
| Later | Push (P-01), community, recurring, QR, partners, payments … | per demand |

Sequencing note: basic in-app notifications arrive with Phase 3 (the event engine is unusable without them); Phase 6 completes the catalogue. Account deletion/export were planned for Phase 6 but were built in Phase 2 at the founder's request (ADR-0017); every later phase that adds per-user data must extend export and purge (enforced by a pgTAP inventory test).

## 2. Principles for scope control

1. Vertical slices: each phase ends with something usable end-to-end and tested.
2. Nothing post-MVP lands before the Phase 7 exit unless it removes a launch blocker.
3. A feature is "done" only when its acceptance criteria pass in automated tests at the right level (CLAUDE.md rules 6–7).

## 3. Prioritized backlog

Dependencies refer to feature IDs. "AC" = acceptance criteria (abbreviated; expanded in the implementing PR/plan). All ACs additionally require: strict TS clean, lint clean, tests listed in TESTING, `tr` strings externalized, negative-path authorization tests where relevant.

### 3.1 MVP

| ID | Feature | Pri | Depends | Cx | Key risks | Acceptance criteria | Ph |
|---|---|---|---|---|---|---|---|
| F-01 | Repo, tooling, CI (TS strict, lint, format, hooks, test runners, CI pipeline) | P0 | — | M | New Expo SDK tooling friction (R-3) | Fresh clone → `pnpm i && pnpm check` passes; CI runs typecheck/lint/unit/RN/DB tests | 1 |
| F-02 | Config, env validation, branding module, i18n bootstrap | P0 | F-01 | S | Hard-coded brand strings | Missing env fails startup with clear error; no brand literal outside `packages/config` (CI grep); tr/en switch works | 1 |
| F-03 | Design tokens, theme, base components, a11y baseline | P0 | F-01, design.md | L | design.md late/contrast conflicts | Tokens light/dark; contrast test passes; Button/Text/TextField have role/name/focus tests | 1 (+2–3 growth) |
| F-04 | Navigation shell + responsive web nav + auth guard | P0 | F-03 | M | Expo Router web quirks | Guests can open public routes (Discover, event detail); protected routes (My Events, Create, Profile, actions) redirect to sign-in and return afterward; data-driven nav config (Community addable); 4 tabs + Create on mobile; rail/side-nav ≥ 768/1200; deep link opens event route; 404 route | 1 |
| F-05 | Supabase local stack, migrations, RLS baseline, type-gen, CI DB job | P0 | F-01 | M | Docker on Windows; RLS mistakes | `supabase start` + migrations apply clean; RLS-enabled check passes; pgTAP RLS tests green; types in sync | 1 |
| F-06 | Auth: register, login, logout, verify email, reset password, secure session | P0 | F-04, F-05 | M | Email deliverability (R-8); session storage per platform | All flows work on web + Android; unverified user blocked from create/join (server-side test); session survives restart; enumeration-safe messages | 1–2 |
| F-07 | Onboarding (age/terms/consents, city, sports, levels) | P0 | F-06, F-10 | M | Legal copy; abandonment | `complete_onboarding` atomic; resumable; consents versioned in DB; location permission never requested | 2 |
| F-08 | Profile, settings, privacy (visibility, reliability/badge display, language, theme) | P0 | F-07 | M | Visibility leaks | Visibility settings enforced by RLS tests; edit validates server-side; avatar upload policy tests | 2 |
| F-09 | Sport profiles (self-assessed level, positions) | P0 | F-10 | S | — | CRUD per sport with level 1–5 anchors; position must belong to sport (DB-enforced) | 2 |
| F-10 | Sports catalog (sports/formats/positions) seed + read | P0 | F-05 | S | Wrong format bounds | 10 sports seeded idempotently; add-a-sport-by-seed demo test; all UI reads catalog (no hard-coded sport) | 2 |
| F-11 | Event create/edit/publish/draft (organizer ownership) | P0 | F-10, F-06 | L | Validation drift client/server; quotas | All required fields validated server-side; lead-time rule; idempotent create; edit rules per DATABASE §6.1; non-owner cannot edit (S-1) | 3 |
| F-12 | Event discovery list + filters + pagination | P0 | F-11 | M | Query perf; Turkish text normalization | Filters: sport, date, time-of-day, format, skill, open slots, district; keyset pagination; p95 target met on seeded 100k rows; empty/error states | 3 (geo 4) |
| F-13 | Event detail | P0 | F-11 | M | Information leakage | Shows slots, rules, booking-status label; hides participants/private details from non-approved; invite-only token flow | 3 |
| F-14 | Join request, withdraw, cancel participation | P0 | F-13 | M | Spam; re-request abuse | Transitions per DATABASE §6.2 only; duplicates impossible (UQ); request cap; late-cancel warning | 3 |
| F-15 | Organizer approve/reject/waitlist/remove | P0 | F-14 | M | Authorization holes | Only organizer can; cross-event attempt rejected (S-3); idempotent | 3 |
| F-16 | Capacity enforcement + waitlist | P0 | F-15 | L | Race conditions (core) | **Concurrency test:** N parallel approvals for last slot → exactly 1 success, `approved_count ≤ capacity`; FIFO waitlist; no auto-promotion | 3 |
| F-17 | Event cancel (and complete) | P0 | F-11 | S | Cascading notifications | Cancel before start only; all active users notified; no reliability effect (verified in Phase 5 tests) | 3 |
| F-18 | My Events dashboard | P0 | F-14 | M | N+1 queries | 5 buckets correct for seeded matrix of states; single RPC per tab; pending counts for organizers | 3 |
| F-19 | In-app notifications (basic Ph3 → full Ph6) | P0 | F-14 | M | Missed notifications; PII in payloads | Row created transactionally with action; inbox + unread badge + mark read; realtime or poll; payload has ids only | 3, 6 |
| F-20 | Manual location: district + label + pin; approved-only visibility | P0 | F-11 | M | Precise-location privacy | Pin required; hidden-location events show district + snapped pin to non-approved users (test) | 3 |
| F-21 | Venue directory + booking-status labels + venue submission | P1 | F-20 | L | Data licensing/provenance (R-7); spam | Provenance and verification separate; labels never imply booking; community venue appears as "unverified"; admin verify/hide | 4 |
| F-22 | Map view + geo filters (radius/bbox) | P1 | F-12, F-20 | L | Tile cost/policy; dev builds | Radius filter via PostGIS; map⇄list toggle; attribution visible; p95 target; works on web + Android | 4 |
| F-23 | Attendance: mark, complete, finalize, dispute | P0 | F-16 | L | Organizer neglect/collusion (R-5) | State machine per DATABASE §6.3; auto-finalize cron; neutral on not-confirmed; dispute resolved by admin | 5 |
| F-24 | Post-event reviews (double-blind) | P0 | F-23 | M | Manipulation (R-6) | Eligibility matrix tests (S-8); window enforced; duplicates blocked; invisible to reviewee | 5 |
| F-25 | Rating engine: skill, reliability, XP ledger, level | P0 | F-24 | XL | Algorithm bugs; SQL/TS drift | Golden-vector + randomized SQL≡TS tests; independence tests (RATING §7); idempotent finalization (S-9) | 5 |
| F-26 | Achievements (7 badges) | P1 | F-25 | M | Rule edge cases | Each rule has positive/negative fixtures; awards idempotent | 5 |
| F-27 | Report + block | P0 | F-13 | M | Abuse of reports | Report from 4 surfaces; blocked pairs invisible and cannot request/review (S-12) | 6 |
| F-28 | Admin/moderation console (reports, users, events, venues, disputes, audit) | P0 | F-27, F-23 | L | Admin security; scope creep | MFA required (S-14); every action audit-logged; queue to resolution in ≤ 3 clicks | 6 |
| F-29 | Account deletion + data export | P0 | F-08 | L | Anonymization correctness; legal | Grace + cancel works; post-purge no PII in any table (automated scan); export complete | **2** (moved from 6 by the founder 2026-10-25, ADR-0017; event effects follow in 3) |
| F-30 | Abuse controls: rate limits, CAPTCHA, new-account limits | P0 | F-06, F-11 | M | False positives | Quotas enforced server-side (S-16); CAPTCHA on sign-up/reset | 3, 6 |
| F-31 | Analytics + error tracking + health checks | P1 | F-05 | M | PII leakage | Event allowlist enforced; Sentry scrubber test; health endpoint monitored | 1 (Sentry), 3 (server-side events with first RPCs), 7 (client `track_event`, dashboards) |
| F-32 | Turkish localization complete + English parity | P0 | all UI | M | Missed strings; İ/ı bugs | No hard-coded strings (lint); TR screens reviewed by a native speaker; plural/date tests | cross |
| F-33 | Accessibility pass | P0 | all UI | M | Late discovery | axe: 0 serious/critical on key pages; manual VO/TalkBack/keyboard checklist signed | 7 (continuous) |
| F-34 | Hardening: perf, security review, load tests, backups, monitoring, release checklist | P0 | all | L | Findings late | DEPLOYMENT checklist 100 %; load scenarios (ARCH §8) meet budgets or have signed-off waivers; zero critical security findings | 7 |
| F-35 | E2E: Playwright lifecycle (+ Maestro smoke) | P0 | F-18, F-23 | M | Flakiness | Create → request → approve → full → cancel → waitlist → complete → review, green in CI | 3–7 |

### 3.2 Post-MVP (ordered)

| ID | Feature | Pri | Notes |
|---|---|---|---|
| P-01 | Push notifications (Expo push + device tokens + preferences) | P2 (first) | Needs Apple/Google credentials; addresses R-8 |
| P-02 | QR / geo check-in for attendance | P2 | Strengthens trust root (R-5) |
| P-03 | Event chat / participant messaging | P2 | Moderation load; replaces WhatsApp links |
| P-04 | Teams, friends, invitations (Community tab) | P2 | New tables per DATABASE §4 |
| P-05 | Recurring events | P2 | `event_series` |
| P-06 | Recommendations ("players like you", events) | P3 | needs data volume |
| P-07 | Organizations, partner verification, partner events | P3 | enables `event_type = PARTNER` |
| P-08 | Venue operator tools, availability, booking requests | P3 | |
| P-09 | Payments (provider abstraction, refunds, payouts) | P3 | regulatory review |
| P-10 | Sponsored placements (labelled) | P3 | |
| P-11 | Tournaments | P3 | |
| P-12 | Enforced per-position slots | P3 | |
| P-13 | Additional cities | P2 | data seeding + moderation capacity |
| P-14 | Avatars: own photo or a sport-themed design (founder's idea, 2026-11-01) | P2 | The default is the initials shown today. In-house designs per sport are the low-risk part, with no moderation or legal load. A photo is user content: it needs upload rules, moderation and reporting (F-27, F-28), counsel on KVKK, and must be in export and deletion (ADR-0017). `profiles.avatar_path` already exists and is handled by export and purge; verify before building. |

## 4. Ten highest-risk decisions and risks

Likelihood/impact: H/M/L. "Owner decision" = needs the founder's explicit call (see PHASE0_REVIEW §4).

| # | Risk / decision | L | I | Why it matters | Mitigation / plan |
|---|---|---|---|---|---|
| R-1 | **Marketplace liquidity in Ankara** — no games ⇒ no users ⇒ no games | H | H | Product value requires density; MVP quality is irrelevant without supply | Seed with real organizers (existing WhatsApp groups) pre-launch; start with 2–3 sports and 3–4 districts; measure fill rate; "Be the first organizer" empty states; founder-led community ops |
| R-2 | **Legal/compliance & safety**: KVKK basis for scoring/profiling, cross-border transfer (Frankfurt), UGC liability (5651), injury/meeting-strangers risk, 18+ self-declaration | M | H | Launch blocker and personal liability | Lawyer review of SECURITY §8 list before pilot; conservative ToS; reporting/blocking/approved-only locations; safety tips; incident process |
| R-3 | **Expo SDK 58 / toolchain maturity** (new Expo Go not yet released, TS 7/ESLint 10 churn, pnpm+Metro) | M | M | Stalls Phase 1 or forces mid-project upgrade | M0 compatibility spike with SDK 57 fallback; pin versions; dev builds from the start; don't adopt TS 7/ESLint 10 yet |
| R-4 | **SQL-centric logic + Supabase coupling**: bugs in RPC/RLS = security/integrity failures; PL/pgSQL maintainability for solo dev; platform limits (Realtime, PostgREST) | M | H | Core of capacity, auth, scoring | Small functions, conventions, pgTAP + multi-connection tests as merge gates, TS reference specs, security advisor in CI; plain Postgres keeps an exit path (self-host) |
| R-5 | **Attendance integrity** (organizer-attested trust root; collusion; neglect) | H | M | Poisons XP, reliability, trust | Caps, distinct-participant rules, disputes, moderation flags, reminders; QR/geo (P-02) after pilot data |
| R-6 | **Rating fairness & gaming; perceived unfairness of reliability** | M | M | Churn if scores feel arbitrary or hurtful | Conservative priors, confidence labels, double-blind, transparency screens ("how this score works"), tuning after pilot, appeal via dispute |
| R-7 | **Map/venue data licensing and cost** (OSM tile/geocoding policies, ODbL share-alike, Google ToS) | M | M | Hidden cost or takedown | No public OSM tiles in prod; commercial or self-hosted tiles; no geocoding in MVP; OSM imports isolated by provenance; legal check |
| R-8 | **Notification reach**: in-app-only means organizers miss requests; auth email deliverability (custom SMTP required) | H | M | Slows approvals ⇒ abandonment | Push as P-01 right after MVP; email digest option; SMTP + SPF/DKIM/DMARC before pilot; measure time-to-decision |
| R-9 | **Solo-developer scope and moderation operations** (35 MVP features; reports need a human, SLA) | H | H | Schedule slip; unsafe platform | Strict phase gating; P1 items cuttable (F-21/22/26/31); admin tooling minimal but real; define who answers reports and when before launch |
| R-10 | **Identity/brand lock-in** — temporary name; bundle IDs, package names, domains, store listings are hard to change; trademark conflicts | M | M | Forced re-listing or user loss | Decide domain + reverse-DNS identifier *before* Phase 1 M0 creates the app (ADR-0010); trademark search; central branding config |

Honorable mentions tracked in the backlog: Turkish text-normalization bugs (İ/ı), Supabase region latency (Frankfurt ≈ 50–70 ms from Ankara — measure), Apple/Google review rejection (UGC/deletion rules satisfied by design), cost growth of Realtime.

## 5. Phase 1 implementation plan (Foundation)

Goal: a secure, buildable, tested skeleton. **Phase 1 does not start until you approve and answer the open decisions D-01…D-05 (PHASE0_REVIEW §4).** Each milestone is small, ends green (`pnpm check`), and is reported per CLAUDE.md rule 12.

| M | Milestone | Scope | Tests / acceptance | Security notes |
|---|---|---|---|---|
| **M0** | Compatibility spike + decisions locked | Create workspace in a scratch branch; `create-expo-app` on SDK 58 (and 57 for comparison if 58 fails); verify: `expo-doctor`, web export (`single`), Android dev build or emulator run, `jest-expo` + RNTL 14 smoke, pnpm isolated vs `hoisted`; Docker + `supabase start` on this Windows machine; decide SDK 58 vs 57, pnpm layout | A 1-page spike report (ADR-0009 updated); all five checks pass or fallback chosen | Check install scripts of new deps |
| **M1** | Repo skeleton + tooling | pnpm workspace (`apps/app`, `packages/domain`, `packages/config`), `tsconfig.base.json` (strict), ESLint flat config (+ import boundaries, no-hardcoded-strings), Prettier, husky + lint-staged, `.nvmrc`, scripts (`check`, `test`, `typecheck`, `lint`), GitHub Actions CI (typecheck, lint, unit), Dependabot/Renovate config | `pnpm check` green locally and in CI; boundary violation fixture fails lint | Secret scanning (gitleaks) in CI; lockfile committed |
| **M2** | Config, branding, env, i18n | `packages/config` brand module; `lib/env.ts` Zod-validated `EXPO_PUBLIC_*`; `.env.example`; i18next with `tr` default/`en`; sample strings; CI grep for brand literals | Vitest: env validation cases; RNTL: language switch; build fails on missing env | Only public vars in client; documented |
| **M3** | Design tokens + base UI | Reconcile `design.md` → tokens (light/dark), `ThemeProvider`, `Text`, `Button`, `TextField`, `Screen`, `Skeleton`, `Toast`; dev-only component gallery route | Contrast unit test over tokens; RNTL role/label/disabled/loading tests; axe on gallery (web) | — |
| **M4** | Navigation shell | Expo Router groups, tab bar + Create action, responsive rail/side nav, auth guard (stubbed session), 404/error boundary, deep-link scheme | RNTL navigation tests; Playwright: guest can open public routes, protected-route redirect + return, nav at 3 widths, keyboard nav | No client-trusted role logic |
| **M5** | Supabase foundation | `supabase init`, `config.toml` (auth settings: email confirm on, leaked-password protection on, JWT expiry), migration `0001` (extensions in `extensions` schema, `private` schema, helpers, `profiles`, `user_settings`, `user_consents`, `platform_admins`, `handle_new_user`, RLS + policies), seed skeleton, type generation, CI job running local stack + pgTAP | pgTAP: RLS enabled everywhere; user reads/writes only own rows; cannot write `platform_admins`; trigger creates profile; DB-level checks S-6, S-19 | Policies reviewed line by line; `SECURITY DEFINER` + `search_path` lint |
| **M6** | Auth foundation | Typed Supabase client with platform storage adapter (encrypted native, default web), `SessionProvider`, TanStack Query provider, minimal sign-up/sign-in/sign-out/forgot-password/verify screens (functional, token-styled), error mapping to `DomainErrorCode` | Integration: register → profile row exists; unverified blocked from a probe RPC (S-11); RNTL form validation; Playwright: sign-up→sign-in→sign-out against local stack (inbucket for email) | Enumeration-safe errors; no tokens in logs |
| **M7** | Observability baseline | Sentry init (client) with scrubbing, structured logger, error boundary reporting, `health` Edge Function, `request_id` propagation | Unit: scrubber removes emails/tokens/coords; health returns 200 and checks DB | DSN only; no PII |
| **M8** | Test infrastructure | Vitest workspace (domain + DB integration harness with helpers: create users, impersonate JWT, parallel connections), jest-expo setup, Playwright + axe config, test data builders, coverage reporting | A deliberately racy sample test proves the multi-connection harness can detect a lost update; CI runs all four layers | Test DB isolated; no prod creds |
| **M9** | Phase 1 exit review | Update docs/ADRs with actual versions; security checklist for Phase 1 scope; run all checks; demo script; list defects/limitations | Report per rule 12; all F-01…F-06 (foundation part) acceptance criteria evidenced by test output | Dependency audit clean of critical issues |

Parallelizable after M1: M2‖M5; M3 waits on design.md. M6 needs M4+M5. If `design.md` is late, M3 uses the provisional palette and a later "visual reconciliation" task is added to Phase 2.

Exit criteria for Phase 1: fresh clone builds; CI green (typecheck, lint, unit, RN, DB, one Playwright flow); a user can register, verify (local inbucket), sign in/out on web and one mobile target; RLS baseline proven by tests; no secrets in repo; docs updated.
