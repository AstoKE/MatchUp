# Authentication abuse: enumeration, CAPTCHA and rate limits

Status 2026-10-25. Measurements below were taken against the **local** Supabase stack and a **local lab stack** (`scripts/auth-lab.mjs`). **No hosted project exists yet, so nothing here has been verified against hosted Supabase.** Decision recorded in [ADR-0016](ADR/0016-auth-abuse-controls.md).

## 1. Question and method

Can someone who talks to the Auth API directly (the anon key is public by design) learn whether an email address is registered, and what raises the cost of doing it at scale?

`node scripts/auth-probe.mjs --n 40` creates one confirmed user, then sends *n* requests for that address and *n* for random unregistered addresses to each endpoint (interleaved), and reports (a) whether the observable response is identical (status, error code, body shape, message with the address removed) and (b) how well the best single timing threshold, in either direction, separates the two groups (50 % = no signal, 100 % = one request is enough). Local, n = 40 per group.

## 2. Findings without any mitigation (developer stack)

| Endpoint | Response identical? | Timing registered vs unregistered (median) | Timing classifier |
|---|---|---|---|
| sign-up | **No**: `422 user_already_exists` vs `200` | 7 ms vs 56 ms | **100 %** |
| sign-in, wrong password | Yes (`400 invalid_credentials`) | **43 ms vs 3 ms** (password hash is only computed for real accounts) | **100 %** |
| password reset | **No** under repeat: the 2nd request for a *registered* address gets `429 over_email_send_rate_limit` (an email really was sent); an unregistered one never does | 4 ms vs 2 ms | 98 % |

Two of these were **not** in ADR-0014: the sign-in timing difference (the ADR says sign-in is "indistinguishable", true for content only) and the password-reset 429 oracle. Every endpoint leaks through at least one channel. With the hosted default (reset cooldown 60 s) the reset oracle works the same way.

## 3. What each mitigation does (lab stack: CAPTCHA on, Cloudflare's always-pass **test** secret)

| Probe | Result |
|---|---|
| no captcha token (a plain script) | all three endpoints answer registered and unregistered addresses with the **same** `400 captcha_failed` → the script learns nothing |
| with an accepted token (what a CAPTCHA-solving service would provide) | **all three leaks are back** (sign-up 422 vs 200; sign-in timing 100 %; reset 429 oracle, timing 75 %) |

So CAPTCHA is an **automation cost**, not an anti-enumeration fix: it stops free, scripted, high-volume probing and does nothing against an attacker who pays per solve. The server-side enforcement itself works (and is covered by the lab, not by CI).

**Rate limits could not be tested locally.** With `sign_in_sign_ups = 20` the local stack processed 60 password sign-in attempts from one IP without a single `429`; the setting is not applied to the password grant there. The hosted default (documented as 30 requests per 5 minutes per IP for sign-up/sign-in) is **unverified** until a hosted project exists.

## 4. Why an Edge proxy is not recommended

ADR-0014 floated an Edge Function that fronts sign-up with a uniform response. The data says it would not remove the risk it targets:

- The Auth API (`/auth/v1/signup`, `/token`, `/recover`) stays reachable with the public anon key. An attacker simply skips our proxy; Supabase cannot switch these endpoints off while the app uses them.
- It could not equalize sign-in or reset timing for direct callers either.
- It would hold the service-role key in a new component, re-implement password policy and email sending, and need its own rate limiting and CAPTCHA, all to protect a path the attacker does not have to use.

A proxy would only help if **public sign-up were disabled** and registration ran exclusively through our function (e.g. invite-only, or a closed pilot). That is a product decision, not a security patch, and is listed as an option below.

## 5. Decision and plan

Accepted residual risk, stated plainly: **a determined attacker can learn whether a given email address has an account.** We reduce volume and cost; we do not claim to prevent it. Email addresses are not secrets in this product (no health, finance or similar data in the account existence itself), but counsel should confirm this reading for KVKK (⚖).

Before public registration (also in `LAUNCH_CHECKLIST.md`):

1. Turn on **CAPTCHA** (Turnstile) for sign-up, sign-in and password reset in the hosted project, and send `captchaToken` from the app. **Not built.** Web: the Turnstile widget; native: a WebView-hosted challenge. Needs a founder decision on the provider account and a UX review (it adds friction in a Turkish-first, mobile-first app).
2. Verify hosted **rate limits** with `auth-probe`-style bursts against the hosted project (sign-in/sign-up per IP, email send, reset cooldown ≥ 60 s) and write the observed numbers here.
3. Keep error text identical (already true) and never add "no such account" wording.
4. Optional, product-level: **closed or invite-only pilot** with public sign-up disabled. This both removes the sign-up oracle and fits a small Ankara pilot; it is the only configuration where an Edge-fronted registration would add real protection.
5. Re-run `scripts/auth-probe.mjs` against the hosted project after any Auth setting change; a drift in the table above should be reviewed.

## 6. Not tested

Hosted-project behaviour (limits, CAPTCHA with a real widget and real solver cost), timing over a real network with jitter (local numbers are an upper bound on separability; a 40 ms gap is large but real-world detectability needs a measurement), per-account lockout (Supabase has none beyond IP limits), and abuse through OAuth/magic-link flows (not enabled).
