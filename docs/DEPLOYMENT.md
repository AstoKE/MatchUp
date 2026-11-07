# Deployment and Operations

Status: Phase 0 plan (details finalized in Phase 7; nothing is deployed yet)

Related: [ARCHITECTURE §11](ARCHITECTURE.md) · [SECURITY](SECURITY.md)

## 1. Environments

| Env | Purpose | Backend | Data |
|---|---|---|---|
| local | development | Supabase CLI (Docker) | dev seed |
| staging | integration, load tests, store review builds | separate Supabase project (same region/plan class as prod) | synthetic only — **never copy production data** |
| production | pilot and beyond | Supabase project, **eu-central-1 (Frankfurt)** — decision D-04 (closest EU region to Ankara; no Turkish region exists; cross-border transfer legal item SECURITY §8) | real |

**Region (D-04 confirmed):** the initial development/staging project uses Supabase `eu-central-1` (Frankfurt). Data-residency note: this is processing outside Turkey; no real user data is placed there until counsel has addressed the KVKK cross-border transfer requirements (SECURITY §8 item 4). Phase 1 development uses the **local** Supabase stack only; no hosted project, credentials or real data are involved yet.

**Update 2026-10-25 (ADR-0018):** the first hosted project exists and is in **eu-west-3 (Paris)**, ref `wmgeugsqblwnhnqnczab`, free plan, Postgres 17. It serves as the development/staging project; see §9.

Branches: `main` protected; PRs required; staging deploys from `main`; production from tagged releases.

## 2. Configuration and secrets

| Item | Where | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_MAP_STYLE_URL`, `EXPO_PUBLIC_APP_ENV` | build-time env | public by design; protected by RLS/restricted keys |
| Supabase service-role key, DB password, SMTP credentials, CAPTCHA secret, Sentry auth token | CI secret store / Supabase secrets | never in client bundles or repo |
| Map tile provider key | restricted by domain/app id | rotate if abused |
| Apple/Google credentials, EAS tokens | EAS secrets / CI | post-MVP for push |

`.env.example` documents all variables; startup validation fails fast (Zod).

## 3. Delivery pipeline

- **Web:** `expo export --platform web` (SPA) → static hosting. Recommendation: **Cloudflare Pages** (WAF/rate rules, custom headers for CSP/HSTS, SPA fallback, free tier); alternatives Vercel/Netlify/EAS Hosting. Security headers are configuration under version control.
- **Mobile:** EAS Build (cloud iOS builds are required on Windows) → TestFlight / Play internal testing → store release. EAS Update (OTA) only for JS-compatible fixes; OTA never ships changes that depend on unreleased backend behavior.
- **Database:** `supabase db push`/migration pipeline from CI to staging automatically, to production with manual approval. Every migration is reviewed for locks and backward compatibility. Destructive operations require an explicit written description of effects and a restore plan.
- **Edge Functions:** `supabase functions deploy` from CI; secrets via `supabase secrets`.

### API compatibility policy (mobile clients live for months)
Installed apps call RPCs directly, so backend changes must be **backward compatible for N = 3 months or two app releases**: additive columns/params with defaults, never rename/remove an RPC or change error codes in place; deprecate with a new versioned function (`request_join_v2`), keep both, and remove after the minimum supported app version moves. A `min_supported_app_version` config row drives a blocking "please update" screen as the last resort.

## 4. Backups and recovery

Supabase automated backups; evaluate PITR on the production plan (recommended for pilot since event data is transactional). Before pilot: perform and time a **restore drill** into a scratch project; document RPO/RTO targets (proposal: RPO ≤ 24 h without PITR / ≤ 15 min with; RTO ≤ 4 h). Storage (avatars) is recoverable by re-upload; export jobs are not backed up.

## 5. Monitoring and alerting

Sentry (client + functions) with release tracking; uptime checks on web and `health`; alerts on error spike, auth failure spike, p95 latency regression, DB CPU/connections, failed cron jobs (cron success table), nightly invariant check (capacity, orphan profiles), email bounce rate. On-call = the founder; define response expectations in the incident checklist.

## 6. Incident response (minimum)

Severity levels, owner, communication template (in-app banner + status note), security-incident path including the KVKK breach-notification clock (SECURITY §8-11), post-mortem template. Key rotation runbook (anon/service keys, SMTP, tile key).

## 7. Operational readiness checklist (pilot gate)

**Security** ☐ RLS on all tables verified ☐ Supabase advisors clean ☐ no secrets in bundle/repo (scan) ☐ MFA on admin accounts and cloud consoles ☐ CAPTCHA live ☐ rate limits tested ☐ dependency audit clean ☐ penetration test/structured review done ☐ CSP/HSTS headers verified
**Data & legal** ☐ KVKK items (SECURITY §8) reviewed by counsel ☐ privacy notice/terms published and versioned ☐ retention jobs running ☐ export + deletion tested end-to-end ☐ app-store privacy declarations
**Reliability** ☐ restore drill done ☐ custom SMTP with SPF/DKIM/DMARC and bounce handling ☐ cron jobs monitored ☐ migrations rehearsed on staging ☐ rollback plan per release
**Performance** ☐ load scenarios run against budgets ☐ query plans checked ☐ bundle size budget ☐ low-end Android profile
**Quality** ☐ CI all green on release commit ☐ Playwright lifecycle ☐ manual a11y checklist ☐ Turkish copy reviewed by a native speaker ☐ device matrix tested (min. 2 iOS, 3 Android incl. low-end, 3 browsers)
**Operations** ☐ moderation owner + SLA defined ☐ admin runbook (reports, disputes, suspensions) ☐ support email/contact published in-app ☐ status/incident template ☐ analytics dashboards for pilot metrics ☐ feature flags/kill switches for risky features (creation, joining) via `app_config` row
**Store** ☐ Apple UGC (report/block/contact) & account-deletion compliance ☐ Google Play data safety & UGC ☐ age rating ☐ identifiers final (ADR-0010)

## 8. Phase 1 notes

- *(Phase 1 snapshot; superseded by §9.)* **No hosted environment exists yet.** Everything was verified on the local Supabase stack; the Frankfurt project (D-04) is a Phase 2 task (PHASE1_REPORT §7). Settings that only exist on a hosted project (CAPTCHA, leaked-password protection, custom SMTP, production rate limits, backups/PITR) are unverified.
- **CI** (`.github/workflows/ci.yml`): jobs `quality`, `secret-scan`, `database`, `e2e-web`. Linted with actionlint; never executed on GitHub (no remote yet).
- **Web hosting prerequisites before any public URL:** CSP (no inline scripts; `connect-src` limited to the API origin), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors none, SPA fallback; the web session is in `localStorage` (ADR-0014).
- **Bundle budget:** measured first-load JS ≈ 895 kB gzip vs 350 kB target; ratchet at 1400 kB total (`pnpm check:bundle-size`).
- Keep the repository out of cloud-synced folders (DEVELOPMENT §1).

## 9. Hosted project (connected 2026-10-25)

Project `wmgeugsqblwnhnqnczab`, eu-west-3 (Paris, ADR-0018), free plan. It holds the **schema only**: the local stack's rows are automated-test fixtures and were deliberately not copied. Real records appear when the app is pointed at it.

**Schema changes (manual, until a CI deploy job with approval exists):**

```powershell
pnpm exec supabase login                                   # once per machine; browser, token stays local
pnpm exec supabase link --project-ref wmgeugsqblwnhnqnczab # once per clone; writes git-ignored supabase/.temp
pnpm exec supabase db push --linked --dry-run              # review the list first
pnpm exec supabase db push --linked                        # only migrations already merged to main
pnpm exec supabase db advisors --linked                    # Supabase security/performance advisor
```

No database password is needed with CLI ≥ 2.122 (login-role via the access token). Never push a migration that is not on `main`.

**Auth settings are configured in the dashboard, not pushed from `config.toml`** (its values are for local development: localhost, sign-up on). Required on the hosted project: sign-up **disabled** (LAUNCH_CHECKLIST), email confirmation on, minimum password length 10, site URL `http://localhost:8081`, redirect URLs `matchup-dev://**` and `http://localhost:8081/**`. Test accounts: `node scripts/hosted-create-test-user.mjs <email>` creates an email-confirmed account and prints a random password once in your own terminal (the secret key is fetched with your CLI login and only used in memory); the dashboard's Authentication → Users → *Add user* with *Auto Confirm User* does the same.

Applied 2026-10-25 without the dashboard, by pulling the hosted config into a scratch workdir, editing only the needed keys and pushing it back (`supabase --workdir <tmp> config pull|diff|push --project-ref …`, diff reviewed before each push): `[auth] enable_signup = false`, `minimum_password_length = 10`. **Trap:** `[auth.email] enable_signup` is the *Email provider* switch, not "email sign-ups": setting it to `false` also blocks **sign-in** (it had been switched off in the dashboard and was switched back on). Verified from outside with the publishable key: `/auth/v1/settings` reports `disable_signup: true` and the email provider enabled; a sign-up attempt returns `422 signup_disabled`. CAPTCHA stays off until a Turnstile site key exists (and then app and project switch together).

**Pointing the app at it:** `pnpm env:hosted` writes `apps/app/.env.local` with the project URL and its **publishable** key (never a secret key); `pnpm env:local` switches back. On the emulator: `.\scripts\android\dev.ps1 up hosted` (Metro restarts with a clean cache whenever the backend changes, because `EXPO_PUBLIC_*` values are inlined at bundle time). Automated tests always run against the local stack.

**First push, verified:** 6 migrations applied; every public table has RLS; API roles have no write grants; guests read only `app_config` and the catalog (10 sports, 19 formats, 20 positions, Ankara + 25 districts); the `process-deletion-queue` cron job exists. The advisor flagged a hosted-only platform function `public.rls_auto_enable()` (event trigger helper, SECURITY DEFINER, executable by `anon`); `20261025160000_platform_function_grants.sql` revokes that grant (it cannot be called directly anyway: HTTP 400). The other advisor warnings are by design (self-service RPCs callable by signed-in users, ADR-0003) or minor (several permissive SELECT policies on `profiles` and sport tables).

**Second push, 2026-10-29 (Phase 3):** `20261028100000_search_events`, `20261028110000_list_my_events` and `20261029100000_participation` (all already on `main`; the dry-run listed exactly these three, and a fourth migration that was still on a branch was set aside for the push and restored afterwards). Verified from outside with the publishable key: `search_events` answers anonymously (200, only public fields) and rejects bad filters with `VALIDATION_FAILED`; `list_my_events`, `request_join` and `list_event_requests` answer an unauthenticated call with `42501 permission denied`. The advisor (`supabase db advisors --linked`) reports no errors, only WARNs: `search_events` executable by `anon` (the guest whitelist, D-09, ADR-0013) and the other `SECURITY DEFINER` RPCs executable by `authenticated` (by design, ADR-0003); multiple permissive SELECT policies on `events` (public + involved), `profiles` and the sport tables (minor); and *leaked password protection* is off (a Supabase plan feature, to be revisited before launch, LAUNCH_CHECKLIST). The signed-in paths (request, approve, notifications) were exercised against the local stack only: nobody has used them on hosted yet.

**Third push, 2026-11-01 (Phase 5, by the founder from their terminal):** the nine migrations from `20261031100000_attendance` to `20261031170000_event_reviews_view`; the dry-run listed exactly these, a later one reported up to date. The founder tested web and iOS against it. This also starts the jobs `complete-due-events`, `auto-finalize-attendance` and `close-review-windows`. `20261031180000_attendance_finalized_notification` is not pushed yet.

**Fourth push, 2026-11-07 (Phase 6 M4–M6 and Phase 4, by the founder), stopped half way.** Applied: `20261103100000_moderation_enums`, `20261103110000_admin_moderation`, `20261104100000_moderation_notifications_abuse`, `20261106100000_turkey_catalog`. **Failed and rolled back:** `20261107100000_points_and_venues`, at its backfill `update public.events set public_point = …`, with `INVALID_TRANSITION`: hosted has canceled and completed events, and `events_before_write` refuses any update to them (I-7). Local and CI databases start empty, so no test met a frozen event. The migration was never applied anywhere that keeps data, so it was corrected in place (the trigger is off for that one statement, and only empty points are filled) and rehearsed before the retry (see below). `20261108100000_catalog_centers` waits for it.

**Rehearse a migration that touches existing rows before pushing it.** CI applies migrations to an empty database, which proves nothing about backfills. Before a push that updates or constrains existing data: `supabase db reset --local --version <the last migration hosted has>`, create the kinds of rows hosted holds (including canceled and completed events, which are frozen), then `supabase migration up --local` and check the result.

**Not verified on the hosted project yet:** the purge job actually running at 03:17 UTC (check `cron.job_run_details` after the first night), email delivery with the default SMTP (rate-limited), latency from Ankara.

## 10. Expo / EAS project (linked 2026-10-25)

`@matchupproject/matchup`, project ID `6c20128e-275c-4b45-babd-869e6a1dd5df`, owned by the Expo account `matchupproject`. Owner and ID live in `packages/config` (`brand.identifiers.expoOwner`, `easProjectId`) and reach Expo through `app.config.ts` (`owner`, `extra.eas.projectId`); `eas init` cannot edit a dynamic config, so this was done by hand and checked with `eas project:info`.

EAS CLI evaluates `app.config.ts` without loading `apps/app/.env.local`, so our fail-fast env validation stops it. For tooling-only runs set `SKIP_ENV_VALIDATION=1` (PowerShell: `$env:SKIP_ENV_VALIDATION='1'`), e.g. `npx eas-cli@25.3.0 project:info` from `apps/app`. Real EAS **builds** must instead receive the `EXPO_PUBLIC_*` values as EAS environment variables (not set up yet). Nothing is built on EAS yet: native dev builds still come from the pinned container (ADR-0015), and the identifiers are the temporary, unpublishable `com.example.matchup.dev` (ADR-0010).

## 11. The administration console and the first administrator (Phase 6 M5)

The console is the web route `/admin` (`apps/app/app/admin/index.web.tsx`); the phone app has no such route. Nobody can open it by being an administrator in a token: **an administrator is a row in `platform_admins`**, written with service credentials, and every `admin_*` function needs a token with a second factor (`aal2`).

Before the first use on hosted, **you** do this once, from the Supabase dashboard (never from the app, never with the service-role key in a client):

1. **Auth › Multi-factor: turn on TOTP** (enroll and verify). Without it the console cannot set up the second step.
2. The person signs up and finishes onboarding like anybody else. Hosted sign-up stays disabled for the public (LAUNCH_CHECKLIST), so for the very first administrator use an account you already have.
3. In the SQL editor, with that person's id from Auth › Users:
   ```sql
   insert into public.platform_admins (user_id) values ('<the user id>');
   ```
4. On the web, sign in, open **Profil › Yönetim** (or `/admin`), scan the QR code with an authenticator app, and enter the code. Later sign-ins ask for the code again.

To remove an administrator: `update public.platform_admins set revoked_at = now() where user_id = '<id>';`. An administrator cannot be suspended through the console; revoke first.

What the console shows and who may see it is in docs/PHASE6_PLAN.md M5 and docs/SECURITY.md S-14. Reports and the decisions made are personal data; how long they are kept is a counsel question (SECURITY §8).

## 12. Hardening the hosted project and the web host (Phase 7 M2)

Founder actions; none of them can be checked from the repository. After each, `node scripts/security/hosted-surface.mjs` (docs/SECURITY_REVIEW.md §3) shows what a stranger sees.

**Supabase dashboard (project `wmgeugsqblwnhnqnczab`):**
1. *Authentication → Sign In / Providers → Email:* "Confirm email" on, "Secure email change" on. Minimum password length 10 is already set. Turn on "Prevent use of leaked passwords" if the plan offers it (the advisor flags it as off).
2. *Authentication → Sign In / Providers:* public sign-up stays **off** until every step of §14 is done (ADR-0026). Every other provider stays off; anonymous sign-ins off.
3. *Authentication → Rate Limits:* review the numbers for email sending, token refresh, verifications, and sign-ups and sign-ins per IP. The defaults are reasonable for a pilot. With the built-in SMTP, email sending is limited to a few per hour, which a pilot outgrows at once: see 4.
4. *Authentication → SMTP Settings:* a real provider (for example Resend, Postmark or Brevo) on a domain you control, with SPF and DKIM records at the DNS host. The sender is a no-reply address on that domain.
5. *Authentication → URL Configuration:* Site URL = the production web origin. Redirect URLs = only that origin's `/auth/callback` and the app's deep-link scheme. No wildcards, no localhost.
6. *Database → Extensions:* if `pg_graphql` is enabled (the surface check warns), disable it; the app does not use GraphQL.
7. *Project Settings → API keys:* the app ships only the publishable key. Rotate the secret keys if they were ever pasted anywhere outside the dashboard.

**Web host (when chosen): response headers for every path.** The app is a single-page export with its JavaScript, CSS, fonts and the MapLibre worker on the same origin.

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://api.maptiler.com; font-src 'self'; connect-src 'self' https://wmgeugsqblwnhnqnczab.supabase.co wss://wmgeugsqblwnhnqnczab.supabase.co https://api.maptiler.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io; worker-src 'self' blob:; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=()
```

Notes on the headers:
- `style-src 'unsafe-inline'` is needed by React Native Web, which writes its styles inline.
- The Sentry host is only needed with a DSN.
- The MapTiler host must match the style URL.
- Before switching the CSP on, run the production build once with the policy in **report-only** mode (`Content-Security-Policy-Report-Only`) and check the browser console on Discover, the map, the event form, sign-in with CAPTCHA and the console.

## 13. Observability and recovery (Phase 7 M4)

Founder actions; none of them changes code.

1. **Health function and an external monitor.** Deploy the probe:
   ```bash
   pnpm exec supabase functions deploy health --project-ref wmgeugsqblwnhnqnczab
   ```
   Then point a free uptime monitor (for example UptimeRobot or Better Stack) at `https://wmgeugsqblwnhnqnczab.supabase.co/functions/v1/health`: every 5 minutes, alert by email after two failures. The probe returns only status and latency (no data) and uses the public key.
2. **Error reporting.**
   - Create a Sentry project (EU data region) and put its DSN in `EXPO_PUBLIC_SENTRY_DSN` for hosted builds: EAS environment variables, and the web host's build settings. The DSN is public by design.
   - The app scrubs emails, tokens, keys, coordinates, addresses, request bodies and query strings before sending (`src/lib/observability/redact.ts`, tested).
   - After the first real errors arrive, open a few events in Sentry and check that nothing personal got through. Record the check in LAUNCH_CHECKLIST.
3. **Backups and a restore rehearsal.**
   - In the dashboard, *Database → Backups*: daily backups are part of the paid plans. Point-in-time recovery is an add-on; decide whether the pilot needs it.
   - Rehearse once before the pilot: restore the latest backup **into a new, separate project** (never over the live one), connect to it, check that `events`, `profiles` and `event_participations` have the expected counts, then delete the scratch project.
   - Write the date and the time it took here.
4. **Cron jobs on hosted.** In the SQL editor, `select jobname, schedule, active from cron.job;` should list:
   - `process-deletion-queue`
   - `complete-due-events`
   - `auto-finalize-attendance`
   - `close-review-windows`
   - `attendance-reminders`

   All of them should be active.

## 14. Opening public sign-up (Phase 7 M7, ADR-0026)

Founder actions, **in this order**. Each step depends on the one before it. Do not switch sign-up on until steps 1–8 are done.

1. **SMTP** (§12 step 4).
   - Send a password reset to your own address and check that it arrives, is not in spam, and that SPF and DKIM pass.
   - Without real SMTP, confirmation emails stop after a few an hour, and new people cannot finish signing up.
2. **Rate limits** (§12 step 3).
   - Write the numbers you set into AUTH_ABUSE §5.
3. **Leaked-password protection** (§12 step 1), if the plan offers it.
4. **Redirect URLs** (§12 step 5).
   - Only the production web origin's `/auth/callback` and the app's scheme. The confirmation link in the email must open the real site.
5. **CAPTCHA, both halves in one sitting.** A mismatch blocks every sign-in:
   - In Cloudflare, *Turnstile*: add a widget for the production hostname, *Managed* mode. Keep the site key and the secret.
   - In Supabase, *Authentication → Attack Protection*: enable CAPTCHA, provider Turnstile, paste the **secret**.
   - Set `EXPO_PUBLIC_TURNSTILE_SITE_KEY` to the **site key** in the EAS environment `production` and on the web host. Rebuild and redeploy the web.
   - Check that you can still sign in on the deployed web.
6. **Support address.**
   - Set `contact.supportEmail` in `packages/config/src/brand.ts`. This is a code change; ask Claude for a PR.
   - Production builds refuse to start without it.
   - Make sure someone reads that inbox (OPERATIONS §1).
7. **Administrator ready** (§11).
   - At least one administrator with TOTP can open `/admin`.
   - The health monitor, error reporting and backups of §13 are in place.
8. **Accept the legal risk.**
   - The Terms and Privacy Notice are drafts (`legal.draft = true`). ADR-0026 records that the founder accepts this.
   - Counsel's review and the new-version migration follow later (LAUNCH_CHECKLIST §1).
9. **Switch sign-up on:** *Authentication → Sign In / Providers → Allow new users to sign up*. Keep "Confirm email" on.
10. **Check from the outside:**
    ```bash
    node scripts/security/hosted-surface.mjs --url https://wmgeugsqblwnhnqnczab.supabase.co --anon-key <publishable key> --signup open
    ```
    - It must show `PASS public sign-up enabled` and `PASS CAPTCHA enforced`.
    - Then re-run `node scripts/auth-probe.mjs` against hosted (ADR-0016 §4) and record the numbers in AUTH_ABUSE.
11. **Sign up once yourself** on the deployed web with a fresh address, from confirmation through onboarding. Then delete that account in the app.

**To close sign-up again:** turn off "Allow new users to sign up". Existing accounts keep working. Then run `hosted-surface.mjs` without `--signup`.
