# ADR-0026: Open public sign-up for the pilot, behind CAPTCHA and new-account limits

**Status:** Accepted (Phase 7 M7, 2026-11-07). Amends ADR-0016 §2–3 and the "how pilot users get accounts" decision of PHASE7_PLAN.

## Context

Public sign-up has been disabled on hosted since the project was connected (ADR-0016, ADR-0018). The Turkey-wide pilot needs a way for people to get accounts. PHASE7_PLAN listed three options:
- (a) invitations sent from the dashboard;
- (b) invite codes checked by an Auth hook;
- (c) open sign-up with CAPTCHA and the new-account limits.

The founder chose **(c)** on 2026-11-07.

## Decision

1. **Public sign-up is opened on hosted**, by the founder, in the dashboard. It is opened only after every step of DEPLOYMENT §14 is done, in that order. Email confirmation stays mandatory, and email is the only provider.
2. **CAPTCHA (Cloudflare Turnstile) is enforced on sign-up, sign-in and password reset.**
   - The app sends the token. This is built and unit-tested (AUTH_ABUSE §5).
   - The secret goes into hosted Auth in the same sitting as the site key goes into the production build. A mismatch blocks every sign-in.
   - `scripts/security/hosted-surface.mjs --signup open` fails unless a request without a token is refused.
3. **New-account limits are the ones already in the database.** No new code is needed. For the first `quota.new_account_days` (7) days, an account may:
   - create 2 events a day (`quota.new_account_max_events_per_day`);
   - suggest 1 venue a day (`quota.new_account_max_venue_suggestions_per_day`).

   Every account also has these limits:
   - 5 upcoming published events;
   - 20 open join requests;
   - 20 reports a day.

   All of them are `app_config` rows. They can be tightened on hosted without a release (OPERATIONS §6).
4. **Auth rate limits, real SMTP and leaked-password protection are prerequisites, not follow-ups** (DEPLOYMENT §12, steps 1–4).
5. **A support address is required for a production build.** `app.config.ts` refuses `EXPO_PUBLIC_APP_ENV=production` while `brand.contact.supportEmail` is empty. Until it is set, Settings and the suspended-account page show a placeholder.
6. **The legal texts are still drafts.** `legal.draft = true` and counsel has not reviewed them. **The founder accepts this risk explicitly and knowingly**, and the counsel review is deferred, not dropped.
   - When the texts are approved, they are published as a new version. The re-consent gate then asks every existing user to accept it (LAUNCH_CHECKLIST §1).
   - The repository makes **no claim of KVKK compliance**.

## Consequences

**Positive**
- Anyone in Turkey can join without the operator doing anything per person.
- No new moving part: no proxy, no Auth hook, no invite table.
- CAPTCHA, email confirmation and the per-account quotas limit scripted sign-ups and what a fresh account can do.

**Negative**
- Personal data of real people will be processed under draft legal texts until counsel approves them. This is a legal exposure the code cannot reduce.
- Enumeration signals remain (ADR-0016 §1). CAPTCHA raises their cost but does not remove them.
- One operator answers every report (R-9). A burst of sign-ups shows up as a burst of reports. The levers are the quotas, suspension, and closing sign-up again (OPERATIONS §6).
- Hosted Auth limits are unmeasured until `scripts/auth-probe.mjs` is re-run against hosted after the change (ADR-0016 §4).

**Reversible:** turning sign-up off again in the dashboard stops new accounts at once and leaves existing ones untouched. After that, run `hosted-surface.mjs` without `--signup`.
