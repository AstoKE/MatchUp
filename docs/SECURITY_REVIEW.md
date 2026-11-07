# Security review (Phase 7 / M2)

Status 2026-11-07. Scope: the database API (every function, table, policy and grant), the client's handling of secrets, Phase 4–6 surfaces (venues, pins, admin, reports, blocks), and what the hosted project exposes to a stranger. Threat model: SECURITY §2. This review is one person's reading with automated checks behind it, not an external audit.

## 1. How the surface is kept reviewed

| Guard | What it enforces | Where |
|---|---|---|
| **Inventory snapshot** | Every function in `public`/`private` (owner-run or not, `search_path`, guest and member execute rights, the guard it starts with) and every table (RLS, policies with roles, API grants), as reviewed on 2026-11-07. Any change fails CI until the snapshot is regenerated, which puts it in the PR diff for review. | `supabase/security/inventory.json`, `packages/db-tests/src/security-inventory.test.ts` |
| Invariants (same test) | Owner-run functions pin `search_path`; nothing in `private` is callable by guests; every owner-run public function a member can call starts from a guard (`assert_admin_aal2`, `assert_onboarded_user`, `assert_active_verified_user` or `auth.uid()` with a null check), except the three reviewed guest reads; every public table has RLS; the API roles cannot write any table. | same |
| Guest whitelist | Guests execute exactly `catalog_places`, `get_event`, `search_events`, `search_venues`. | `01_security_baseline` |
| Export/purge inventory | Every per-user table is handled by export and purge. | `06_account_deletion_export` |
| Behavioural tests | 1280 pgTAP assertions with negative paths per role, 189 API tests with real concurrency, 11 mutation checks of Phase 4 SQL. | `supabase/tests/database`, `packages/db-tests` |
| Client | The app refuses a service-role or secret key in `EXPO_PUBLIC_*`; the exported bundle is scanned for secrets; secrets are scanned in CI. | `env.schema.ts`, `check-bundle-secrets.mjs`, secret-scan job |
| From outside | What a stranger with the public key sees of a project. | `scripts/security/hosted-surface.mjs` (§3) |

## 2. Findings

| Id | Finding | Severity | Status |
|---|---|---|---|
| S7-1 | `admin_resolve_attendance_dispute` (Phase 5) checked "admin and aal2" by itself and answered `NOT_ALLOWED` to an administrator without the second factor; every other admin function answers `MFA_REQUIRED`, which the console needs to ask for the code. It also required the administrator to be onboarded as a player. | Low (no bypass; wrong error, inconsistent guard) | **Fixed**: `20261109100000_dispute_admin_guard.sql` uses `private.assert_admin_aal2`; `12_attendance` expects `MFA_REQUIRED` |
| S7-2 | Supabase projects can have **pg_graphql** enabled: a guest can then introspect table and column names through `/graphql/v1` (rows stay behind RLS). The app does not use GraphQL. Not enabled locally; hosted not checked from here. | Low (information) | **Founder**: run §3; if it warns, disable the extension (Database → Extensions → pg_graphql) |
| S7-3 | The web build will be served by a static host not chosen yet; without response headers it can be framed (clickjacking) and has no Content-Security-Policy. | Medium for the web app | **Founder + code at hosting time**: the headers in DEPLOYMENT §12 |
| S7-4 | Hosted Auth settings are not verifiable from the repository: rate limits, leaked-password protection, redirect allow-list, SMTP. | Medium | **Founder**: steps in DEPLOYMENT §12; LAUNCH_CHECKLIST §2 |
| S7-5 | Account enumeration through sign-up, sign-in timing and the reset cooldown (ADR-0016). | Low–medium | Accepted with counsel's review (LAUNCH_CHECKLIST §2) |
| S7-6 | `update_my_profile` has no rate limit: a person can rename themselves often. Names are cleaned (no links, phones, addresses) and reports name the person, not the label. | Low | Accepted; revisit if reports show abuse |
| S7-7 | `private` schema has `USAGE` for the API roles (RLS policies call `private.is_*`). Nothing in it is executable by guests or readable by either role (tests). | Info | Accepted, guarded by the inventory |
| S7-8 | PostgREST's OpenAPI root lists the tables a guest may read and the four guest functions. | Info | Accepted (Supabase default; nothing private is listed) |
| S8-1 | Phase 8 M3 (ADR-0027) added the first storage bucket and its policies, and six functions (inventory diff in that PR). Reviewed: guests can call none; the owner-run policy helpers check `auth.uid()`; photo reads follow the player-card rule and only the current photo; gender has no column grant. All of this is proven against the real Storage API in `avatars.test.ts`, with a mutation check. | Info | Reviewed 2026-11-07 |
| S8-2 | Photo bytes cannot be deleted from SQL. Leftovers from an interrupted upload, or from a purge when the app did not delete first, stay in storage, unreadable through the API, until a sweeper with a service credential exists. | Low | Accepted for the pilot; counsel (SECURITY §8 item 13) |
| S8-3 | Phase 8 M4 (ADR-0028) added three tables without API grants, four RPCs and the sender. Reviewed: guests call nothing; a device token moves only to the caller who presents it; unregistering is limited to one's own token; the sender runs only from pg_cron; payloads carry no personal data (asserted in `push.test.ts`). Expo's enhanced push security (an access token) is not used. | Low | Accepted for the pilot (ADR-0028) |

No finding allowed reading or changing another person's data, bypassing a quota, or escalating to admin.

## 3. Checking hosted from the outside (founder)

**Hosted result, 2026-11-06 (founder's run):**
- Sign-up disabled, email confirmation on, no other providers, phone off.
- GraphQL not enabled, so S7-2 does not apply to hosted.
- The OpenAPI root is not served to the publishable key (401), so S7-8 does not apply to hosted either. The script now counts this as a PASS.
- A guest reads nothing from the six private tables.
- **The `health` function is not deployed on hosted (404).** That is not a security issue, but M4's external monitor needs it: `pnpm exec supabase functions deploy health --project-ref wmgeugsqblwnhnqnczab` (founder).
- `20261109100000` is applied.


```bash
node scripts/security/hosted-surface.mjs --url https://wmgeugsqblwnhnqnczab.supabase.co --anon-key <publishable key>
```

It uses only the public key and writes nothing. It checks:
- sign-up in the expected state (disabled by default; with `--signup open`, enabled **and** CAPTCHA enforced, ADR-0026) and email confirmation on;
- no extra sign-in providers;
- the functions a guest can call are exactly the reviewed four;
- whether GraphQL is exposed;
- that a guest reads nothing from six private tables;
- that the health endpoint answers without data.

Every line should be PASS or INFO; send any FAIL or WARN back. On the local stack, "public sign-up disabled" fails on purpose (local sign-up is on), and with `--signup open` "CAPTCHA enforced" fails on purpose (local CAPTCHA is off). The CAPTCHA check sends one password-reset request for `surface-check@example.invalid`, which a CAPTCHA-protected project refuses before doing anything; no mail can be delivered to that reserved domain.

## 4. Phase 4–6 surfaces, reviewed

- **Pins.**
  - The exact point exists only in `event_private_details` (RLS: organizer, approved players, admins) and in `get_event.private`.
  - `events.public_point` is the snap for hidden locations.
  - Distances are computed from the public point.
  - 46 pgTAP assertions, viewer × visibility; mutations of the snap and of the "inside" rule are caught.
- **Venues.**
  - The table is closed to the API roles; reads go through `search_venues`, which never returns the submitter.
  - A venue is shown only where the address may be.
  - Suggestions are rate limited under a per-user lock (concurrency test).
  - Admin changes need aal2 and are recorded.
- **Admin.**
  - Every `admin_*` function starts from `assert_admin_aal2`; S7-1 was the exception, now aligned.
  - Admin is a `platform_admins` row, never JWT metadata.
  - Decisions are in the append-only `moderation_actions`, and the audit log holds no free text.
- **Reports and blocks.**
  - A reporter learns nothing about the outcome beyond "closed".
  - Reports about someone are not in that person's export.
  - Blocks hide both sides from each other in every read and refuse joins and reviews.

## 5. Not covered

- An external penetration test.
- The hosted project's dashboard settings (founder, §3 and DEPLOYMENT §12).
- The native apps' storage of the session: SecureStore on device, `localStorage` on the web; the web session is as safe as the origin, hence S7-3.
- Third parties' own security: Supabase, MapTiler, Sentry, Cloudflare.
