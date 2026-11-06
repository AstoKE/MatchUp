# Phase 7 plan: hardening and the Turkey pilot

Status 2026-11-07: **M1 (#77) and M2 (#78) merged, M3 built** (in review). Scope: ROADMAP F-31 (client analytics, dashboards), F-32 (Turkish review), F-33 (accessibility), F-34 (hardening), F-35 (lifecycle E2E), and the open items of [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md). Exit: a **pilot release candidate for all of Turkey** (founder's decision of 2026-11-07, amending ROADMAP §1 and ADR-0024's "can still start in Ankara"). No new product features: what is built is made safe, fast, observable and provable.

**Why.** Phases 2–6 and 4 built the product and tested it locally and on the web. A pilot puts it in front of strangers across the country: the remaining risks are operational (who answers reports, backups, email, abuse), unverified platforms (native Phase 4–6, iOS, release builds) and scale (indexes and budgets beyond 5000 events).

## What exists

- Tests: pgTAP 1280, API integration 189 (real concurrency), components 562, domain 155, web E2E 73 with axe, Android emulator suite 31 (Phases 2–3), iOS simulator smoke 2 flows.
- Server-side quotas, new-account limits, reports, blocks, admin with a second factor, deletion and export.
- Ratchets for the web bundle; a CI with four required checks.
- Hosted Supabase in Paris with every migration applied (2026-11-07), public sign-up **disabled**.

Not there:
- product analytics (deferred by ADR-0019);
- load tests at pilot scale;
- a full lifecycle E2E in one flow;
- native runs of Phases 4–6;
- a way for pilot users to get an account while public sign-up stays disabled;
- most operational items of the launch checklist.

## Milestones (one at a time; each leaves `pnpm check`, `db:test`, `test:integration` and web E2E green)

### M1: the lifecycle end to end, and an honest checklist

**Status 2026-11-07: built.**
- `e2e/lifecycle.spec.ts`: three browsers through one tennis-singles event (two places): request, approve, full, waitlist, leave, approve from the waitlist, start, attendance, review, past events. 27 s, stable over repeated runs.
- LAUNCH_CHECKLIST rewritten with owners and milestones.
- ROADMAP, PRD, ADR-0024 and CLAUDE.md say "pilot across Turkey".
- **Changed from the plan:** the Maestro flows for Phase 4–6 move to M6, where they can be run on the emulator; flows written without a run would not be verified.

- **F-35:** one Playwright flow through the whole life of an event with three browsers: create, request, approve, full, waitlist, cancel by a player, promotion, start, attendance, completion, reviews, progress. Kept short and stable; the details stay in the existing specs.
- **LAUNCH_CHECKLIST rewritten for the Turkey pilot:**
  - stale lines fixed (report/block are built);
  - every item marked with an owner (code, founder or counsel) and a milestone.
- **Docs:** ROADMAP, PRD and CLAUDE.md say "Turkey pilot".

### M2: security review

**Status 2026-11-07: built** (docs/SECURITY_REVIEW.md).
- **Inventory:** the database API surface (142 functions, 32 tables) is a reviewed snapshot that CI compares (`security-inventory.test.ts`), with invariants on guards, `search_path`, RLS and grants.
- **Findings:** eight, none allowing access to another person's data. S7-1 (the dispute resolution's guard) is fixed in `20261109100000`. The others are accepted, or are founder settings with exact steps (DEPLOYMENT §12).
- **From outside:** `scripts/security/hosted-surface.mjs` shows what a stranger sees of hosted (the founder runs it).
- **Web headers:** CSP and the other headers are written for whichever static host is chosen.
- **Changed from the plan:** the inventory is a test in the integration suite (it needs the database), not a script.

- **RPC and RLS audit.** Every `public` function, with:
  - who may call it;
  - which tables it reads and writes;
  - what it returns (allow-list);
  - how it is rate limited.

  Kept as a generated inventory (`scripts/security/rpc-inventory.mjs`) compared in CI with a reviewed snapshot, so a new function cannot appear unreviewed.
- **Threat model refresh** (SECURITY §2) for Phase 4–6 surfaces: venues, pins, admin, reports.
- **Findings fixed in this milestone,** each with a negative test.
- **Founder's hosted settings,** with exact steps:
  - Auth rate limits;
  - leaked-password protection;
  - redirect allow-list;
  - SMTP with SPF/DKIM;
  - CAPTCHA when the Turnstile key exists;
  - re-running `auth-probe` against hosted.

### M3: performance and load

**Status 2026-11-07: built.**
- Load test: every ARCHITECTURE §8 budget met at 110k events and 553k participations on the local stack. Discovery p95 219 ms, join storm 16 ms, last-slot race 42 ms with exactly one winner, dashboard 10 ms.
- No sequential scans on the big tables, so no index changes were needed.
- The catalog is kept on the device for a day.
- Numbers and method in PERFORMANCE §4b; the runner is `node scripts/load/run.mjs --fresh`.

- **k6 scenarios** of ARCHITECTURE §8, run against the **local** stack seeded with 100k events and 500k participations:
  - discovery with radius;
  - a join storm on one event;
  - the last-slot race;
  - organizer lists;
  - notification fan-out;
  - cron sweeps.
- p50/p95/p99 recorded in PERFORMANCE. Query plans checked: no sequential scans on the big tables.
- **Index changes** where plans show the need (forward-only migrations, rehearsed over data as DEPLOYMENT §9 now requires).
- **The catalog kept on the device** between starts (it changes only with migrations): one request a day at most instead of one per start.
- k6 is an external tool: run by a script, not added as an app dependency.

### M4: observability and analytics

- **`analytics_events`** (ADR-0019 §5):
  - Server-side events written inside the RPC transactions (non-spoofable): created, published, requested, approved, rejected, canceled, completed, attendance finalized, review submitted.
  - A client `track_event` RPC with an allow-list, a rate limit and no PII (screen views, filters, map opened, near me used).
  - Export and purge extended, as the pgTAP inventory demands.
- **Pilot dashboard** as SQL views readable by admins at aal2:
  - registrations;
  - discovery → join conversion;
  - fill rate;
  - no-show rate;
  - provinces with activity.
- **Errors:** Sentry DSN on hosted builds, with the scrubber reviewed against real events.
- **Health:** the health endpoint monitored from outside (the founder chooses the free monitor; steps given).
- **Backups:** point-in-time recovery decision and **a restore rehearsal** (founder, steps given).

### M5: accessibility and language

- axe on every route at phone and desktop width (today: the main flows only).
- Keyboard-only pass on the web.
- Focus order and labels fixed where found.
- Contrast re-checked for Theme E.
- **Manual checklist** for VoiceOver and TalkBack, filled in during M6 on devices.
- **Turkish copy review list** (F-32): every screen's strings exported in one file for a native speaker's review; İ/ı and plural checks in tests.

### M6: devices and release builds

- **Android:**
  - new development build in the Linux container;
  - the emulator suite extended with Phase 4–6 Maestro flows (map, pin, venues, report/block, notifications, admin on the web only), written and run here;
  - a signed release build on a physical device (the founder's "koş" and device).
- **iOS:**
  - simulator build on EAS with the map;
  - the data flows against a reachable backend;
  - a physical iPhone, which needs final identifiers (ADR-0010).
- Results in NATIVE_VALIDATION with what was and was not verified.

### M7: pilot readiness and the release candidate

- **Accounts while public sign-up is disabled (decision needed, below).**
- **Support:**
  - a contact address reachable from the app and from the suspended-account page;
  - who answers reports and how fast (SECURITY says 24 h);
  - an admin runbook (`docs/OPERATIONS.md`): reports, suspensions, venue queue, disputes, deletion requests, incident steps.
- **Legal texts published as new versions,** once counsel approves (migration bumps the versions, `legal.draft` false).
- **Store listings and identifiers** when the founder decides them (ADR-0010). Nothing is published without the founder's go.
- **`docs/PHASE7_REPORT.md`** and the go/no-go list.

## Decisions taken

| Question | Decision |
|---|---|
| Pilot area | All of Turkey (2026-11-07) |
| Plan review | No separate docs PR: this plan ships with M1 (2026-11-07) |

## Decisions needed, and when

- **Before M7: how pilot users get accounts.** Public sign-up is disabled on hosted (ADR-0016) and the Auth API cannot be fenced by a proxy. The options:
  - (a) invitations sent from the dashboard or an admin RPC (`inviteUserByEmail`), so only invited emails can join;
  - (b) a sign-up allow-list checked by an Auth hook (invite codes);
  - (c) open sign-up with CAPTCHA and the new-account limits.

  (a) needs no code and fits a small pilot; (b) scales to community invites; (c) is the public launch.
- **Before M4:**
  - whether product analytics need consent beyond the Terms (counsel; SECURITY §8);
  - the pilot dashboard's audience: admins only, or also an export.
- **Before M6:** a physical Android device and an iPhone, and the final bundle identifiers for release builds.
- **Founder actions without code (steps written in each milestone):**
  - SMTP;
  - Auth limits;
  - leaked-password protection;
  - backups and PITR;
  - health monitor;
  - Sentry DSN;
  - MapTiler key restrictions;
  - TOTP and the first admin on hosted.
- **Counsel:**
  - Terms and Privacy Notice (with the Phase 4 wording in PHASE4_REPORT §6);
  - KVKK;
  - 18+ self-declaration;
  - the transfer to MapTiler.

## Risks

- **One operator for a national pilot** (R-9). M7's runbook and the quotas limit the load. The pilot size is kept small by the account decision.
- **Native regressions found late.** Phases 4–6 have never run on a device; M6 is scheduled before the release candidate on purpose.
- **Load beyond the laptop.** k6 runs locally, not against hosted (reads and pushes to hosted are the founder's). Hosted numbers come from the founder's run with the same script, if wanted.
- **Legal timing.** Counsel's review gates M7 and is outside the code's control.
