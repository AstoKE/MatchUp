# Phase 8 plan: discovery and engagement

Status 2026-11-07: planned; M1 built (in review).

The founder asked for these on 2026-11-07, after Phase 7. They move parts of ROADMAP "Later" (push, P-01) forward. Each milestone is one PR and leaves `pnpm check`, `db:test`, `test:integration` and web E2E green.

## Decisions taken (founder, 2026-11-07)

| Question | Decision |
|---|---|
| Sport choice on Discover | Court tiles instead of chips: a horizontally scrolling strip above the list, and the same tiles as a grid in the Filters sheet. Tapping one shows that sport's events |
| Date and time pickers | Our own scrolling wheel (iOS style), the same on iOS, Android and the web, for the event form and Discover. No new dependency |
| Automatic avatar | A character or icon drawing chosen by the person's first sport. The founder designs the drawings in another session and hands them over before the avatar PR |
| Own photo | The person may replace the automatic avatar with a photo |
| Push notifications | Two separate consents, both **off** by default: "events for you" and "reminders". A new account is asked once in a popup, and can turn either on right there |

## Milestones

### M1: court tiles on Discover

- **Objective:**
  - the sport strip becomes compact court tiles with radio semantics (`aria-checked`);
  - the Filters sheet gets the same tiles as a grid, bound to the same choice.
- **Files:**
  - `ui/components/CourtTile.tsx` (a compact, selectable variant);
  - `features/events/components/DiscoverSports.tsx`, `DiscoverFilters.tsx` and `DiscoverScreen.tsx`;
  - `docs/design.md` §5.1.
- **Data model, security:** none.
- **Tests:**
  - components: choosing from the strip and from the sheet, and the selected state read out;
  - E2E: Discover flows, axe, the keyboard path.
- **Status 2026-11-07: built.**
  - On a phone the strip is one scrolling line of 116 px tiles.
  - On wider screens, and in the sheet, the tiles sit in a measured grid of equal columns (at least 100 px each). All eleven fit one row on a desktop, and a short last row does not stretch.
  - The first E2E run caught that a hidden-scrollbar line cannot be scrolled with a mouse, so wide screens do not scroll.
  - The founder's review found the "All sports" tile broken at medium widths. Its name wrapped next to the check and stretched its whole row, and the 88 px minimum left empty space under every name. Fixed:
    - the check sits in a corner badge;
    - a compact tile is as tall as its content;
    - "All sports" shows four court colors instead of an empty frame.
  - Checked on screenshots at 390, 640, 760, 1024 and 1280 px, and in the sheet.

### M2: wheel date and time pickers

- **Objective:**
  - a `WheelPicker` in `ui` (scroll snapping, momentum on native, wheel and drag on the web; `adjustable` with increment and decrement for screen readers, arrow keys on the web, reduced motion respected);
  - `DateWheel` (day, month, year; only valid days) and `TimeWheel` (hours, minutes in steps of 5) built on it;
  - in the event form, they replace the typed date and time. The quick day chips stay.
  - On Discover, a "Pick a date" choice next to Today, Tomorrow and This week.
- **Data model:** Discover's filter gains a single day. `search_events` already takes a time window; check before adding anything. If an RPC must change, the change is additive.
- **Tests:**
  - domain: valid days, time zone and DST edges;
  - components: keyboard and screen-reader adjustments;
  - E2E: creating an event with the wheels;
  - axe.

### M3: avatars and profile photos

- **Objective:**
  - an automatic avatar from the first sport in the profile (the founder's drawings);
  - an optional own photo: pick, square-crop, resize to 512 px and re-encode as JPEG, which strips EXIF and GPS. Remove it to go back to the automatic avatar.
- **Data model:**
  - a private Storage bucket `avatars` (one object per user, path = user id);
  - `profiles.avatar_path` (exists) is set and cleared through an RPC;
  - read access follows profile visibility and blocks, through signed URLs from an RPC;
  - the purge deletes the object, and the export includes it.
- **Security:**
  - photos are user content. Report a profile photo (new report target or reason); an admin can remove a photo (audited);
  - size and type are checked server-side (bucket limits: 1 MB, `image/jpeg`).
- **New dependencies:** `expo-image-picker` and `expo-image-manipulator` (via `npx expo install`). These are native modules, so they need a new development build.
- **Tests:**
  - pgTAP: bucket policies, a stranger and a blocked person refused;
  - integration: upload and remove; purge and export;
  - components and E2E on the web (file input).
- **Blocked on:** the founder's drawings. The photo part can be built first.

### M4: push foundation

- **Objective:** register devices for push, and send through Expo's push service.
- **Data model:**
  - `push_devices`: user, Expo token, platform, last seen; RLS own rows; RPCs `register_push_device` and `unregister_push_device`;
  - consent kinds `PUSH_RECOMMENDATIONS` and `PUSH_REMINDERS` (versioned like the others);
  - an outbox table drained by a scheduled sender. Delivery goes from Postgres through `pg_net` to Expo, or through an Edge Function if receipts need handling.
- **Popup:** after onboarding, once. It explains both kinds, has two switches (off) and "Not now". The OS permission is asked only if one is switched on.
- **Payloads:** no PII, free text or coordinates in a payload (CLAUDE.md). A push says "a new football game near you" and opens the event; the details load in the app.
- **ADR:** push moves from "Later" into the MVP, with the consent model and the provider (Expo and, behind it, FCM/APNs). Privacy Notice paragraph for counsel.
- **Verification limits:**
  - push cannot be received in a simulator or on the web;
  - Android is not run on this laptop;
  - iOS needs an APNs key in EAS and a physical iPhone.

  The server side is tested locally against a fake Expo endpoint.

### M5: events for you, and reminders

- **Events for you:**
  - a new published event matches when its sport is in the person's sport profiles, its district or city matches the profile's city, and its skill range covers the person's level (when the event has one);
  - **caps:** at most 1 a day per person; quiet hours 22:00–09:00 Europe/Istanbul; never for events the person organizes, has joined, or whose organizer they blocked or are blocked by.
- **Reminders:** at most 1 a week, only after 7 days without opening the app, and only if there are upcoming events in the person's city. The text is neutral and comes from i18n in the person's locale.
- **Data model:** the outbox from M4 and a per-user send log for the caps; `app_config` knobs for the caps.
- **Tests:**
  - integration: matching, caps, quiet hours, blocks, consent withdrawn mid-queue;
  - a load check on fan-out for a busy city.

## Order and why

M1 and M2 are UI only and low risk. M3 waits for the drawings, but the photo half can come first. M4 is infrastructure and has device-only verification, so it comes before M5, which depends on it.

## Risks

- **Photos are user content.** Moderation load on one operator (R-9); counsel on images of people (KVKK).
- **Push is promotional messaging:** consent and wording for counsel (Law 6563, KVKK).
- **Push and native modules cannot be verified here.** iOS needs the founder's iPhone; Android needs a device or a cloud runner.
