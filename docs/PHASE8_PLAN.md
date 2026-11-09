# Phase 8 plan: discovery and engagement

Status 2026-11-07: M1–M5 merged (#84–#87, #93); M6 phone verification built (in review).

The founder asked for these on 2026-11-07, after Phase 7. They move parts of ROADMAP "Later" (push, P-01) forward. Each milestone is one PR and leaves `pnpm check`, `db:test`, `test:integration` and web E2E green.

## Decisions taken (founder, 2026-11-07)

| Question | Decision |
|---|---|
| Sport choice on Discover | Court tiles instead of chips: a horizontally scrolling strip above the list, and the same tiles as a grid in the Filters sheet. Tapping one shows that sport's events |
| Date and time pickers | Our own scrolling wheel (iOS style), the same on iOS, Android and the web, for the event form and Discover. No new dependency |
| Automatic avatar | A character or icon drawing chosen by the person's first sport. The founder designs the drawings in another session and hands them over before the avatar PR |
| Own photo | The person may replace the automatic avatar with a photo; built in the same PR as the drawings |
| Avatar set | The founder's 22 drawings (a general one and ten sports, for women and for men), 2026-11-07 |
| Gender | Asked while filling in the profile: woman / man / rather not say. Private, never shown to others. "Rather not say" starts with the letters and sees every drawing |
| Switching | The own set first, "show all avatars" for the other one |
| Where the avatar shows | At the top left of the main screens, left of the province; it opens the profile |
| Push notifications | Two separate consents, both **off** by default: "events for you" and "reminders". A new account is asked once in a popup, and can turn either on right there |
| Reminder cap | At most **2 a week** (founder, 2026-11-07; the plan said 1), at least 48 hours apart |

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
- **Status 2026-11-07: built.**
  - `ui/WheelPicker`:
    - snaps on native with `snapToInterval` and settles after the wheel or a drag on the web;
    - a tap on a row picks it;
    - one `adjustable` control with increment and decrement, keyboard arrows, Page Up/Down and Home/End;
    - `aria-value*` set explicitly (the first E2E run showed React Native Web does not map `accessibilityValue`);
    - reduced motion stops the animated scroll.
  - `DateWheel` covers 365 days in the form and 90 on Discover, labelled Bugün, Yarın, then "12 Kas Per". `TimeWheel` has hours and 5-minute steps; an odd minute of an existing event stays on the wheel.
  - Discover's filter gained `day`. A picked day replaces the day chips and counts as one date filter. No RPC change: `search_events` already takes `from`/`to`.
  - **Tests:** domain (picked day, day boundaries), components (screen-reader steps, taps, both ends), and `e2e/wheels.spec.ts` (mouse wheel, keyboard, click, axe, and a whole form whose review shows 20:30).
  - **Not verified:** native momentum and snapping on a real iPhone or Android device.

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
- **Status 2026-11-07: built** (ADR-0027).
  - **Database:** migration `20261111100000_avatars.sql`:
    - the private `gender`, `avatar_key` and the `avatars` bucket;
    - storage policies with the player-card rule; a daily cap on photo changes;
    - administrator removal, recorded;
    - the avatar added to the player card, the event page (organizer and roster) and the console.
  - **App:**
    - onboarding asks for gender, saves the automatic drawing, then opens the avatar screen (skippable);
    - the avatar screen offers the drawings, the letters and an own photo;
    - the header avatar sits on Discover and My Events;
    - Edit profile changes the gender;
    - the deletion request deletes the photo first.
  - **Design changes from this plan:**
    - one photo path per change (`<user>/<uuid>.jpg`) instead of a fixed name, so a replace never overwrites;
    - no new report target: a photo is reported as the person (the "inappropriate content" reason), and the console removes it;
    - signed URLs come from the Storage API under the policy, not from an RPC;
    - the purge cannot delete bytes, so the app deletes them at the deletion request.
  - **Found and fixed by the tests:**
    - initials inside a named link failed axe 2.5.3, so the header and roster show a person icon there;
    - the onboarding redirect could open the avatar screen before the gender was saved;
    - the M2 date wheel, on the web, could take a scroll it did not ask for and move an edited event to today. It now changes value only on the person's own scroll.
  - **Tests:**
    - pgTAP 29 (26);
    - integration `avatars.test.ts` (13, against the real Storage API, with a mutation check on the block rule);
    - components (avatar screen, edit profile, onboarding, deletion);
    - E2E `avatars.spec.ts`: a 900 × 600 photo with GPS EXIF comes back 512 × 512 with no EXIF.
  - **Bundle:** the avatar screen is a lazy chunk. INITIAL 550 → 555, TOTAL 920 → 935, with the reason recorded.
  - **Not verified:** the picker, crop and upload on an iPhone or an Android device (a new development build is needed).

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

- **Status 2026-11-07: built** (ADR-0028).
  - **Database:**
    - migrations `20261112100000` (consent kinds) and `20261112110000`;
    - devices, the outbox and deliveries;
    - the sender in SQL with pg_cron and pg_net, checked at sending time;
    - the test message.
  - **App:**
    - `expo-notifications`, native only (`push-device.web.ts` is a stub);
    - `PushBridge` at the root: the one-time popup, refreshing the token, unregistering before sign-out (`lib/before-sign-out.ts`), opening the tapped event;
    - Settings › Bildirimler with both kinds and "Test bildirimi gönder".
  - **Design changes from this plan:**
    - one RPC for both choices (`set_push_consents`) instead of one per kind;
    - receipts are not read in the pilot; the tickets are;
    - the local and CI stacks switch the sender off in a dev seed.
  - **Tests:**
    - pgTAP 30 (14), and 06 extended;
    - integration `push.test.ts` (9): what is queued is checked inside a rolled-back transaction, and Expo's answers are inserted as pg_net stores them. A mutation check covers the active-account rule;
    - components `push.test.tsx` (11);
    - E2E `push.spec.ts`: the web never asks.
  - **Not verified:** delivery on a real phone. The founder builds iOS; Android is not run here.

### M5: events for you, and reminders

- **Events for you:**
  - a new published event matches when its sport is in the person's sport profiles, its district or city matches the profile's city, and its skill range covers the person's level (when the event has one);
  - **caps:** at most 1 a day per person; quiet hours 22:00–09:00 Europe/Istanbul; never for events the person organizes, has joined, or whose organizer they blocked or are blocked by.
- **Reminders:** at most 2 a week (founder, 2026-11-07), only after 7 days without opening the app, and only if there are upcoming events in the person's city. The text is neutral and comes from i18n in the person's locale.
- **Data model:** the outbox from M4 and a per-user send log for the caps; `app_config` knobs for the caps.
- **Tests:**
  - integration: matching, caps, quiet hours, blocks, consent withdrawn mid-queue;
  - a load check on fan-out for a busy city.
- **Status 2026-11-07: built** (migration `20261113100000`, ADR-0028).
  - **Events for you:** every 10 minutes. A published public event with room is eligible if it was published in the last 36 hours and starts 2 hours or later from now.
    - It goes to people who play its sport, live in its province, and fit its level range.
    - Never the organizer, a participant or a blocked pair; never the same event twice (`private.push_recommended`).
    - One a day (Istanbul day), and the soonest fitting event wins.
    - The text names the sport and the district.
  - **Reminders:** every hour. The person's phones have not opened the app for 7 days (the token refresh on start is the signal), and the province has upcoming games.
    - At most 2 in 7 days, at least 48 hours apart.
    - The text names the province and a count.
  - **Quiet hours** 22:00–09:00 Istanbul for both. Every limit is an `app_config` row.
  - **Design changes from this plan:**
    - the province is the match, not the district (a district is too small for a pilot);
    - the inactivity signal is the device's last start, since the app has no other "last opened";
    - the text arguments are catalog names stored with the message (`push_outbox.args`).
  - **Fan-out, measured** on the local stack in a rolled-back transaction (5,000 people with both consents, 50 new events in one province):
    - recommendations took 4.7 s at first. Checking each person once, then searching each person's soonest fitting event with `LATERAL … LIMIT 1`, brought it to **1.2 s**, most of it writing 5,000 messages;
    - reminders take 0.3 s;
    - the sender took 100 rows a minute, so a morning's 5,000 would have taken 50 minutes. It now takes 1,000 a run (10 requests of 100), so they leave in about 5 minutes.
  - **Tests:**
    - integration `push-producers.test.ts` (6): matching, exclusions, the daily limit, no repeat, quiet hours, the reminder limits, withdrawal. Three mutation checks: block, participation, quiet hours;
    - pgTAP 30 (20).
  - **Not verified:** delivery on a phone (as in M4).

### M6: phone verification (added by the founder, 2026-11-07)

- **Decisions:**
  - the purpose is to stop fake and duplicate accounts, so each number is on one account only;
  - Turkish mobiles only;
  - existing accounts verify at their next visit;
  - the SMS provider is not chosen yet.
- **Status 2026-11-07: built** (ADR-0029).
  - **Mechanism:** Supabase Auth's phone change (a texted code, `verifyOtp`).
  - **Database:** migration `20261114100000`. The `phone.required` switch (off) gates every write behind the onboarded-user guard. `get_my_account` reports both flags.
  - **App:**
    - `/verify-phone`, reached from the gate or from Settings › Telefon, which shows the masked number;
    - a 60-second resend wait;
    - plain messages for a taken number, a wrong code or a failed send.
  - **Found while building:** with phone confirmations off, Auth marks any number confirmed without a code. The local config now runs them on, as hosted must, and the surface check fails if they are off.
  - **Tests:**
    - domain (normalizing and masking);
    - pgTAP 31 (11: the switch, a foreign or unconfirmed number, browsing still open);
    - integration `phone.test.ts` (3: right and wrong code against real Auth, one number per account, foreign numbers ignored);
    - components (6: the gate, the screen);
    - E2E `phone.spec.ts` (Settings → texted code → verified; axe).
  - **Not verified:** a real SMS (no provider yet).

## Order and why

M1 and M2 are UI only and low risk. M3 waits for the drawings, but the photo half can come first. M4 is infrastructure and has device-only verification, so it comes before M5, which depends on it.

## Risks

- **Photos are user content.** Moderation load on one operator (R-9); counsel on images of people (KVKK).
- **Push is promotional messaging:** consent and wording for counsel (Law 6563, KVKK).
- **Push and native modules cannot be verified here.** iOS needs the founder's iPhone; Android needs a device or a cloud runner.
