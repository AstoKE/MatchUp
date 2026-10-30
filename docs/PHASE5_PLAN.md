# Phase 5 plan: player progression (database and logic first)

Status 2026-10-30: **plan, nothing built.** Scope: ROADMAP F-23 to F-26 (attendance, reviews, rating engine, badges). Sources of truth stay `docs/DATABASE.md` §3.5, §6.3, §9 and `docs/RATING_SYSTEM.md`; this file only sequences the work. It changes no documented requirement, state machine or invariant.

**Order of work.** The founder chose database and logic first because the screens are being redesigned (`design.md` does not exist yet, CLAUDE.md: no final screens before it). Screens are the last milestone and stay plain until then. Phase 4 (venues, map; P1, cuttable) is not started.

## What already exists

- `attendance_status` enum and `event_participations.attendance`, `attendance_marked_at/by`, with the check "attendance is only set on APPROVED rows" (M1 event core).
- `complete_event(event_id)` RPC and the `events.completed_at` check.
- `pg_cron` (used by the deletion queue, ADR-0017), the notifications table and inbox, the onboarding gate, the `runConcurrently` test harness, pgTAP and integration test setups.

Not there yet: `events.attendance_finalized_at` and `review_window_closes_at`, `attendance_disputes`, every table in DATABASE §3.5, all Phase 5 RPCs and jobs, the TypeScript reference implementation.

## Milestones (one at a time, each leaves `pnpm check`, `db:test`, `test:integration` green)

### M1: attendance and finalization (F-23)

**Status 2026-10-30: built** in `20261031100000_attendance.sql` and `20261031100100_attendance_audit_action.sql` (the audit action had to be allowed in a follow-up: found by the first test run). pgTAP `12_attendance.test.sql` (90 assertions) and `attendance-concurrency.test.ts` (5 tests, lock proven by a mutation check). **Changed against this plan:** (1) I-7 got a narrow exception for the one-time finalization columns (DATABASE.md updated); (2) **no notifications in M1**: the inbox maps known notification types, so they come with M2 together with the app change; (3) the organizer's own row is PRESENT from insertion (trigger) with a backfill; (4) account export and purge cover `attendance_disputes` (ADR-0017).

- **Data model:** columns `attendance_finalized_at`, `review_window_closes_at` on `events` (checks tie them to status); table `attendance_disputes` (RLS, no direct writes); the organizer's own row is `PRESENT` when they play (DATABASE §6.3).
- **RPCs (SECURITY DEFINER, `search_path = ''`, `auth.uid()`, revoked from `anon`):** `mark_attendance(participation_id, value)` (organizer; after the start; not after finalization; corrections allowed until then), `finalize_attendance(event_id)` (organizer; locks the event row; freezes marks), `dispute_attendance(participation_id, reason)` (participant, ABSENT only, within 72 h after finalization), and `admin_resolve_attendance_dispute` as a platform-admin-only SQL function without a screen (the console is Phase 6; without it DISPUTED could never resolve and the state machine could not be tested end to end).
- **Jobs (pg_cron, no Edge hop):** `complete_due_events` every 10 minutes, `auto_finalize_attendance` every 15 minutes at `completed_at + 48 h`. Auto-finalization leaves `NOT_CONFIRMED` untouched (neutral).
- **Security:** only the organizer marks; a player never marks themselves; strangers, guests and not-onboarded users get nothing; DISPUTED rows are excluded from scoring; all RPC results parsed with Zod in the app layer later.
- **Tests:** pgTAP matrix per role and per state transition including the forbidden ones, immutability after finalization, organizer-row rules, cron functions called directly on past fixtures; integration tests with real parallel connections (mark racing finalize, double finalize, dispute racing resolve); mutation check of the event lock like in Phase 3.
- **Acceptance:** every arrow of the §6.3 diagram is covered by a passing and a failing test; no path creates a reliability or XP row yet (that is M3), but finalization already records what M3 needs.

### M2: reviews, double blind (F-24)

**Status 2026-10-30: built** in `20261031110000_reviews.sql`: `skill_reviews` (read only by the author), `submit_reviews` (all or nothing, `FOR SHARE` on the event), an I-8 trigger behind it, export of the user's own reviews. pgTAP `13_reviews.test.sql` (52 assertions), `reviews-concurrency.test.ts` (3 tests, the event lock proven by a mutation check). **Decisions taken:** (1) the organizer-player rule (two verified-present others) applies to the organizer as the **reviewer**, as RATING_SYSTEM §2 words it ("review rights"); a player may review the organizer who played; (2) a non-participant gets `NOT_FOUND`, a participant who is not eligible gets `REVIEW_NOT_ELIGIBLE`; (3) **not built yet**: notifications (they come with the app change), the blocked-pair filter and the admin HIDE of a review (Phase 6), the window-closing job (M3, together with the rating recompute). Retention: reviews stay linked to the tombstone on account purge, the user's own are exported; the per-user table inventory test in `06_account_deletion_export` lists `skill_reviews`.

- `skill_reviews` per DATABASE §3.5 (unique per reviewer, reviewee, event; readable only by the reviewer), `submit_reviews(event_id, reviews[])` validating the whole eligibility matrix atomically (RATING_SYSTEM §3, S-8), the 72 h window, duplicates, self-review.
- **Tests:** eligibility matrix per pair type, window edges, reviewee cannot read, organizer-player rule (at least 2 verified-present non-organizer participants).

### M3: rating engine (F-25)

- `reliability_events` (append-only), `xp_transactions` (immutable ledger, dedupe key, trigger against UPDATE/DELETE), `user_sport_ratings`, `user_progress`, SQL functions for skill, reliability and XP, `close_review_windows` job (every 15 minutes), versioning (`algorithm_version`, `rule_version`).
- **TypeScript reference** in `packages/domain` with golden vectors, plus an integration test comparing SQL and TypeScript on randomized fixtures (ADR-0004). Independence tests (RATING_SYSTEM §7): skill, reliability and XP never influence each other.
- Extends account export and purge (ADR-0017 requires every new per-user table to do so).

### M4: achievements (F-26)

- `achievement_definitions`, `user_achievements`, the seven badges with positive and negative fixtures each, idempotent awards.

### M5: screens (after `design.md`)

- Organizer attendance marking, review flow, profile display of rating, reliability and badges, i18n tr/en, accessibility, the Playwright lifecycle test (F-35). Not started until the visual direction is chosen.

## Decisions taken in this plan (change them if you disagree)

1. Dispute **creation** is built in M1 and dispute **resolution** as a SQL function for platform admins without a screen; the admin console stays Phase 6.
2. Notifications for Phase 5 are minimal (finalized, review window open); the full catalogue is Phase 6.
3. Timings follow DATABASE: 48 h auto-finalize, 72 h dispute and review windows, cron every 10 and 15 minutes.

## Risks

- Organizer-attested attendance is the trust root (RATING_SYSTEM §9); this phase does not remove that.
- Cron jobs must be idempotent; every job function is tested by calling it twice.
- Rating formulas are v1 parameters; they are tuned after the pilot, which is why versions are stored.
- KVKK: scores are personal data; legal review stays open (SECURITY §8). Nothing here claims compliance.
