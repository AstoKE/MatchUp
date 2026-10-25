# Public registration checklist

Status 2026-10-25. **Nothing here is done for a hosted project: no hosted project is connected yet.** Public sign-up must stay **disabled** on any hosted Supabase project (`[auth] enable_signup = false` in the project's Auth settings) until every item below is checked. This is not legal advice; items marked ⚖ need a qualified lawyer.

## 1. Legal (⚖ blocks launch)

- [ ] Terms of Use and Privacy Notice reviewed and approved by counsel (`apps/app/src/locales/{tr,en}/legal.json` are drafts).
- [ ] Data controller identity, contact, retention periods, deletion/export procedure and KVKK information duties added to the Privacy Notice (SECURITY §8).
- [ ] Decide whether a separate explicit-consent text is needed for any processing beyond the Terms; marketing stays a separate, optional, revocable consent (built).
- [ ] Publish new text as a **new version**: change `legal.terms_version` / `legal.privacy_version` in `app_config` through a migration and set `legal.draft` to `false`. Users are asked again because `complete_onboarding` only accepts the current versions (`CONSENT_VERSION_MISMATCH`). *Existing users are not re-prompted yet* — a re-consent gate for already-onboarded users is not built.
- [ ] 18+ is a self-declaration (checkbox + server-recorded timestamp). Decide with counsel whether that is sufficient for the product.

## 2. Abuse and enumeration (decision 7 — planned, not implemented)

- [ ] CAPTCHA on sign-up, sign-in and password reset (Supabase Auth Attack Protection with a provider such as Cloudflare Turnstile). The local stack can use Turnstile's documented test secrets.
- [ ] Auth rate limits reviewed on the hosted project (sign-in, sign-up, email send, token verification, anonymous IP limits); the local `config.toml` values are developer defaults.
- [ ] Email sending through a real SMTP provider with SPF/DKIM; hosted default SMTP is rate limited and not for production.
- [ ] Re-run `node scripts/auth-probe.mjs --url … --anon-key … --service-key …` against the hosted project and record the numbers in `docs/AUTH_ABUSE.md`. **Known from local measurement (ADR-0016): all three endpoints leak** (sign-up 422 vs 200; sign-in timing; reset cooldown 429). We do not claim to prevent enumeration; counsel confirms the residual risk is acceptable (⚖).
- [ ] CAPTCHA token is actually sent by the app (web widget + native WebView) — **not built**; the server side was verified on the lab stack only.
- [ ] Decision on a closed / invite-only pilot with public sign-up disabled. An Edge proxy is **not** recommended (ADR-0016): the Auth API stays reachable without it.

## 3. Platform

- [ ] Hosted project region chosen by the founder (data residency question for counsel); project created; migrations applied with `supabase db push`; types regenerated and checked in CI.
- [ ] Redirect URL allow-list contains only the real web origin and the app's deep-link scheme (no wildcards); site URL set.
- [ ] Service-role key stored only in server-side secret stores; never in the app or in `app_config`.
- [ ] Backups / point-in-time recovery enabled and a restore rehearsed.
- [ ] Android: signed release build tested on physical devices; iOS: not started (needs macOS or EAS + Apple Developer account).
- [ ] Error reporting DSN configured; the redaction rules reviewed against real events.

## 4. Product

- [ ] Account deletion and data export exist in the app (SECURITY §8 core features) — **not built**.
- [ ] Report / block flows exist before any user-to-user content — **not built** (Phase 6 per roadmap).
- [ ] Support contact reachable from the app.
