# Product Requirements Document (PRD)

Status: Phase 0 draft · Scope: MVP = first publicly testable version (Ankara pilot; all of Turkey in the catalog from Phase 4, ADR-0024)

Related: [PRODUCT_VISION](PRODUCT_VISION.md) · [USER_FLOWS](USER_FLOWS.md) · [DATABASE](DATABASE.md) · [ROADMAP](ROADMAP.md)

## 1. Product parameters

| Item | Value |
|---|---|
| Platforms | Web (Expo Web), iOS, Android — one codebase |
| Market / pilot city | Turkey, all 81 provinces and their districts (ADR-0024) / Ankara as the default and first community |
| Languages | `tr-TR` default, `en-US` secondary (i18n from day 1) |
| Timezone / currency | `Europe/Istanbul` / TRY (informational only in MVP) |
| Audience | 18+, self-declared age confirmation at onboarding (see SECURITY §3, §8) |
| Price to users | Free |

## 2. Roles and permissions

Authorization is always enforced server-side (RLS + RPC checks). Client role checks are UX only.

| Role | Scope | How obtained |
|---|---|---|
| **Player** | Global | Default for every verified account |
| **Organizer** | **Per event** | Implicit: creator of an event. Not a separate account type |
| **Verified Commercial Organizer** | Global/org | **Future.** Platform-controlled verification; never self-assigned |
| **Venue Operator** | Per venue | **Future.** Explicit venue ownership/membership records |
| **Platform Administrator** | Global | Row in `platform_admins`, inserted by operators with service credentials only; MFA (AAL2) required for admin actions |

### Permission matrix (MVP)

| Action | Anonymous | Player | Event organizer | Admin |
|---|---|---|---|---|
| Browse public landing / sign up | ✔ | ✔ | ✔ | ✔ |
| Browse public events and public event details (**guest discovery, D-09**) | ✔ read-only; no participant lists, no private details, no profiles beyond organizer display name/avatar | ✔ | ✔ | ✔ |
| Any action that joins, organizes, rates, reports, blocks or changes data | ✖ → sign-in prompt, then return to the same screen | ✔ | ✔ | ✔ |
| View own profile / edit own | — | ✔ | ✔ | ✔ |
| View another profile | ✖ | Per their visibility setting | Requesters' game-relevant profile | ✔ (audited) |
| Create event | ✖ | ✔ (verified email, active account, within quota) | — | ✔ |
| Edit / cancel / complete own event | ✖ | ✖ | ✔ (own only) | Take down any (audited) |
| Request to join | ✖ | ✔ (not blocked, not organizer) | — | — |
| Cancel own participation | ✖ | ✔ | ✔ | — |
| Approve / reject / waitlist / remove | ✖ | ✖ | ✔ (own event only) | Override (audited) |
| See participant list | ✖ | Approved participants & organizer only; others see counts | ✔ | ✔ |
| See pending requests | ✖ | Own request only | ✔ | ✔ |
| See exact location / private notes | ✖ | Approved participants (if `APPROVED_ONLY`) | ✔ | ✔ |
| Mark attendance / finalize | ✖ | ✖ | ✔ | Resolve disputes |
| Review another participant | ✖ | Only if both PRESENT at same finalized event | Same | — |
| Report / block | ✖ | ✔ | ✔ | — |
| Review reports, suspend users, hide events/venues | ✖ | ✖ | ✖ | ✔ |
| Grant admin / alter XP ledger / alter ratings | ✖ | ✖ | ✖ | ✖ via app (operators only, audited) |

## 3. MVP scope

The 31 MVP items from the product brief map 1-to-1 to feature IDs. Detailed backlog and acceptance criteria: [ROADMAP §3](ROADMAP.md).

| # | Brief item | Feature ID | Phase |
|---|---|---|---|
| 1 | Account creation and authentication | F-06 | 1–2 |
| 2 | Onboarding | F-07 | 2 |
| 3 | User profile | F-08 | 2 |
| 4 | Sport selection and preferences | F-07, F-08 | 2 |
| 5 | Basic sport-specific player profile | F-09 | 2 |
| 6 | Event discovery by province and district (Ankara by default) | F-12 | 3–4 |
| 7 | Event filters | F-12 | 3 (geo in 4) |
| 8 | Event detail pages | F-13 | 3 |
| 9 | Event creation | F-11 | 3 |
| 10 | Organizer ownership and permissions | F-11, F-15 | 3 |
| 11 | Participation requests | F-14 | 3 |
| 12 | Organizer approval/rejection | F-15 | 3 |
| 13 | Capacity management | F-16 | 3 |
| 14 | Participant cancellation | F-14 | 3 |
| 15 | Event cancellation | F-17 | 3 |
| 16 | Basic waitlisting | F-16 | 3 |
| 17 | Manual location/venue selection | F-20, F-21 | 3–4 |
| 18 | My Events dashboard | F-18 | 3 |
| 19 | Attendance confirmation | F-23 | 5 |
| 20 | Basic post-event rating | F-24 | 5 |
| 21 | Initial skill, reliability, XP logic | F-25 | 5 |
| 22 | Basic achievements | F-26 | 5 |
| 23 | Essential in-app notifications | F-19 | 3 (basic) → 6 (complete) |
| 24 | Reporting and blocking | F-27 | 6 |
| 25 | Essential admin/moderation | F-28 | 6 |
| 26 | Account/privacy settings | F-08 | 2 |
| 27 | Account deletion workflow | F-29 | 2 (moved, ADR-0017) |
| 28 | Turkish localization | F-32 | cross-cutting |
| 29 | Responsive web support | F-03, F-04 | cross-cutting |
| 30 | Production security baseline | F-05, F-30, F-34 | cross-cutting |
| 31 | Automated tests for critical workflows | F-01, F-35 | cross-cutting |

**Out of MVP** (designed-for, not built): push notifications (first post-MVP item, P-01), chat, friends, persistent teams, recurring events, QR attendance, recommendations, partner organizations, venue operator tools, booking, payments, ads/sponsorship, tournaments, enforced per-position slots, additional cities.

**Confirmed (D-02, 2026-10-24):** MVP ships **four visible tabs** (Discover, My Events, Create, Profile); the Community route group is reserved and hidden, and the navigation config is data-driven so a fifth tab can be added without restructuring.

**Confirmed (D-09, 2026-10-24):** public event discovery works for **guests** (unauthenticated users). Authentication is required to join, organize, rate, report, block, view My Events or Profile, or see anything beyond public event information. See ADR-0013.

## 4. Functional requirements

### 4.1 Account and profile (F-06…F-09)
- Email + password registration; email must be verified before creating events or requesting to join. Password reset via email. Sessions persist securely per platform.
- Onboarding: confirm 18+, accept Terms and Privacy Notice (versioned, stored), choose province, optionally district (all of Turkey from Phase 4, list-driven; ADR-0024), pick sports, self-assess level per picked sport, optional positions, optional avatar/bio. Location permission is **never required**.
- Profile: display name (unique-not-required, 2–40 chars, moderation-checked), avatar, city/district, bio (≤ 280), preferred sports, sport profiles, history, reliability, XP/level, badges.
- Privacy settings: `profile_visibility` (`EVERYONE` = any signed-in user, `EVENT_PEERS` = only people sharing an event with you, plus organizers evaluating your request), show/hide reliability and badges on profile, marketing consent (default off).
- Join-request disclosure: requesting to join shares a minimal game-relevant profile (display name, avatar, level for that sport, reliability, badges) with the organizer regardless of profile visibility. Shown in UI at request time.

### 4.2 Sports catalog (F-10)
- DB-driven: sports, formats, positions, skill descriptors, localized names. Seed for Football, Futsal, Basketball, Volleyball, Tennis, Padel, Badminton, Table tennis, Running, Walking. Adding a sport/format is a data change, not a schema change.
- Sport ≠ format ≠ event ≠ team ≠ participation ≠ position (separate concepts, see DATABASE §2).

### 4.3 Event engine (F-11…F-18)
- **Create:** sport, format, title (3–80), optional indoor/outdoor label (public; also a Discover filter), description (≤ 2000), start date/time, duration (15–480 min), location, capacity (within the format's bounds), skill range (optional, 1.0–5.0), visibility (`PUBLIC` | `INVITE_ONLY`), participation rules, optional: equipment note, cost info (informational), booking status, position needs (informational), participant notes (private to approved), whether the organizer also plays (default yes; occupies one slot).
- **Lead time:** publish requires start ≥ 60 min in the future (anti-fabrication of past events; configurable).
- **Visibility:** `PUBLIC` appears in discovery. `INVITE_ONLY` is reachable only with its secret link; requests still need approval.
- **Location privacy:** `PUBLIC` shows exact place; `APPROVED_ONLY` shows district + fuzzed pin until approved.
- **Lifecycle:** `DRAFT → PUBLISHED → (CANCELED | COMPLETED)`. "Full", "registration closed", "started", "attendance finalized" are **derived/timestamps, not states** (DATABASE §5).
- **Participation:** `REQUESTED / APPROVED / REJECTED / WAITLISTED / CANCELED / REMOVED` with explicit transition table; attendance is a separate field (`NOT_CONFIRMED / PRESENT / ABSENT / DISPUTED`).
- **Auto-approve (optional, organizer's choice, default off; ADR-0020):** a join request is approved at once while a spot is free **and nobody is on the waitlist**; otherwise the organizer decides as usual. A full event still waitlists, and promotion from the waitlist stays an explicit organizer action.
- **Capacity:** only `APPROVED` consumes a slot. Enforced atomically in the database. Requests on a full event go to the waitlist (if enabled). Waitlist promotion is always an explicit organizer action; a freed slot generates an organizer notification, never an automatic join.
- **Edit rules:** after publish, sport, format and "organizer plays" are immutable; capacity can rise any time and fall to no lower than the approved count; changes to time or place are "material" → participants notified, and cancellations in the next 24 h are marked excused (no reliability penalty).
- **Cancel:** organizer may cancel before start with a reason; all active participants notified; no reliability or XP consequence for participants.
- **Re-requests:** a participant who canceled may re-request (max 3 requests per event); `REJECTED` and `REMOVED` are terminal for that event.
- **Cutoffs:** participants cannot cancel and organizers cannot remove after start (after start, the organizer marks `ABSENT` instead).

### 4.4 Discovery (F-12, F-22)
- List of upcoming public events in the selected city/district; filter by sport, date range, time of day, format, skill level, open slots, distance (when a point is supplied), and sort by soonest or nearest. Keyset pagination. List/map toggle (map in Phase 4).
- Empty/loading/error/offline states for every list.

### 4.5 My Events (F-18)
Tabs: *Organizing*, *Pending*, *Approved*, *Waitlisted*, *Past* (completed/canceled/rejected). Organizing events show pending-request badge counts.

### 4.6 Locations & venues (F-20, F-21)
- Phase 3: event location = district + place label + optional street address chosen by the organizer; **no coordinates or map pin until Phase 4** (ADR-0019). With "approved only" location, others see just the district until approved.
- Phase 4: a pin per event, exact for `PUBLIC`, snapped to a 500 m grid for `APPROVED_ONLY` (ADR-0024); venue directory (public/community spaces and commercial facilities), data provenance and verification kept as separate fields, per-event **booking status** labels (`NOT_REQUIRED`, `NOT_YET_BOOKED`, `BOOKED_EXTERNALLY`, `TO_BE_CONFIRMED`) always labeled "declared by the organizer". The app never claims availability or reservation.
- Cost information is informational; MatchUp does not collect or hold money in the MVP.

### 4.7 Attendance, reviews, progression (F-23…F-26)
See [RATING_SYSTEM](RATING_SYSTEM.md). Summary: the organizer confirms attendance after the event; only confirmed-present participants earn XP/reliability credit and may review each other within a 72-hour double-blind window; XP is an immutable deduplicated ledger; skill, reliability and XP are independent.

### 4.8 Notifications (F-19)
In-app inbox with unread badge, delivered transactionally with the action that caused them. Types (MVP): request received, request approved/rejected/waitlisted, removed, event canceled, event materially changed, spot opened (to organizer), attendance reminder (to organizer), review window opened, badge earned, report outcome, account-deletion notices. Email only for Supabase Auth flows. Push is post-MVP behind a provider abstraction; because in-app-only reduces reach, **push is the first post-MVP item** (risk R-8).

### 4.9 Trust & safety, admin (F-27, F-28)
Report user/event/venue/review with reason; block user (mutual invisibility, no requests either direction); admin queue with actions: dismiss, hide event, cancel event, suspend/reinstate user, hide review, verify/hide venue, resolve attendance dispute. Every privileged action is recorded in `moderation_actions` and `audit_logs`.

### 4.10 Account lifecycle (F-29)
Data export (JSON) and account deletion with a 30-day cancel-able grace period, then anonymization (SECURITY §9, DATABASE §11; retention/legal items SECURITY §8).

## 5. Non-functional requirements

| Area | Requirement (targets, validated by benchmarks — see ARCHITECTURE §8) |
|---|---|
| Performance | p95 standard API < 500 ms; p95 nearby-event search < 800 ms at pilot load; cold start < 3 s on mid-range Android (measure) |
| Accessibility | WCAG 2.2 AA (web); screen-reader labels, ≥ 44×44 pt targets, dynamic type, reduced motion, keyboard navigation |
| Security | RLS on every table; no privileged keys in clients; rate limits; negative-path authorization tests |
| Privacy | Privacy by default; optional location; minimal data; export + deletion; KVKK items flagged for legal review before launch |
| Reliability | Capacity never exceeded under concurrency; transactional notifications; idempotent writes |
| i18n | All user-facing strings externalized; `tr` complete at launch; ICU-style plurals; dates via `Intl` in `Europe/Istanbul` |
| Maintainability | Strict TypeScript, modular monolith, tests on critical paths, ADRs |
| Compatibility | iOS and Android versions per Expo SDK minimums; evergreen browsers (last 2 versions of Chrome, Safari, Firefox, Edge) |

## 6. Assumptions (reversible, low risk)

- A-1 Single organizer per event in MVP (co-organizers post-MVP).
- A-2 One global reliability score per user (not per sport) in MVP.
- A-3 Capacity counts the organizer when "organizer plays" is on.
- A-4 Participants with `NOT_CONFIRMED` attendance after finalization are neutral (no XP, no penalty).
- A-5 Event times are entered/displayed in the city's timezone (Europe/Istanbul); stored in UTC.
- A-6 Skill scale 1.0–5.0 with sport-specific anchor descriptions.
- A-7 No mock data in production flows; the dev seed exists only for local/staging.
- A-8 Admin console is a web-only route group inside the same Expo app (ADR-0006).

## 7. Open product questions

Tracked in [PHASE0_REVIEW §4](PHASE0_REVIEW.md) with recommended defaults.
