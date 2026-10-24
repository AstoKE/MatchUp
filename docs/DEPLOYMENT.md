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
