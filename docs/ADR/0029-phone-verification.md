# ADR-0029: Phone verification by SMS: one Turkish mobile number per account

**Status:** Accepted (Phase 8, 2026-11-07). Amends SECURITY §7 ("no phone number") and ADR-0026 (prerequisites for open sign-up).

## Context

Sign-up opens to the public with CAPTCHA and the new-account quotas (ADR-0026). The founder asked for a phone check on top of email confirmation, and chose these options:
- the purpose is to stop fake and duplicate accounts;
- the number must be a Turkish mobile;
- existing accounts verify at their next visit;
- the SMS provider is not chosen yet.

## Decision

1. **Mechanism: Supabase Auth's own phone change.**
   - `updateUser({ phone })` texts a code, and `verifyOtp({ type: 'phone_change' })` confirms it. There is no new table, function or secret of ours.
   - Auth keeps a number on **one account only** (`phone_exists`). A pending number counts for nothing until its code is confirmed.
2. **Only Turkish mobiles (+90 5xx).** The app normalizes what people type (`normalizeTurkishMobile`). The database counts only a confirmed `905` followed by nine digits (`private.phone_verified`).
3. **Enforced in the database.** With `app_config` `phone.required` on, `private.assert_onboarded_user` raises `PHONE_NOT_VERIFIED`. That guard sits behind every write after onboarding, and some reads (the player card).
   - Browsing, onboarding itself, re-consent and account deletion stay open.
   - `get_my_account` gains `phone_verified` and `phone_required`. The app's gate (`RequireOnboarded`) sends the person to `/verify-phone` and back.
4. **The switch starts off.** Hosted has no SMS provider yet, and switching on early would lock everyone out. The founder switches it on after the provider works (DEPLOYMENT §14). Existing accounts then verify at their next visit.
5. **Confirmations must stay on.** Off, Auth marks any number confirmed without a code (observed on the local stack). `hosted-surface.mjs` fails on `phone_autoconfirm`. The local and CI stacks run with confirmations on and fixed test codes for +90 555 000 00 01–80, so no SMS is ever sent by tests.
6. **Privacy.** The number stays in `auth.users`.
   - It is never shown to anyone. Its owner sees it masked (`+90 532 *** ** 67`) in Settings, and it is included in their export.
   - The purge deletes it with the Auth user.
7. **Provider-neutral.** Twilio, MessageBird or Vonage can be configured in the dashboard, or a Turkish provider through Auth's Send SMS hook (a small Edge Function, not built). The choice is the founder's.

## Consequences

**Positive**
- A second account needs a second Turkish SIM: fake and duplicate accounts get expensive.
- No new moving parts of ours.
- Enforcement is server-side and switchable without a release.

**Negative**
- **Cost:** one SMS per verification, plus resends.
- **SMS pumping fraud:**
  - only signed-in, email-confirmed people can request a code;
  - Auth rate limits apply;
  - the provider must allow Turkey only (Twilio geo permissions), which is a founder step;
  - the server ignores foreign numbers, but cannot stop a text being sent to one. The geo restriction is what does.
- **Phone sign-in:** configuring an SMS provider can switch on sign-in by SMS code for confirmed numbers. That is a second way in (SIM-swap risk). The surface check warns, and DEPLOYMENT §14 says to keep it off if the dashboard allows.
- **Collecting phone numbers** is new personal data: purpose wording, retention and the Privacy Notice need counsel (SECURITY §8 item 15). In Turkey a branded sender name needs registration with the provider.
- Older installed apps without the gate get `PHONE_NOT_VERIFIED` on writes once the switch is on. The pilot has no public installs yet.
