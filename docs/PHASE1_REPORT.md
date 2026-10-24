# Phase 1 — Foundation: Final Report

Date: 2026-10-24 · Status: **Phase 1 complete, with the documented gaps below.** Phase 2 has **not** been started.

## 1. Completion criteria

| # | Criterion | Result | Evidence / caveat |
|---|---|---|---|
| 1 | Runs locally in supported dev environments | ✔ **Web**; ✖ not run on Android/iOS | Expo dev server (Metro) served the app with zero console errors; static export; local Supabase stack. Native: bundles compile, never launched (§5) |
| 2 | Expo Web renders correctly | ✔ | 28 Playwright tests in Chromium incl. layout at 375/800/1280 px, light + dark screenshots reviewed, axe (WCAG 2.2 AA tags) clean on 8 pages |
| 3 | Android/iOS status documented with real results | ✔ documented, no device results exist | §5, DEVELOPMENT §5 |
| 4 | Auth infrastructure implemented and tested | ✔ | Sign-up/verify/sign-in/out/reset against the real local Auth + Mailpit (integration + E2E) |
| 5 | Migrations and baseline policies reproducible | ✔ | `db reset` from scratch; **fresh clone** in another directory ran pgTAP, integration, drift check and E2E green |
| 6 | Typecheck, lint, tests pass | ✔ | §3. (One lint error slipped into commit `eaa28da`; fixed in `aba3f8f`. A pipe masked the exit code — gating now uses real exit codes) |
| 7 | CI exists and is validated where possible | ◐ | `.github/workflows/ci.yml` is **actionlint-clean** and every job's steps were executed locally (fresh clone). It has **never run on GitHub** — there is no remote. Hosted-only steps (gitleaks action, `apt` Chromium deps, `supabase/setup` on a runner) are unverified |
| 8 | Documentation matches implementation | ✔ | ARCHITECTURE §3/§6, SECURITY, DATABASE, TESTING, DEPLOYMENT, ROADMAP, README, CLAUDE.md updated; DEVELOPMENT.md and ADR-0014 added; link check passes |
| 9 | No known critical security issues | ✔ | One medium-severity residual (sign-up enumeration signal), one dev-tooling advisory (accepted, scoped). §4 |

## 2. What was built

| Milestone | Commit | Delivered |
|---|---|---|
| Baseline | `0e124d7` | Phase 0 docs committed (secrets and the local sound-hook `settings.json` excluded; the hook file was never changed — see §6) |
| M0 | `b0ef76b` | SDK 58 compatibility spike **passed**; no fallback to SDK 57. Report: PHASE1_M0_REPORT.md |
| M1 | `1e6dac8` | pnpm workspace, strict TS 6, ESLint 9 + import-boundary rules, Prettier, husky, Zod-validated public env (rejects service-role keys), brand-literal check, CI |
| M2 | `0437400` | Turkish-first i18n (tr/en parity + placeholder + error-code coverage tests), Istanbul-time and dotless-I formatting, provisional logo |
| M3 | `7761bba` | Design tokens (light/dark, 38 contrast pairs asserted), theme, 9 base components |
| M4 | `9816f3b` | Expo Router shell, data-driven 4-tab nav (Community reserved), bottom bar / left rail, guest browsing + protected-route redirect, error boundary, skip link, landmarks |
| M5 | `60becca` | Supabase config, **migration 0001** (deny-by-default grants, RLS everywhere, identity tables, hardened `SECURITY DEFINER` helpers), 48 pgTAP tests (mutation-verified), type generation + drift check, `health` Edge Function |
| M6 | `9a5aad3` | Supabase client + session storage, session provider, 5 account screens, enumeration-safe/open-redirect-safe flows, 32 integration + 12 E2E auth tests (at that milestone), bundle secret scanner |
| M7 | `80c5e98` | Logger, redaction, Sentry scrubbing (inactive without DSN), health-function tests, bundle-size ratchet |
| M8 | `eaa28da`, `aba3f8f` | Multi-connection concurrency harness proven to detect lost updates and capacity oversell; coverage gates |
| M9 | this commit | Fresh-clone verification, secret scan of history, dev-server proof, docs sync, this report |

## 3. Test results (all executed on 2026-10-24 on this machine)

| Layer | Tool | Result |
|---|---|---|
| Type check (app + e2e + packages) | tsc 6.0.3 strict | 0 errors |
| Lint | ESLint 9.39.5 | 0 errors, 0 warnings |
| Format | Prettier 3.9.10 | clean |
| Unit — domain | Vitest 5.0.5 | **24** passed (statements 93.5 %, branches 100 %, lines 100 %; gates 90/85/90) |
| Unit — config | Vitest | **4** passed (100 %) |
| Component/unit — app | jest-expo 58 / Jest 30 / RNTL 14 | **189** passed (10 suites) |
| Repo scripts | node:test | **6** passed |
| Database | pgTAP | **48** passed (10 structural + 38 behavioural, incl. negative authorization) |
| Integration (real Postgres/Auth/PostgREST/Edge/Mailpit) | Vitest + pg | **43** passed (Data API exposure 22, auth flows 10, health 4, concurrency harness 7) |
| Web E2E | Playwright 1.64.1 + axe 4.14 | **28** passed (shell 16, auth/a11y 12) |
| Native bundle compile | Metro + Hermes | Android and iOS `.hbc` produced |
| expo-doctor | 20 checks | 20/20 |
| Dependency audit (prod, high) | pnpm audit | clean except 1 *ignored* advisory (§4) |
| Secret scan | gitleaks (Docker) over all 12 commits existing at scan time | no leaks (4 synthetic test fixtures allow-listed by exact value; negative control proved real-looking keys are still caught) |
| Workflow lint | actionlint 1.7.12 (checksum verified) | no findings |

**Mutation checks (the security tests have teeth):** granting `UPDATE` on `profiles`, disabling RLS on `user_settings`, and adding a `SECURITY DEFINER` function without `search_path` each made the pgTAP suite fail in several places; baseline restored afterwards.

## 4. Security review of the Phase 1 surface

| Requirement from the brief | How it is met | Verified by |
|---|---|---|
| Every `SECURITY DEFINER` function: controlled `search_path` | all set `search_path = ''` | pgTAP #5 (scans *all* functions, fails CI for any future violation) |
| Schema-qualify sensitive references | `public.`/`auth.`/`pg_catalog.` throughout | code review of migration 0001 |
| Revoke unintended default execute; grant minimally | default privileges revoked for `postgres`; explicit `revoke … from public, anon, authenticated` then targeted `grant` per function | pgTAP #6, #7 (no PUBLIC execute; anon executes **nothing** in Phase 1) |
| Enforce auth/ownership/authorization inside functions | `get_my_account` checks `auth.uid()`; `assert_active_verified_user` enforces verified + active | pgTAP (guest, unverified, suspended, no-subject token) + integration (real JWTs) |
| Negative-path security tests | forged writes, privilege escalation, IDOR, private-schema routability, guest reads, replayed/stolen PKCE code | 48 pgTAP + 22 API-exposure + auth-flow tests |
| No service-role/secrets in clients | env validator rejects `service_role` JWTs and `sb_secret_*`; bundle scanner in CI; only the anon key reaches the app | unit tests, scanner tests (incl. against the real local service key), exported-bundle scan |
| Reproducible local DB + policy tests | `pnpm db:start/reset/test`, fresh-clone run | §1 #5 |

**Known issues (none critical):**
1. **Medium — sign-up enumeration signal.** `422 user_already_exists` for confirmed addresses (pinned by a test; UI is uniform). Needs CAPTCHA + CDN rate limits (+ possibly an Edge Function front) before launch. ADR-0014.
2. **Low (accepted, scoped)** — `node-forge ≤1.4.0` advisory (GHSA-86w9-cpqp-85rv) reached only through Expo's CLI dev tooling, never bundled; no patched release exists. Allow-listed in `pnpm-workspace.yaml` with the reason; revisit on every Expo bump. (A second advisory, zod < 4.6.6 inside the CLI, is fixed by an override.)
3. **Hosted-only protections are not testable locally** and are therefore **unverified**: leaked-password protection, CAPTCHA, custom SMTP/SPF/DKIM, production rate limits, JWT/session settings on a hosted project. They are listed in DEPLOYMENT's readiness checklist.
4. Web session lives in `localStorage` (supabase-js default) → CSP/headers are a launch prerequisite (ADR-0014).
5. Terms/Privacy acceptance and the 18+ confirmation are **not captured yet** (onboarding is Phase 2). The sign-up screen must not be exposed to real users before then; `user_consents` and `adult_confirmed_at` exist for it.

## 5. Unverified platform behavior and other limitations

**Not verified on any device/simulator (explicitly):**
- App launch, navigation, and layout on Android and iOS; dev-build creation; Expo Go (SDK 58's Expo Go was not published at the time).
- Native session persistence through the real Keychain/Keystore (`expo-secure-store` adapter is tested with an in-memory fake that enforces key and size rules).
- Native deep-link code exchange (`matchup-dev://auth/callback`) and `Linking.createURL` output.
- Whether `react-native-url-polyfill` is still necessary on RN 0.88 (included as in Supabase's Expo guidance; harmless if redundant).
- Hermes `Intl` behavior for `tr-TR` date/currency/casing (tested on Node's ICU only).
- Web browsers other than Chromium; screen readers (VoiceOver/TalkBack/NVDA), 200 % zoom and reduced-motion manual passes (only automated axe + keyboard tests exist).

**Other limitations:**
- **Performance budget not met:** first-load JS on web ≈ **895 kB gzip** vs the 350 kB target; total web JS 1.29 MB gzip (includes a 372 kB lazy Sentry chunk not loaded without a DSN). Phase 1 did not optimize; a ratchet (1400 kB) prevents regression. Candidates: route-level code splitting, replacing `@expo/vector-icons` with a few inline SVGs, dropping reanimated from the web path.
- No `x-request-id` correlation header (CORS risk, ADR-0014).
- No literal-string lint rule yet (parity tests only).
- PostGIS/`pg_cron`/`unaccent`/`pg_trgm` are **not** installed yet (Phase 3/4); the `anon` execute whitelist is empty until `search_events`/`get_event` arrive.
- `design.md` has **not been supplied**; tokens are provisional and the provisional logo is a raster with an opaque white background (looks boxy in dark mode). The logo's orange/green/blue palette is *not* reflected in the UI.
- The repo sits in OneDrive: git-ignored local credentials (`apps/app/.env.local`, `supabase/.temp/`) are inside a synced tree. They are local demo values only, but real secrets must never be placed here (DEVELOPMENT §1).
- Real Supabase hosted project (Frankfurt, D-04) was **not created** — Phase 1 used only the local stack; no real user data exists anywhere.

## 6. Deviations from the Phase 0 plan

| Plan | What happened | Why |
|---|---|---|
| Jest 29 | **Jest 30** | jest-expo 58 requires it (M0 finding F-1) |
| `request_id` propagation | dropped | custom header → CORS preflight risk (ADR-0014) |
| Stubbed session in M4 | honest default context (`guest`) | no fake auth; real provider arrived in M6 |
| M5 `profiles` write RPCs | not built | Phase 2 (`update_my_profile`, `complete_onboarding`) |
| Test builders in `domain/testing` | not created | no domain entities yet; integration helpers exist in `db-tests` |
| pnpm `hoisted` fallback | not needed | isolated linker worked with Metro |
| Prettier on `settings.json` | **my mistake:** `pnpm format` rewrote your sound-hook file once (whitespace only). Restored to its original 286-byte, CRLF, no-trailing-newline form (same size and valid JSON; I could not byte-compare it to the original) and added to `.prettierignore` | — |

## 7. Recommended Phase 2 milestones (User identity)

1. **P2-M0 — Native validation spike (device).** Install Android Studio/emulator (or provide a phone), build a dev client, confirm launch, SecureStore persistence, deep-link callback, URL polyfill need, and Hermes `Intl`. Decide EAS/iOS path. *Blocking risk reducer for everything native.*
2. **P2-M1 — Design reconciliation.** Receive `design.md`; map tokens; confirm fonts/Turkish glyphs, logo as SVG; update contrast tests; add the literal-string lint rule.
3. **P2-M2 — Sports catalog migration + seed** (`sports`, `sport_formats`, `sport_positions`, `cities`, `districts`; anon-readable; seeded 10 sports, Ankara).
4. **P2-M3 — Profile & settings RPCs** (`update_my_profile`, `update_my_settings`; column-restricted, validated, audited) + RLS for visibility rules + pgTAP negative tests.
5. **P2-M4 — Onboarding** (`complete_onboarding`: 18+ confirmation, versioned Terms/Privacy consent, city, sports, levels) with legal copy placeholders flagged for counsel; resumable; **gate the app behind it**.
6. **P2-M5 — Profile screens** (view/edit, privacy settings, sport profiles, avatar upload with Storage policies and tests).
7. **P2-M6 — Hosted staging project (Frankfurt)** with custom SMTP, CAPTCHA, leaked-password protection; run the DEPLOYMENT checklist items that cannot be tested locally; decide the sign-up enumeration mitigation.
8. **P2-M7 — Phase 2 exit review** (same fresh-clone verification).

## 8. Decisions I need from you

1. **Where will the repo live?** Strongly recommend moving it out of OneDrive (e.g. `C:\dev\matchup`) before Phase 2 handles real credentials.
2. **Android device/emulator:** may I install Android Studio + SDK + an emulator (several GB, needs Windows virtualization), or can you supply a physical Android device for P2-M0? iOS needs an Apple Developer account for EAS builds — in or out of scope for the pilot?
3. **`design.md`** and a decision on the logo (vector master + whether its palette should drive the design system).
4. **GitHub remote:** creating one lets the workflow actually run; I will not push or create one without your instruction.
5. **Counsel review** of the Terms/Privacy/consent copy before onboarding ships (SECURITY §8).
6. **Sign-up enumeration:** accept the residual risk with CAPTCHA + rate limits, or fund the Edge-Function front?
