# Phase 2 report: identity, onboarding and native validation

Status 2026-10-25. Scope: the Phase 2 preparation brief (8 decisions) and the Phase 2 roadmap items P2-M2…P2-M5. **Not started on purpose:** the Event Engine and anything commercial.

## 1. What was done

| # | Decision in the brief | Result |
|---|---|---|
| 1 | Move the repo out of OneDrive | **Done.** `C:\dev\matchup`, full git history; destination verified before anything else; the OneDrive copy was **not** deleted (the founder's call). |
| 2 | Android SDK + emulator | **Done**, portable under `C:\dev\tools`, no admin rights, no PATH changes (`docs/ANDROID_SETUP.md`). The SDK licences were accepted on the founder's behalf as part of the authorised setup. |
| 3 | Native Android validation first | **Done on an emulator, 22 automated checks pass** (§2). iOS is **pending**. Windows cannot build the native code (MAX_PATH, measured), so APKs are built in a pinned Linux container (ADR-0015). |
| 4 | Provisional logo; `docs/design.md` | **Done** (v0.1). The `ember`/`urgency` tokens are intentionally **not** added yet: nothing uses them until the Phase 3 event card. |
| 5 | Private GitHub repo + CI, no assumed auth | **Prepared only.** `scripts/github/setup-private-repo.ps1` (dry run by default) and `docs/GITHUB_SETUP.md`; `gh` is not authenticated and nothing was created or pushed. The four required-check names in the script match `ci.yml` exactly. **CI has never run on GitHub**; its steps were run locally instead (§2). |
| 6 | Consent + 18+ before public registration | **Done server- and client-side**, with **draft** legal text. Hosted public sign-up must stay disabled (§3). |
| 7 | CAPTCHA / rate-limit plan, enumeration risk | **Measured and documented, not integrated.** All three auth endpoints leak registered-vs-unregistered; CAPTCHA works server-side in a lab but only raises cost; no Edge proxy (ADR-0016, `docs/AUTH_ABUSE.md`). |
| 8 | Bundle analysis + plan | **Done**: tooling, a measured plan and two optimizations (§4, `docs/PERFORMANCE.md`). |

Roadmap items: **P2-M2** reference catalog (10 sports, 19 formats, 20 positions, Ankara + 25 districts, guest-readable) · **P2-M3** profile / sport-profile / settings RPCs (incl. an atomic `replace_my_sport_profiles`) · **P2-M4** server-side onboarding gate (`private.assert_onboarded_user`) with 18+ and versioned consent evidence · **P2-M5** profile, edit-profile, edit-sports and settings screens. Avatar upload was deferred as agreed. An in-app **language selector** (tr/en, stored on the device) was added at the founder's request.

## 2. What was actually tested

| Level | Result |
|---|---|
| pgTAP (schema, RLS, grants, negative paths, atomicity) | **158 pass** |
| API integration (real PostgREST + Auth + Mailpit, incl. parallel onboarding/saves) | **72 pass** |
| `@matchup/domain` / `@matchup/config` | 42 / 4 pass |
| App unit + component tests | **236 pass** |
| Web E2E (Playwright, Chromium) incl. axe WCAG 2.2 AA on account, onboarding, legal and profile screens | **40 pass** |
| `pnpm check` (typecheck, lint, format, brand, scripts, unit) | exit 0 |
| **Android emulator** (Android 16, API 36, x86_64, debug build, Metro) | **22/22 pass**: cold start, sign-up, emailed link as a deep link, onboarding rules, profile editing, session persistence after process kill, sign-out, wrong password, server unreachable and recovery, forged link, deep links, Turkish UI, in-app language, no native crash, empty JS error log. Onboarding and profile checks also **query the database** and compare it with what the UI did. |

Not tested, stated plainly: **physical Android devices, release (minified) builds, a real TalkBack walk-through, landscape/large-font, iOS, Firefox/Safari, the GitHub CI itself, anything against a hosted Supabase project.** The emulator has no on-screen keyboard, so one behaviour (first tap on a button after injected text is swallowed) is unexplained and unconfirmed for real phones (`docs/NATIVE_VALIDATION.md`).

Defects that native/web testing surfaced and that were fixed: **PKCE silently degraded to `plain` with a `Math.random()` verifier on Hermes** (security; fixed with an `expo-crypto` polyfill + RFC 7636 test vector), tab bar under the gesture bar, duplicate TalkBack stops on form fields, a profile-visibility policy that hid every "public" profile (RLS subquery; mutation-checked), radio/checkbox state missing for screen readers on web (axe), Maestro/Metro harness traps. Process slips, owned: one commit was made with a failing check (fixed in the next commit; commits are now gated on exit codes), and tests that assumed an empty database (now scoped to their own fixtures).

## 3. Outstanding risks and open items

**Blocks public launch**
- Legal texts are **drafts** (`legal.draft = true`); nothing here is legal advice or a compliance claim. 18+ is a self-declaration. Counsel must review (⚖).
- Hosted Supabase is **not connected**; public sign-up must stay **disabled** there. CAPTCHA is **not built** in the app; hosted rate limits are **unverified** (the local stack does not throttle password sign-in at all).
- **Enumeration is not prevented** and cannot be by us (sign-up content, sign-in timing, reset cooldown). Accepted and written down; counsel to confirm (ADR-0016).
- Account deletion and data export (SECURITY §8) are **not built**. No re-consent screen for existing users when legal versions change.

**Quality**
- iOS and physical-device validation are open; first-tap-after-text quirk unexplained.
- Initial web JS is **~522 kB gzip against a 350 kB target**; the framework alone is ~290 kB, so the target needs a decision, not just trimming (`docs/PERFORMANCE.md`). Tab icons ship a full icon font table (−~140 kB possible).
- `user_settings.locale` is stored on save but the device choice wins; no cross-device sync of language/theme.
- Viewing *another* user's profile has a policy and tests but no screen yet (Phase 3 with events).

**Housekeeping needing the founder**
- GitHub: `gh auth login` + owner name, then the setup script (dry run first).
- Supabase hosted project (region), Expo/EAS account, store identifiers (outward-facing; not touched).
- Delete the old OneDrive copy when satisfied.

## 4. Performance work in numbers

Total web JS 1113 → **1051 kB gzip** (zod/mini + stubbing zod's unused locale/JSON-Schema modules; earlier −196 kB from three unused native libraries); initial scripts ~**522 kB**; ratchets now 1080 kB total / 540 kB initial. Sentry (≈ a third of the total) is already lazy and only loads with a DSN. Details and the ranked plan: `docs/PERFORMANCE.md`.

## 5. Readiness for Phase 3 (Event Engine)

**Ready, on the local stack:** the server gate every write RPC must start with; catalog tables with formats (capacity bounds) and positions; profile and sport levels; the concurrency test harness; a working native bench with database assertions; domain error codes and the i18n/error-text pattern; CI definition that already runs pgTAP, integration, web e2e and the bundle ratchets.

**Decide or do before/at the start of Phase 3:**
1. Geography: PostGIS and district centroids arrive with events (ROADMAP Phase 3/4); `EVENT_PEERS` visibility needs the participation tables.
2. Tab icons approach and the `ember`/`urgency` tokens (event card, `docs/design.md`); the bundle-target decision.
3. Connect GitHub (CI must go green once on a real runner) and decide whether the pilot is closed/invite-only.
4. Keep real users out until §3 "Blocks public launch" is closed.

**Verdict:** Phase 3 can start, building on the local stack. The product is **not** ready to take real users.
