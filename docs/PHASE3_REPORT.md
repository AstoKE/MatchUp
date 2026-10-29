# Phase 3 report: the event engine

Status 2026-10-29. Scope: ROADMAP backlog items 6–18 and 23 (discovery, filters, event pages, creation, organizer permissions, participation requests, approval, capacity, cancellation, waitlist, manual location, My Events, basic notifications), list-based, no map. **Not started on purpose:** Phase 4 (map, venues), Phase 5 (attendance, reviews, progression) and anything commercial.

## 1. What was built

| Milestone | Result | Where |
|---|---|---|
| M1 event core | events, private details, participations, notifications; organizer RPCs; lifecycle, immutability and capacity triggers; quotas in `app_config` | `20261027100000_event_core.sql`, ADR-0019 |
| M2 organizer screens | three-step create/edit form, cancel with a reason, event page open to guests | merged (#17) |
| M3 discovery | guest-readable `search_events` (filters, keyset paging, page cap 50, 5 s timeout), Discover screen | `20261028100000_search_events.sql` |
| My Events | `list_my_events`, five tabs (organizing, pending, approved, waitlisted, past) | `20261028110000_list_my_events.sql` |
| M4 participation | request, withdraw, approve, decline, waitlist, remove, the organizer's queue; **optional auto-approve** | `20261029100000_participation.sql`, ADR-0020 |
| Notifications | inbox, bell with unread count, polled every 60 s | `features/notifications` |
| UI review (GoodRec as a usability benchmark, not a visual one) | day groups, profile sports as the default filter, filters behind a button on phones, urgency labels, ten in-house sport icons, pinned join action, indoor/outdoor label | `20261030100000_event_setting.sql` |
| Performance | Sentry replay/feedback and Supabase Realtime/Storage left out of the **web** bundle | `docs/PERFORMANCE.md` §3.6, §3.7 |

Decisions recorded: ADR-0019 (location without coordinates, quotas in config, jsonb event input, polling, analytics later) and ADR-0020 (auto-approve and the participation rules). The PRD, DATABASE, USER_FLOWS and PERFORMANCE documents were updated in the same changes.

## 2. What was actually tested (local stack, 2026-10-29)

| Level | Result |
|---|---|
| pgTAP (all phases) | **472 pass** in 10 files; Phase 3 files: event core, discovery, My Events, participation (90 assertions: every transition, strangers, guests, not-onboarded users, drafts, closed registration, terminal states, quotas, started events, auto-approve never jumping the queue) |
| API integration (real PostgREST + Auth) | **115 pass**, including **real parallel connections** for capacity: 14 approvals for 11 free spots give exactly 11 winners; 8 players racing for one auto-approved spot give one APPROVED and seven WAITLISTED with no errors; a withdrawal racing a promotion; ten identical requests. The auto-approve race was checked against a mutation that removes the event lock: it fails, and passes again with the lock restored |
| Component (jest-expo + RNTL) | **378 pass** |
| Domain (Vitest) / config | **97** / **4** pass |
| Web E2E (Playwright, Chromium, axe WCAG 2.2 AA tags) | **50 pass**: organizing, discovering, joining and approving across two browsers, withdrawing, auto-approve, My Events, notifications, a phone-width run (filters, pinned action, icons) |
| Gates | `pnpm check`, `db:test`, `test:integration`, `test:e2e`, `export:web` + `check:bundle` + `check:bundle-size` all exit 0 |
| Web bundle | total 866 kB gzip (ratchet 885), initial 544 kB (ratchet 555) |

Each commit of the Phase 3 pull requests was built and gated on its own tree, not only the final one.

## 3. What was found while building (and fixed)

- axe found two real accessibility defects on the first Discover run (a list without list items, a link label that did not contain its visible text).
- A browser probe with a dummy Sentry DSN showed that replacing a package by an **empty** module breaks Sentry's initialization; the unit tests could not have seen it (no DSN in tests). Stand-in modules replace it.
- `href: null` on an expo-router 58 tab marks it hidden and navigating there redirects away; event pages stay routable by removing only their tab button.
- Deleting an Auth user leaves its events behind (no FK, ADR-0003), which polluted Discover across test runs; the test helpers now clean them.
- A guest was redirected from My Events while the screen still asked the server; the queries now sit below the sign-in gate.

## 4. Hosted project

Schema pushed on 2026-10-29 for the first three migrations above (dry-run first, then the advisor: no errors, only expected warnings, see `docs/DEPLOYMENT.md` §9). `20261030100000_event_setting.sql` goes after its pull request is merged. The **signed-in** paths (request, approve, notifications) were exercised on the local stack only; nobody has used them on hosted. Public sign-up must stay disabled (legal texts are drafts).

## 5. Not done, and limitations

- **Invite-only events cannot be joined** (the invite flow and `get_event_by_invite` are not built; requests answer `NOT_FOUND`).
- Players see **counts, not the list of approved participants** (the participants view of USER_FLOWS FL-2 step 3), and the event page has **no organizer card**; both need a participant-facing read RPC (`get_event`), which does not exist yet: the page still reads `events` through RLS.
- No distance sort and no map (Phase 4); no blocked-pair filtering (Phase 6); `analytics_events` and funnels are Phase 7 (ADR-0019), so there are no pilot numbers yet.
- **Notifications are polled** (up to 60 s late), there is no push.
- District is not preselected in Discover on purpose (one district would hide most of a small pilot's events).
- **Nothing in Phase 3 was run on a device.** Web in Chromium only: no Firefox or Safari, no iOS, and the Android device suite (22 checks, Windows emulator) was **not** re-run for Phase 3, so native behaviour of the new screens, the pinned action with the on-screen keyboard, and TalkBack/VoiceOver reading order are **unverified**. The web-only bundle changes are deliberately not applied to native.
- The local edge-runtime container stops after a reboot and `pnpm db:start` does not bring it back (the `health` integration tests then answer 503); see `docs/DEVELOPMENT.md`.
- Supabase's leaked-password protection is off on hosted (a plan feature): LAUNCH_CHECKLIST.

## 6. Risks

- Start-up JS has 11 kB of headroom (544 of 555 kB); every route-heavy feature adds to the shared chunk (`docs/PERFORMANCE.md` §4, item 5).
- Auto-approve lets an organizer admit players without vetting; the controls left are removal and the three-requests rule (ADR-0020).
- Open-request quota is per player, not per organizer: an organizer cannot cap incoming requests.
- The sport icons and tints are a first in-house draft (design.md notes it has had no professional review).

## 7. Recommended next step

Not started, awaiting explicit instruction (CLAUDE.md): either **close Phase 3's gaps** (the `get_event` read RPC with participants and organizer card, the invite flow, an Android device run of the new screens) or **Phase 4** (venues, map, distance). My suggestion is a short Android validation run plus `get_event` first, because they change what a player sees before the pilot.
