# ADR-0028: Push notifications through Expo, sent from Postgres, behind two separate consents

**Status:** Accepted (Phase 8 M4, 2026-11-07). Moves push (ROADMAP P-01) from "Later" into the MVP.

## Context

The founder asked for two kinds of push: events that suit the person, and occasional reminders to come back. Both are promotional in character. Turkish law (KVKK, and Law 6563 for commercial electronic messages) points to explicit, separate, revocable consent.

The app already has in-app notifications. It had no push, no device registry and no sender.

## Decision

1. **Two consents, both off by default.**
   - `PUSH_RECOMMENDATIONS` ("events for you") and `PUSH_REMINDERS` are versioned like the others in `user_consents`, with `user_settings.push_*_at` as the current state.
   - A person is asked **once per account** in a popup after onboarding. Both switches start off, and "Not now" is a full answer. The answer is recorded in `push_prompted_at`.
   - Settings › Notifications changes either kind at any time.
   - The OS permission is requested only when a kind is switched on.
2. **Provider: the Expo push service** (it relays to APNs and FCM), with tokens from `expo-notifications`.
   - No Firebase SDK and no APNs code in the app.
   - Expo is a processor that receives the token and the message text (counsel: the transfer, LAUNCH_CHECKLIST).
3. **Devices.** `push_devices` holds one row per Expo token.
   - A token belongs to the device. When another person signs in on it, the token moves to them.
   - The app **unregisters the token before signing out** (`lib/before-sign-out.ts`), so a shared phone never shows the previous person's notifications.
   - At most 10 devices per person.
   - Tokens Expo reports as `DeviceNotRegistered` are deleted.
4. **Sending from Postgres, no Edge Function.** Producers insert into `push_outbox`.
   - Every minute `pg_cron` runs `private.push_dispatch()`. It takes up to 100 pending rows, builds one message per device of each person who may receive it, and sends them with `pg_net` in requests of at most 100.
   - `private.push_collect()` reads Expo's tickets in order.
   - Consent and account state are checked **at sending time**, so a withdrawal stops queued messages.
   - There is no secret anywhere. The local and CI stacks switch the sender off in a dev seed, so tests never reach Expo.
5. **Payloads** carry a fixed title and body in the person's language (`private.push_text`), and at most a kind and an event id. Never a name, free text or coordinates. A tap opens the event, and its details load in the app under the usual rules.
6. **The web has no push** in the MVP. `push-device.web.ts` is a stub, Settings points to the phone app, and `expo-notifications` is not in the web bundle.
7. **A test message** (`send_test_push`, 3 a day) lets a person, and the founder on a real phone, check delivery without any consent, because it is asked for.
8. **The producers (M5, built):**
   - "events for you": a new public game in the person's sport, province and level range, at most 1 a day;
   - reminders: after 7 days away, when the province has games, at most **2 a week** (founder, 2026-11-07), 48 hours apart;
   - nothing between 22:00 and 09:00 Istanbul;
   - details in PHASE8_PLAN M5.

## Consequences

**Positive**
- One small mechanism, all in the database, tested like the rest.
- No service credential to keep.
- Consent and privacy are enforced where the data is.

**Negative**
- Delivery cannot be verified in a simulator or on the web.
  - iOS needs an APNs key in EAS credentials and a real iPhone.
  - Android needs an FCM key, and Android is not run on this machine.
- Expo's "enhanced push security" (an access token on every send) is not used. Anyone holding a token could send to that device, but tokens never leave our database and the device. Turning it on needs a secret in Vault and a header in `push_dispatch`.
- A minute of latency, and Expo's receipts (the second, later status) are not read in the pilot. Tickets catch the common errors.
- Existing accounts are asked once too (they have no `push_prompted_at`).
