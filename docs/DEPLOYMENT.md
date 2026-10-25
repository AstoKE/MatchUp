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

**Auth settings are configured in the dashboard, not pushed from `config.toml`** (its values are for local development: localhost, sign-up on). Required on the hosted project: sign-up **disabled** (LAUNCH_CHECKLIST), email confirmation on, minimum password length 10, site URL `http://localhost:8081`, redirect URLs `matchup-dev://**` and `http://localhost:8081/**`. Test accounts are created in Authentication → Users with *Auto Confirm User*. CAPTCHA stays off until a Turnstile site key exists (and then app and project switch together).

**Pointing the app at it:** `pnpm env:hosted` writes `apps/app/.env.local` with the project URL and its **publishable** key (never a secret key); `pnpm env:local` switches back. On the emulator: `.\scripts\android\dev.ps1 up hosted` (Metro restarts with a clean cache whenever the backend changes, because `EXPO_PUBLIC_*` values are inlined at bundle time). Automated tests always run against the local stack.

**First push, verified:** 6 migrations applied; every public table has RLS; API roles have no write grants; guests read only `app_config` and the catalog (10 sports, 19 formats, 20 positions, Ankara + 25 districts); the `process-deletion-queue` cron job exists. The advisor flagged a hosted-only platform function `public.rls_auto_enable()` (event trigger helper, SECURITY DEFINER, executable by `anon`); `20261025160000_platform_function_grants.sql` revokes that grant (it cannot be called directly anyway: HTTP 400). The other advisor warnings are by design (self-service RPCs callable by signed-in users, ADR-0003) or minor (several permissive SELECT policies on `profiles` and sport tables).

**Not verified on the hosted project yet:** the purge job actually running at 03:17 UTC (check `cron.job_run_details` after the first night), email delivery with the default SMTP (rate-limited), latency from Ankara.
