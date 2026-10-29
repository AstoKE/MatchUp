# User Flows

Status: Phase 0 · Each flow lists the RPCs it uses ([DATABASE §9](DATABASE.md)) and the failure paths that must be designed, not discovered. Turkish copy shown is a **draft for the i18n resource files**, not final.

## 1. Navigation and route map (MVP)

```
(auth)        /sign-in  /sign-up  /forgot-password  /verify-email  /auth/callback
(onboarding)  /onboarding/{welcome, age-terms, city, sports, levels, profile}
(tabs)        /discover (list|map)   /my-events   /create   /profile
              /e/[id]  event detail        /e/[id]/manage  organizer console
              /e/[id]/attendance  /e/[id]/review
              /u/[id]  player profile      /notifications   /settings/*  /venues/[id] (Ph4)
(admin)       /admin/{reports, users, events, venues, disputes, audit}   (web-only, lazy)
(community)   reserved, hidden in MVP
```
Create is a primary action (center button on mobile, button in the rail on desktop) that opens a guided stepper; it is a tab-level destination only for the 5-section layout compatibility (decision D-02).

Responsive: mobile bottom tabs · tablet/desktop side rail + content column · wide desktop Discover is list + detail two-pane.

## 2. Flow catalogue

### FL-1 Sign-up, verification, onboarding (F-06, F-07)
1. Sign up with email + password (+ CAPTCHA) → "check your email" screen. *Unverified users may browse but not create/join; they see a banner with "resend".*
2. Verify via link/deep link → session established → onboarding.
3. Onboarding steps: **Welcome** → **Age & terms** (18+ confirmation checkbox; Terms + Privacy Notice links with version shown; marketing consent separate, unchecked) → **City** (Ankara; "other city" = join waitlist-for-city feedback form) → **Sports** (multi-select from catalog) → **Levels** (per sport: five anchored descriptions, plus optional positions) → **Profile** (display name, optional avatar/bio) → done → Discover. Location permission is **not** requested here.
4. `complete_onboarding` persists everything atomically; the user can resume if they quit midway.

Edge cases: expired/used verification link (resend); email already registered (generic message to avoid account enumeration); offline mid-onboarding (draft kept locally, submit retried); under-18 (cannot continue; no data stored beyond account shell — account removed); display-name moderation rejection.
Copy: *"18 yaşından büyük olduğumu onaylıyorum."* · *"Konum izni istemiyoruz; istersen yakınındaki etkinlikler için sonra açabilirsin."*

### FL-2 Discover and request to join (F-12, F-13, F-14) — Scenarios B, D
**Guests (D-09)** can run steps 1–3 without an account; participant lists and private details are hidden. Tapping **Request to join** (or Create, My Events, report, share-to-group actions that need identity) opens a sign-in/sign-up prompt that returns to the same event afterward with the intent preserved.
1. Discover opens with the user's city/district and preferred sports preselected (**built: the profile's sports for signed-in players, with a visible note and one tap to clear; the district is deliberately not preselected, a single district would hide most of a small pilot's events**; guests see everything); the list is grouped by local day (Today, Tomorrow, then the weekday and date) with only the time on each card; on a phone the filters sit behind a "Filters (N)" button so the first events are on the first screen; filters: sport chips, date range, time of day, format, skill range, "only with open slots", distance (when location is granted or a district is chosen), sort (soonest/nearest). List ⇄ map toggle (Phase 4).
2. Event card shows: sport + format, title, date/time (relative + absolute), place label/district, slots (`8/14` + bar), skill range, cost note if any, organizer name with their badges/reliability chip (only what their privacy settings allow). Tapping opens `/e/[id]`.
3. Event detail: full info, organizer card, **slots visualization** (filled / open), participants (avatars if the viewer is approved; otherwise counts), rules, booking-status label ("Rezervasyon durumu organizatör tarafından beyan edilmiştir"), cost note ("Ücret bilgisi bilgilendirme amaçlıdır; MatchUp ödeme almaz"), cancellation rules, report/share actions.
4. **Request to join** → bottom sheet: optional message (≤ 280), optional preferred position, disclosure of what the organizer will see ("Organizatör görünen adını, seviyeni, güvenilirlik puanını ve rozetlerini görecek"), confirm → `request_join` → state `REQUESTED` ("İstek gönderildi") or, if full, `WAITLISTED` ("Etkinlik dolu — bekleme listesine eklendin").
5. User can withdraw at any time before the event (`cancel_participation`).

Edge cases: event became full between page load and tap (server decides → waitlist or `EVENT_FULL` toast with refresh); registration closed; blocked by organizer (generic "Bu etkinliğe katılamazsın", no reason); email not verified (inline verify prompt); already requested (show current state, idempotent); rate limit; skill outside range (soft warning only — organizer decides); offline (retry prompt); request limit (3) after repeated cancel/re-request.

### FL-3 Create event (F-11, F-20) — Scenarios A, C, E
Guided stepper with a persistent summary and **Save draft**:
1. **Sport & format** (format sets default and min/max capacity) 
2. **When** (date, start time, duration; shows "başlangıca en az 1 saat olmalı")
3. **Where** (district → free label + map pin; Phase 4 adds venue picker/search; location visibility: public / only approved participants) + **Booking status** & optional cost info
4. **Who** (capacity, "I will play" toggle, skill range, waitlist toggle, visibility Public/Invite-only, optional position needs)
5. **Details** (title, description, equipment note, participant notes visible after approval — e.g. WhatsApp link)
6. **Review & publish** (preview identical to the public card + warnings) → `create_event(publish=true, client_request_id)`.

Edge cases: double-tap (idempotent via `client_request_id`); start in the past / < 60 min; capacity outside format bounds; daily creation quota; email unverified; leaving mid-way (draft restore); invite-only → show share link & copy button.
Scenario E copy: *"Saha rezervasyonunu MatchUp dışında yaptın. Durumu belirt; MatchUp rezervasyonu doğrulamaz veya garanti etmez."*

### FL-4 Organizer manages requests (F-15, F-16) — Scenario A
1. Notification "N yeni katılım isteği" → `/e/[id]/manage`: tabs *Requests*, *Waitlist*, *Approved*.
2. Each request shows the requester's game-relevant profile (level for the sport, reliability with confidence, badges, message, preferred position). Actions: **Approve**, **Reject**, **Waitlist**; bulk approve is not offered (forces consideration).
3. Approve while slots remain → user notified. Approving the last slot → event shows **Full**; remaining pending requests stay visible with "Dolu — onaylamak için önce bir yer aç" and the Waitlist action.
4. Organizer can raise capacity (cannot drop below approved count) and can remove an approved participant before start (reason required, neutral for their reliability).

Edge cases: two devices/organizer double-approve (idempotent); concurrent approval of the last slot by retry + another request (one wins, the other gets `EVENT_FULL`, UI refreshes); requester canceled or was blocked meanwhile (row disappears with explanation); organizer lost network (error + retry, never optimistic).

### FL-5 Cancellation, freed spot, waitlist promotion (F-14, F-16) — Scenario D
1. Approved participant cancels (before start) with optional reason; the app explains reliability effect *before* confirming when the cancellation is late ("Geç iptal güvenilirlik puanını etkileyebilir"), and states when excused.
2. Slot frees → organizer gets "Bir yer açıldı — bekleme listesinde N kişi var" → one-tap review of the **first in FIFO order** (organizer may pick anyone) → explicit **Approve**. Nothing is auto-promoted; waitlisted users see their queue position as "sıradaki" only, not an entitlement.
3. Waitlisted user approved → notification "Onaylandın".

### FL-6 Event edits and cancellation (F-11, F-17)
- Editing: allowed fields per DATABASE §6.1. Changing time/place/duration asks for confirmation ("Katılımcılara bildirim gidecek; 24 saat içinde iptal edenler güvenilirlik puanından etkilenmez").
- Cancel event (before start): reason picker + optional message → all REQUESTED/WAITLISTED/APPROVED users notified; event card shows *İptal edildi*; no participant penalty.
- Edge cases: cancel after start is not offered (complete instead); admin takedown shows a neutral "Bu etkinlik kaldırıldı" to participants.

### FL-7 Event day: attendance, completion, finalization (F-23)
1. From `starts_at`, the organizer sees "Katılım listesi" with PRESENT/ABSENT toggles (default unset); can mark during the game.
2. After the event: **Complete** (auto at `ends_at + 2 h`), then **Finalize attendance** (auto 48 h after completion). Reminder notifications to the organizer at `ends_at` and at +24 h.
3. Finalization triggers reliability events, XP and badge checks; participants get "Katılımın onaylandı", review window opens.
4. A participant marked ABSENT sees "Katılmadı olarak işaretlendi" and can **Dispute** within 72 h → admin resolves.

Edge cases: organizer forgets (auto-finalize; players neutral); marked wrong (fix before finalize); organizer marks themselves (default PRESENT, not editable); 0 present (completed, no XP).

### FL-8 Post-event reviews (F-24)
1. Review window (72 h) notification → `/e/[id]/review`: list of other verified-present participants; per person 1–5 (sport-specific anchors shown) + optional "Fair play" toggle; submit all at once (`submit_reviews`), skipping allowed.
2. Copy states reviews are anonymous and based on playing level only; behavioral issues go to **Report**.
3. After the window closes: ratings recomputed; "Yeni rozet" notifications if any.

Edge cases: not present → no access with explanation; window closed; blocked pair excluded; duplicate submit (idempotent per pair).

### FL-9 Report and block (F-27)
Report from event, profile, review or venue: reason (spam, harassment, unsafe behavior, fake event, inappropriate content, other) + details → confirmation "Raporun alındı". Block from a profile: mutual invisibility; their pending requests are rejected; approved co-participation remains until the organizer acts. Blocked list in settings with unblock. Apple/Google UGC requirements (report, block, contact) are satisfied by this flow (SECURITY §10).

### FL-10 Account settings, export, deletion (F-08, F-29)
Settings: profile visibility, show reliability/badges, language, theme, marketing consent, notification list, export my data, delete account. Deletion: re-authentication → explanation of consequences (organized upcoming events are canceled; history is anonymized) → `PENDING_DELETION` with 30-day cancel option → purge. Sign-in during grace shows "Hesabın silinmek üzere — iptal et".

### FL-11 Admin moderation (F-28)
Admin signs in with MFA → queue of open reports sorted by age/severity → detail view (target snapshot, reporter, history of the target) → action (dismiss / hide event / cancel event / suspend user / hide review / verify or hide venue) with mandatory reason → audit + notification to affected user where appropriate → report closed. Dispute queue: attendance disputes with evidence from both sides.

## 3. Scenario coverage

| Scenario | Flows | Key rules exercised |
|---|---|---|
| A — 7v7 needing 14, 12 confirmed | FL-3, FL-4 | capacity 14, organizer approval, full state |
| B — volleyball newcomer | FL-1, FL-2 | filters (date/distance/skill/slots), pending approval |
| C — padel/tennis doubles | FL-3, FL-4 | format 2v2, capacity 4 |
| D — late cancellation | FL-5 | freed slot, FIFO waitlist, organizer-approved promotion |
| E — externally booked pitch | FL-3, FL-2 | booking-status label, cost info, no guarantee |

## 4. Notification catalogue (in-app, MVP)

| Type | Recipient | Trigger |
|---|---|---|
| `join_requested` | organizer | request/waitlist entry created |
| `participation_approved` / `_rejected` / `_waitlisted` / `_removed` | participant | organizer action |
| `spot_opened` | organizer | approved participant cancels / capacity raised with waitlist non-empty |
| `event_canceled` | all active participants | event canceled |
| `event_changed` | active participants | material change |
| `attendance_reminder` | organizer | `ends_at`, `+24 h` |
| `attendance_finalized` / `dispute_resolved` | participants | finalization / admin resolution |
| `review_window_open` | present participants | finalization |
| `badge_earned` / `level_up` | user | finalization / window close |
| `report_outcome` | reporter (generic) | report closed |
| `account_deletion_scheduled` / `_completed` | user | deletion flow |

Payloads carry ids only; copy is rendered client-side in the user's locale. De-duplicated by `dedupe_key`.

## 5. State and empty-state inventory

Every list defines: *loading skeleton*, *empty* (with call to action: "Henüz etkinlik yok — ilk etkinliği sen oluştur"), *error with retry*, *offline* (cached data banner), *permission* (location off → district picker). Every mutating button defines *pending*, *success toast*, *error message from DomainErrorCode*, *disabled with reason*.
