# Phase 6 plan: trust, moderation and admin

Status 2026-11-01: **M1 and M2 built**, the rest not started. Scope: ROADMAP F-27, F-28, the rest of F-19 and F-30, plus what Phase 5 left here. Sources of truth stay `docs/PRD.md` §4.9, `docs/DATABASE.md` §3.6, `docs/SECURITY.md`, `docs/USER_FLOWS.md` FL-9 and FL-11. This file sequences the work and lists what a decision is needed for.

**Why now.** The pilot has real people meeting strangers and rating each other. Without reporting, blocking and someone able to act on them it cannot start, and the app stores require them for user-generated content (SECURITY §8). Today a dispute can only be resolved by a SQL function nobody has a screen for.

## What exists

`private.is_admin()`, `platform_admins`, `private.audit_logs`, the `SUSPENDED` account status, `admin_resolve_attendance_dispute` (requires `aal2`), `skill_reviews.status = 'HIDDEN'` (the formula already skips it), `user_achievements.revoked_at`, `notifications`.

Not there: `user_blocks`, `reports`, `moderation_actions`, any `admin_*` RPC but the dispute one, **a way for an admin to enroll MFA and reach `aal2` in the app**, a screen showing another player, the `/admin` routes.

## Milestones (one at a time, each leaves `pnpm check`, `db:test`, `test:integration` and web E2E green)

### M1: blocking, in the database

**Status 2026-11-01: built** in `20261101110000_user_blocks.sql`: `user_blocks`, `block_user`, `unblock_user`, `list_my_blocks`, restrictive RLS on events and profile tables, a trigger behind the RPCs, checks in `get_event`, `request_join`, `search_events`, `get_event_reviews`, the review trigger; export and purge. pgTAP `20_user_blocks` (46), `blocks-concurrency` (2). Open requests between the pair are rejected silently (FL-9, more exact than this plan). `list_event_requests` needs no filter: what remains after a block is approved players, whom the organizer must be able to remove. Search with 5000 events and 300 blocks took about 92 ms, against about 52 ms for a guest, on this laptop, rolled back. No screen yet (M3).

- `user_blocks`, `block_user`, `unblock_user`, `list_my_blocks`; export and purge (ADR-0017).
- **Enforced on the server everywhere it matters (S-12):** `request_join` and invites both ways, `search_events` and `get_event` hide the other's events, `list_event_requests` and rosters, `submit_reviews` and `get_event_reviews` (S-8, left open in Phase 5). A block never reveals itself: the blocked person gets the same answer as for anything else unavailable.
- **Security impact:** high. Changes reads of the core RPCs, all additive for installed apps.
- **Tests:** pgTAP matrix for each RPC both directions; a race between blocking and an approval; performance of `search_events` with blocks.
- **Acceptance:** after a block, neither side can find, join or review the other, and neither is told why.

### M2: reporting, in the database

**Status 2026-11-01: built** in `20261101120000_reports.sql`: `reports`, `report(target_type, target_id, reason, details, invite_token)`, 20 a day under a per-reporter lock, export and purge. pgTAP `21_reports` (38), `reports-concurrency` (2). Reporter and target learn nothing about the outcome (`status` and `handled_by` are not readable). Reports about someone are not in their export, that would identify the reporter. Repeating an open report returns the first and costs nothing. No screen yet (M3); nobody can act on a report yet (M4).

- `reports` with an open-per-target unique rule, `report(target_type, target_id, reason, details)`, 20 a day (S-16), checked that the reporter could actually see the target; export; details removed on purge. A reporter never learns what was done beyond "closed" (FL-9).
- **Tests:** duplicates, rate limit under concurrency, targets the reporter cannot see, no PII in logs.

### M3: report and block screens

- A small player card (name, level, reliability if shown) reached from a roster and the request queue, with Report and Block. Report on the event page. Blocked people in settings, with unblock. Copy tr and en.
- **Honors** `profile_visibility`, `show_reliability`, `show_badges`, which do nothing today: the read goes through a new RPC.
- **Tests:** components, Playwright with axe, a negative path for each action.

### M4: admin, in the database

- `moderation_actions` (append-only), `admin_list_reports`, `admin_get_report`, `admin_resolve_report`, `admin_suspend_user` / `admin_reinstate_user`, `admin_hide_event`, `admin_cancel_event`, `admin_hide_review`, `admin_list_disputes`. All check `is_admin()` and `aal2` (S-14) and write the audit log.
- **Suspension:** writes refused with `ACCOUNT_RESTRICTED` (S-13), sessions ended, profile and events hidden; verify what a suspended organizer's upcoming events do.
- **What a hidden review does:** ratings recomputed. **What a revoked badge does with its XP:** see decision 3.
- Moderation flags as queue entries, no automatic penalty: mutual-5 pairs, review bombing (RATING_SYSTEM §3.5), three no-shows in 30 days (§4.4).
- **Tests:** every RPC as a non-admin, as an admin without `aal2`, as an admin with it; append-only triggers.

### M5: admin console

- Web-only `/admin` (A-8, ADR-0006), lazy, so it stays out of the phone bundle and the web budget: queue, report detail, users, events, disputes, audit.
- **MFA enrollment and challenge** screens: without them no admin can pass `aal2`.
- **Tests:** Playwright: an ordinary user and a non-MFA admin get nothing; queue to resolution in three clicks or fewer (F-28).

### M6: closing the phase

- Notifications left: `report_outcome` and what a suspension or a hidden event tells people, reminders to finalize (RATING_SYSTEM §9); the list is in USER_FLOWS.
- Abuse controls (F-30): the quotas of SECURITY for reports, younger accounts; display name checks. Whether the CAPTCHA token reaches the server from web and native (LAUNCH_CHECKLIST).
- Report from a review stays out: see decision 2.

## Decisions (defaults used unless you change them)

1. **A block is mutual and silent**, as PRD §4.9 says. Someone already approved stays approved when blocked: the organizer can remove them, and removing them automatically would tell them. Reviews between them are refused from then on.
2. **No "report a review" button in the MVP**, although FL-9 lists it. Reviews are double-blind, so nobody can see a review to report it; admins hide reviews through the flags. Target types stay `USER` and `EVENT`; `VENUE` waits for Phase 4.
3. **A revoked badge keeps its XP**, and a hidden review changes the rating but no XP already paid. Compensating rows are for clear abuse, by hand. Reversing automatically invites gaming the reports.
4. **No automatic suspension from any flag or report count.** People decide (SECURITY).

## Needs you, not code

- **Who answers reports, and how fast.** SECURITY says triage within 24 h is a commitment to define before launch. In a pilot that is probably you.
- **Counsel:** retention of reports and moderation records (2 years in DATABASE), profiling (the flags), UGC duties under law 5651, what a suspension must tell the person (SECURITY §8).
- **Who is the first admin.** Added with service credentials on hosted, on your go-ahead; MFA from the first sign-in.

## Risks

- **M1 touches the most-used reads.** A missed path leaks a blocked person's events, so its tests are the phase's most important. `search_events` must stay within its budget.
- Moderation can be abused too: every action is audited, and admins stay few.
- The console is real attack surface: `aal2` on the server for every action, never only a hidden route.
- The bundle has 6 kB left: the console must stay lazy, with the ratchet as the check.
- iOS and Android have not seen the redesign. A device pass is due before this phase's screens stack on top of it.
