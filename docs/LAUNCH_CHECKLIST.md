# Pilot launch checklist

Status 2026-11-07, rewritten for the **Turkey-wide pilot** ([PHASE7_PLAN](PHASE7_PLAN.md)). Hosted Supabase (Paris, ADR-0018) holds every migration up to Phase 4 and no real users. Public sign-up opens with CAPTCHA and the new-account limits (ADR-0026, 2026-11-07), but only after the steps of DEPLOYMENT §14. Until then it stays **disabled** on hosted. The founder accepts that the legal texts are still drafts when sign-up opens; the ⚖ items stay open and are not waived. This is not legal advice; items marked ⚖ need a qualified lawyer.

Each open item names its **owner**:
- **code** is done in the repository, with tests;
- **founder** is a dashboard, account or device action, for which the milestone gives exact steps;
- **counsel** is the lawyer.

It also names the Phase 7 milestone where it is handled.

## 1. Legal (⚖ blocks launch)

- [ ] **counsel, M7:** Terms of Use and Privacy Notice reviewed and approved (`apps/app/src/locales/{tr,en}/legal.json` are drafts).
- [ ] **counsel, M7:** data controller identity, contact, retention periods, deletion/export procedure and KVKK information duties in the Privacy Notice (SECURITY §8).
- [ ] **counsel, M7:** the map provider named in the Privacy Notice. Proposed wording in PHASE4_REPORT §6: MapTiler receives tile requests (approximate area, IP address); "near me" reads the position once and never stores it. Also MapTiler's role and the transfer to Switzerland.
- [ ] **counsel, M4:** review the usage-analytics consent text (Settings, `ANALYTICS` v1; built opt-in, off by default, withdrawable with deletion, ADR-0025) and its Privacy Notice paragraph (PHASE7_PLAN M4). Marketing is already a separate, optional, revocable consent.
- [ ] **code, M7 (after counsel):** publish the texts as a **new version**: a migration changes `legal.terms_version` / `legal.privacy_version` in `app_config` and sets `legal.draft` to `false`.
  - New users accept the new versions in onboarding (`CONSENT_VERSION_MISMATCH` otherwise).
  - Already-onboarded users are re-prompted by the re-consent gate (built: writes return `CONSENT_REQUIRED`).
  - Counsel decides whether someone who declines may keep browsing guest-readable content (current behaviour).
- [ ] **counsel, M7:** whether the 18+ self-declaration (checkbox + server timestamp) is sufficient.
- [ ] **counsel, Phase 8:** gender and profile photos (ADR-0027, SECURITY §8 item 13).
  - The purpose wording for the gender question, and its Privacy Notice paragraph.
  - Photos of people, their retention and their moderation.
  - Bytes left in storage when an upload is interrupted (unreadable, no sweeper yet).

## 2. Accounts, abuse and enumeration

- [x] **founder, M7: how pilot users get accounts.** Decided 2026-11-07: (c) open sign-up with CAPTCHA and the existing new-account quotas (ADR-0026). The draft-legal-text risk is accepted by the founder.
- [ ] **founder, M7:** open sign-up following DEPLOYMENT §14 in order, then `hosted-surface.mjs --signup open` shows PASS for sign-up and CAPTCHA.
- [ ] **founder + code, M2:** CAPTCHA on sign-up, sign-in and password reset (Turnstile).
  - **App side built and unit-tested** (`EXPO_PUBLIC_TURNSTILE_SITE_KEY`, web widget and native WebView, AUTH_ABUSE §5).
  - Open: the Turnstile account and site key with the production hostname; the secret in hosted Auth; the site key in the production build (enable both together: a mismatch blocks every sign-in); the native widget on a device; counsel on Turnstile as a processor (⚖).
- [ ] **founder, M2:** Auth rate limits reviewed on hosted (sign-in, sign-up, email send, token verification, anonymous IP limits).
- [ ] **founder, M2:** leaked-password protection (HaveIBeenPwned) enabled on hosted, if the plan offers it (the advisor flags it as off).
- [ ] **founder, M2:** email through a real SMTP provider with SPF/DKIM (the hosted default is rate limited and not for production).
- [ ] **founder, M2:** re-run `node scripts/auth-probe.mjs` against hosted and record the numbers in AUTH_ABUSE.
  - Known locally (ADR-0016): all three endpoints leak (sign-up 422 vs 200, sign-in timing, reset cooldown 429).
  - We do not claim to prevent enumeration; counsel confirms the residual risk (⚖).
- [x] **code, M2:** security review of every RPC and RLS policy, kept as a reviewed inventory that CI compares (docs/SECURITY_REVIEW.md); S7-1 fixed with its test.
- [ ] **founder, M2:** run `scripts/security/hosted-surface.mjs` against hosted and act on any FAIL/WARN (pg_graphql; add `--signup open` once sign-up is on).
- [ ] **founder, when hosting the web:** the response headers of DEPLOYMENT §12 (CSP report-only first).

## 3. Operations

- [ ] **founder, M7:** who answers reports and how fast. The runbook proposes: reports within 24 h, disputes within 48 h, support email within 2 working days, one founder as operator (OPERATIONS §7). Confirm, or name a second administrator.
- [x] **code, M7:** the admin runbook `docs/OPERATIONS.md`: reports, suspensions and appeals, flags, venues, deletion and KVKK requests, spam waves, outages, breaches.
- [ ] **founder + code, M7:** a support contact reachable from the app and from the suspended-account page.
  - **Built:** Settings › Destek and the suspended page show `brand.contact.supportEmail` as a mail link, or a placeholder while it is empty. A production build refuses to start without it.
  - **Open (founder):** the address itself, and someone reading that inbox.
- [ ] **founder, M2:** the first administrator and TOTP on hosted (DEPLOYMENT §11).
- [ ] **founder + code, M2:** a profanity list for display names, if wanted.
- [ ] **counsel, M7:** retention of reports and moderation notes (⚖).
- [ ] **founder, M4:** backups / point-in-time recovery enabled and **a restore rehearsed**.
- [ ] **founder, M4:** the health endpoint watched by an external monitor.
- [ ] **founder + code, M4:** the error reporting DSN set for hosted builds, and the redaction rules reviewed against real events.

## 4. Platform

- [x] Hosted project region chosen (Paris, ADR-0018), migrations applied with `supabase db push` (last on 2026-11-07, DEPLOYMENT §9), types checked for drift in CI. Data residency stays a question for counsel (⚖).
- [ ] **founder, M2:** the redirect URL allow-list holds only the real web origin and the app's deep-link scheme (no wildcards); site URL set.
- [ ] **founder:** the service-role key only in server-side secret stores, never in the app or `app_config` (the bundle secret scan guards the app side).
- [ ] **founder, M2:** the MapTiler key restricted to the production web origin(s), the bundle id and the package name; set in EAS environment variables and on the web host, never committed.
- [ ] **founder + code, M6:** Android: native run of Phases 4–6 (flows N23–N25 written, unrun; not on the 15 GB laptop, see NATIVE_VALIDATION) and a signed release build on a physical device. iOS: checked by hand on a real iPhone (2026-11-07); still open are the signed App Store build and final identifiers (ADR-0010).
- [x] **code, M3:** load scenarios (ARCHITECTURE §8) at 100k events / 500k participations within budget, on the local stack (PERFORMANCE §4b). Not run against hosted.

## 5. Product

- [x] Report and block flows exist before any user-to-user content (Phase 6: reports, blocks, admin moderation with a second factor).
- [x] Account deletion and data export in the app (ADR-0017: 30-day grace, password re-entry, daily purge, JSON export; event, review, report, block and venue data included).
  - Still open: retention of consent evidence and whether suspended accounts may self-delete (counsel ⚖); storage cleanup when avatars arrive; `pg_cron` and the purge job verified on hosted (founder, M4); the native share sheet on a device (M6).
- [ ] **code, M1:** the whole life of an event in one end-to-end flow, green in CI (F-35).
- [x] **code, M5:** accessibility: axe on every route at two widths, a keyboard-only path (it found and fixed the cards' Enter), the manual list prepared (docs/A11Y_CHECKLIST.md).
- [ ] **founder + code, M6:** docs/A11Y_CHECKLIST.md filled in with VoiceOver and TalkBack on devices.
- [ ] **founder, M5:** the Turkish copy read by a native speaker from docs/COPY_REVIEW.md (912 strings; regenerate with `node scripts/i18n/export-copy.mjs`) (F-32).
- [ ] **founder, M7:** store listings and identifiers decided. Nothing is published without the founder's go.
