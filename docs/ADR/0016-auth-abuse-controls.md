# ADR-0016 — Authentication abuse controls and the account-enumeration posture

**Status:** Accepted (Phase 2, 2026-10-25). Amends ADR-0014 §4.

**Context.** ADR-0014 recorded one residual enumeration signal (sign-up for a confirmed address answers `422`) and floated an Edge Function in front of sign-up. Phase 2 measured the real behaviour with `scripts/auth-probe.mjs` on the developer stack and on a lab stack with CAPTCHA enabled (`scripts/auth-lab.mjs`); details and numbers are in [AUTH_ABUSE.md](../AUTH_ABUSE.md).

**Findings that change the picture.**
1. Sign-in answers identically but **its response time separates registered from unregistered addresses in 100 % of samples** (≈ 43 ms vs ≈ 3 ms locally): the password hash is only computed for real accounts. ADR-0014's "indistinguishable" was true for content only.
2. Password reset has an oracle too: a repeated request for a registered address hits the email cooldown (`429`), an unregistered one never does.
3. CAPTCHA makes a plain script learn nothing (identical `captcha_failed` for both groups) but, with an accepted token, **every leak returns**. It raises cost; it does not fix the signal.
4. The local stack does not throttle password sign-ins at all (60 of 60 processed with the limit set to 20), so hosted rate limits cannot be validated until a hosted project exists.

**Decision.**
1. We do **not** claim to prevent address enumeration. The accepted residual risk is that a determined attacker can learn whether an email has an account; we reduce volume and cost with CAPTCHA and IP rate limits and keep all error text identical.
2. **No Edge Function proxy.** The Auth endpoints stay reachable with the public anon key, so a proxy can be bypassed and could not equalize sign-in/reset timing; it would add a service-role-holding component for no demonstrable gain. It becomes worthwhile only if public sign-up is disabled (closed/invite-only pilot) — a product decision, kept as an option.
3. Before public registration: CAPTCHA (Turnstile) on sign-up, sign-in and reset with `captchaToken` sent by the app; hosted rate limits verified with measured numbers; email through real SMTP; counsel confirms the residual risk is acceptable for KVKK. Tracked in `docs/LAUNCH_CHECKLIST.md`.
4. `scripts/auth-probe.mjs` is re-run against the hosted project after any Auth setting change.

**Consequences.** + The risk is measured, bounded and written down instead of assumed. + No new moving part. − CAPTCHA integration (web widget, native WebView) is still to build and adds friction. − Timing and reset-oracle signals remain for anyone willing to pay for solves. − Hosted behaviour is unverified.
