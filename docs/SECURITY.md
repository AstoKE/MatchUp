# Security, Privacy and Compliance

Status: Phase 0 baseline · Release rule: **no known critical security issue ships**. This document is engineering guidance, **not legal advice**; technical controls do not by themselves establish KVKK/GDPR compliance.

Related: [DATABASE §8–11](DATABASE.md) · [ARCHITECTURE](ARCHITECTURE.md) · [TESTING](TESTING.md)

## 1. Assets and trust boundaries

| Asset | Sensitivity |
|---|---|
| Account credentials, sessions | Critical |
| Email, display name, avatar, bio, city/district | Personal data |
| Skill/reliability/XP/reviews (profiling data) | Personal data; reputational impact |
| Event locations, participant lists, private notes (WhatsApp links) | Physical-safety relevant |
| Reports, moderation records, audit logs | Sensitive operational data |
| Service-role key, SMTP creds, signing secrets | Critical secrets |

Boundaries: **client (untrusted)** ⇄ Supabase API (PostgREST/Auth/Realtime/Storage) ⇄ **Postgres (trusted, authoritative)** ⇄ Edge Functions (trusted, hold secrets). Everything arriving from clients is untrusted input.

## 2. Threat model (STRIDE-style, MVP-relevant)

| Threat | Example | Primary controls |
|---|---|---|
| Privilege escalation | Player grants self admin / edits another's event | No client write grants on core tables; `platform_admins` writable only with service credentials; RPC ownership checks; negative tests (§11) |
| Capacity/race abuse | Parallel approvals overfill | Row lock + constraint trigger + tests (DATABASE §8) |
| IDOR / data scraping | Enumerate profiles, participants, locations | RLS on all tables; UUID ids; masked reads via RPC; rate limits; `APPROVED_ONLY` locations |
| Fake attendance / XP farming | Colluding friends | Organizer attestation + caps + distinct-participant rules + moderation flags (RATING_SYSTEM §5, §9) |
| Review manipulation / retaliation | Mutual 5-stars; revenge reviews | Double-blind, reciprocity decay, flags, hide-review moderation |
| Harassment / stalking / unsafe meetups | Targeting a user; fake events | Blocking, reporting, privacy defaults, approved-only locations, suspension, 18+ gate, safety tips |
| Spam / bots | Mass sign-ups, spam events | CAPTCHA, email verification, per-user quotas, new-account limits, moderation queue |
| Account takeover | Credential stuffing | Supabase Auth rate limits, breached-password check (enable leaked-password protection), strong password policy, admin MFA, session revocation on password change |
| Injection / XSS | Malicious titles/descriptions | Parameterized RPC only (no dynamic SQL from input); output as plain text (no HTML/markdown rendering in MVP); URL fields parsed and allowlisted (`https`, `wa.me`, etc.) |
| Secret leakage | Service key in bundle | Only `anon` key + URL in clients; CI secret scan; `.gitignore` for env/keystores |
| Insecure uploads | Malware/oversized images | MIME allowlist, size cap (2 MB), server-side path policy, re-encode client-side, no user-controlled filenames |
| Data leakage via logs/analytics | PII in Sentry | Scrubbing, allowlisted props, no free text in events |
| Insider/admin abuse | Unaudited admin reads | Admin actions via audited RPCs, MFA, least number of admins |
| Supply chain | Malicious dependency | Lockfile, `pnpm audit` + Dependabot/Renovate in CI, minimal dependency policy, pinned versions, review of install scripts |
| Denial of service | Expensive searches | Pagination caps, query timeouts (`statement_timeout` for API roles), indexed filters, viewport caps |

## 3. Authentication and sessions

- Supabase Auth, email + password; **email verification required** before creating events or requesting to join; password reset by email; leaked-password protection and minimum length ≥ 10 enabled; CAPTCHA (Cloudflare Turnstile) on sign-up, every sign-in, reset and the verification resend (app side built; hosted configuration pending, LAUNCH_CHECKLIST §2).
- JWT lifetime short (≤ 1 h) with refresh rotation; refresh-token reuse detection on; sign-out revokes the session; password change revokes other sessions.
- Production email requires **custom SMTP** (the built-in server is limited to 2 messages/hour and team addresses only) with SPF/DKIM/DMARC, a dedicated sending domain, and a standby provider; Auth rate limits tuned.
- Native: session encrypted at rest (key in Keychain/Keystore via `expo-secure-store`). Web: Supabase default storage; mitigations are a strict CSP (no inline scripts, `connect-src` limited to our Supabase domain and tile provider), no third-party scripts, `Referrer-Policy: strict-origin-when-cross-origin` (note: if OSM tiles were ever used the Referer must not be stripped — we do not use them), HSTS, `X-Content-Type-Options`, frame-ancestors none.
- Admin: TOTP MFA required; admin RPCs check `aal2`; admin sessions shorter.
- Future OAuth: Apple's App Review guideline 4.8 requires an equivalent privacy-preserving login option (in practice Sign in with Apple) when third-party/social login is offered on iOS — evaluate when adding Google or other providers.
- Age: self-declared 18+ at onboarding (`adult_confirmed_at`). This is a policy gate, not identity or age verification; limitations disclosed to legal.

## 4. Authorization model

- Server-side only. UI role checks are cosmetic.
- Reads: RLS (DATABASE §10). Writes: `SECURITY DEFINER` RPCs that verify `auth.uid()`, ownership, state and quotas, with `SET search_path = ''`, fully qualified names, `REVOKE ... FROM PUBLIC, anon`, explicit `GRANT ... TO authenticated`.
- Admin = presence in `platform_admins` checked by `private.is_admin()`; never from JWT user metadata (user-editable) and never from a claim alone.
- Event-scoped organizer = `events.organizer_id = auth.uid()`; participants via `event_participations`.
- Rules for new code: every new table ships with RLS enabled and policies/tests in the same migration; CI fails if any `public` table lacks RLS or any function is `SECURITY DEFINER` without `search_path`.
- Supabase security advisor must be clean (no "RLS disabled", no exposed `SECURITY DEFINER` views) before release.
- Views: use `security_invoker = true`.

## 5. Abuse prevention

- **Guest discovery (D-09) widens the unauthenticated surface.** Controls: whitelist of `anon`-executable RPCs (CI test enumerates every function's `anon` execute privilege and compares with the whitelist); no personal data in guest responses beyond organizer display name/avatar; hidden locations snapped to a coarse grid; page-size cap and `statement_timeout`; IP-level rate limiting/WAF at the CDN in front of the API custom domain (Supabase itself only offers coarse limits — verify at deployment); no sequential identifiers; scraping of public event listings is accepted as residual risk, kept low-value by the above.

- Quotas (per user, per rolling day; tunable): create ≤ 5 events, join requests ≤ 30, reports ≤ 20, profile edits throttled, review submissions bounded by eligibility.
- Accounts younger than 7 days get tighter quotas (≤ 2 events/day, ≤ 10 join requests/day) instead of a publishing ban, so genuine new organizers are not blocked; tunable through `app_config`. **Built (Phase 6 M6)** in `private.account_quota`, used by `create_event` and `request_join`; display names refuse links, addresses and phone numbers, and profanity is not checked (it needs a list somebody owns).
- Duplicate-participation prevention by UQ; re-request cap; spam detection heuristics (identical descriptions across many events, URL density) → moderation queue.
- Content: plain-text only; length limits; basic profanity/URL checks for display names; reports route to the admin queue.
- Blocking and reporting are available from every user-facing surface; report SLA is an operations commitment to define before launch (target: triage within 24 h).

## 6. Data protection

- Encryption in transit (TLS) and at rest (Supabase-managed). No secrets in repo or bundles; `.env.example` documents variables; real values live in hosting/Supabase secret stores.
- Storage: `avatars/{user_id}/…` policy permits writes only to the owner's prefix, enforces size/MIME limits; delivery via signed URLs or a public bucket **only for avatars** (decision D-10: public avatars reveal that an avatar exists to anyone with the URL, mitigated by unguessable object names).
- Least-privilege DB roles; service-role key is used only in Edge Functions/CI migrations, never shipped.
- Backups: Supabase automated backups; PITR evaluated for production plan; restore drill before pilot (DEPLOYMENT).
- Logs exclude tokens, emails, free text, coordinates.

## 7. Privacy by design

- Private by default: `profile_visibility = EVENT_PEERS`; location optional; marketing consent off.
- **User location** is never stored or shared; discovery queries pass a transient point or a district. **Event locations** may be hidden until approval. Pins for hidden-location events are snapped to a ≥ 300 m grid.
- Minimal collection: no phone number, no DOB (only `adult_confirmed_at`), no government id, no gender (post-MVP inclusion features, if any, will be opt-in and need a purpose review).
- Join requests disclose a minimal game-relevant profile to the organizer, stated at request time.
- Participants see each other only after approval.
- Notifications store ids, not names.
- Export and deletion are first-class (§8).

## 8. KVKK (Turkey) and data lifecycle — items requiring legal review before public launch

Engineering will implement the technical hooks; the following need a Turkish-law-qualified reviewer. I make no compliance claim.

1. **Data controller identity, VERBİS registration obligation** and thresholds.
2. **Aydınlatma metni** (privacy notice) content, versioning and presentation at sign-up; link in onboarding and settings.
3. **Legal bases & explicit consent**: which processing relies on contract/legitimate interest vs *açık rıza* (explicit consent); separation of marketing consent; location and profiling (reliability/skill scores) assessment, including whether automated scoring that affects access needs additional disclosure.
4. **Cross-border transfer**: Supabase (AWS eu-central-1, Frankfurt), Sentry, SMTP and tile providers process data abroad. The post-2024 KVKK Art. 9 regime (adequacy decision / appropriate safeguards such as standard contracts and notification to the Authority / explicit consent as a last resort) must be applied and documented; consider whether to minimize with first-party analytics (already planned).
5. **Retention & destruction policy** (*saklama ve imha politikası*): confirm the periods proposed in DATABASE §11; periodic destruction logs.
6. **Data subject rights** (access, correction, erasure, objection, portability-style export) — process, SLAs (30-day statutory response), identity verification for requests; the in-app export/deletion are the technical channel.
7. **Marketing communications** (Law No. 6563 / İYS registration, opt-in records in `user_consents`).
8. **Intermediary/hosting liability and takedown duties** for user-generated content (Law No. 5651), and the response procedure to authority requests.
9. **Terms of Service**: user conduct, organizer responsibilities, **assumption-of-risk / injury disclaimers**, disclaimer that MatchUp does not guarantee venue bookings, collect payments, or verify identities/skill; handling of money exchanged offline between users.
10. **Age policy**: 18+ self-declaration adequacy; handling minors discovered.
11. **Data breach notification** procedure (72-hour notification to the Authority under KVKK) and incident response owner.
12. **App-store disclosures** (Apple privacy nutrition labels, Google Data Safety) consistent with the above.

Technical hooks already designed: versioned consents (`user_consents`), export, deletion with anonymization, retention jobs, audit logs, analytics minimization.

## 9. Account deletion and anonymization

See DATABASE §11. Security points: deletion requires recent re-authentication; 30-day grace with cancel; every step is audit-logged without PII; admin cannot restore after purge.

As built (ADR-0017): re-authentication is checked **server-side** from the token's `amr` (password within 10 minutes, `REAUTH_REQUIRED`); the purge is SQL run by `pg_cron` as the owner role (no service-role key anywhere); export is an RPC returning only the caller's data, once per 24 h, serialized per user; the audit log lives in `private` (not reachable through the Data API) and is append-only. Storage cleanup arrives with avatars (a Storage API step in the purge).

## 10. Platform policy and licensing compliance

- **Apple App Store 1.2 (user-generated content)** and **Google Play UGC policy** require: objectionable-content filtering approach, in-app reporting, blocking, timely response, and published contact info → FL-9, FL-11 and a support contact in settings. **Apple 5.1.1(v)** requires in-app account deletion initiation → FL-10.
- **OpenStreetMap/ODbL & tile/geocoding policies** — see ARCHITECTURE §13. Attribution must be visible on any OSM-derived map; share-alike risk for derived databases is a legal item before importing OSM venues.
- **Google Maps/Places** not scraped or bulk-stored.
- Third-party licenses audited in CI (license-checker) before release.

## 11. Security test plan (negative paths; each is an automated test)

| # | Case | Expected |
|---|---|---|
| S-1 | User A updates/cancels/deletes user B's event via RPC and via direct REST | rejected (`NOT_ALLOWED` / RLS) |
| S-2 | Requester approves own request (sole actor, not organizer) | rejected |
| S-3 | Organizer of event X approves a participation of event Y | rejected |
| S-4 | Non-participant reads participant list/private details/exact location | no rows |
| S-5 | Pending requester reads other requesters | no rows |
| S-6 | User inserts into `platform_admins`, edits `profiles.account_status`, or sets metadata role | rejected, no effect |
| S-7 | Direct `UPDATE event_participations SET status='APPROVED'` via REST | rejected (no grant) |
| S-8 | Review without attendance / for non-finalized event / outside window / self / duplicate / blocked pair | rejected with specific codes |
| S-9 | Re-finalizing an event or replaying review submission awards XP twice | no additional rows |
| S-10 | Direct write to `xp_transactions`, `user_progress`, `user_sport_ratings` | rejected |
| S-11 | `anon` role calls any write RPC or any RPC other than the whitelisted guest read RPCs; unverified email calls create/join | rejected |
| S-21 | Guest (`anon`) reads: participant lists, private details, exact hidden locations, non-public events, user profiles beyond organizer display name/avatar, page size > cap | no rows / capped |
| S-12 | Blocked user views blocker's events/profile or requests to join | hidden / rejected |
| S-13 | Suspended user attempts any write | rejected (`ACCOUNT_RESTRICTED`) |
| S-14 | Non-admin calls `admin_*` RPCs; admin without AAL2 calls them | rejected |
| S-15 | Capacity race: N parallel approvals for last slot | exactly one succeeds |
| S-16 | Rate-limit exceeded (events, requests, reports) | `RATE_LIMITED` |
| S-17 | Upload non-image / oversize / other user's path | rejected |
| S-18 | `INVITE_ONLY` event discovery without token | not returned: absent from search and My Events listings of others, `get_event` and `request_join` answer `NOT_FOUND` without the token (pgTAP 11, integration `get-event`, E2E invite flow). Invite links are capability URLs (ADR-0021): no rotation yet, keep the query string out of analytics and logs |
| S-19 | Schema checks: every public table has RLS; no `SECURITY DEFINER` function lacks `search_path`; no secrets in bundle | CI gate |
| S-20 | XSS payloads in titles/descriptions/names | rendered as inert text |

Additional release activities: dependency audit, Supabase security advisor, manual authorization review of every RPC, external penetration test or structured review before the pilot (recommended), and a documented incident-response checklist.

## 12. Phase 1 implementation status

Implemented and tested (details and evidence: [PHASE1_REPORT §4](PHASE1_REPORT.md), ADR-0014):
- Deny-by-default database grants; RLS on every table (CI-enforced); no client write path on any table; `SECURITY DEFINER` hygiene enforced by a catalogue-wide pgTAP check (empty `search_path`, no PUBLIC/anon execute).
- Email verification required before sign-in; server-side minimum password length 10; PKCE with single-use, verifier-bound codes; refresh rotation; JWT 1 h.
- Public client holds only the anon key; the env validator rejects `service_role`/`sb_secret_` keys; CI scans the built bundle and git history for privileged credentials.
- Allow-listed email-link destinations and open-redirect-safe `returnTo`; redaction of PII/secrets in logs and error reports before they leave the device.
- Guest (`anon`) surface is exactly: read `app_config`; **no RPC is executable by anon** (the guest event RPC whitelist begins in Phase 3, ADR-0013).

**Residual / open (see PHASE1_REPORT §4–5):** sign-up enumeration signal (`user_already_exists`); hosted-only protections untested locally (CAPTCHA, leaked-password protection, custom SMTP, production rate limits); web session in `localStorage` requires CSP before launch; consent/18+ capture arrives with onboarding (Phase 2); native secure-storage behavior unverified on a device; no admin RPCs or MFA enforcement exist yet (Phase 6).
