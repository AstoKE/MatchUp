# Phase 7 report: pilot readiness for all of Turkey

Status 2026-11-07. The plan, with each milestone's details, is in [PHASE7_PLAN](PHASE7_PLAN.md). The checklist with owners is [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md). This report says what Phase 7 left behind and what still stands between the repository and real users.

## 1. What was built

| Milestone | Result | Where |
|---|---|---|
| M1 | The whole life of an event in one web E2E flow; the checklist rewritten with owners | PR #77, `e2e/lifecycle.spec.ts` |
| M2 | Every RPC and RLS policy reviewed and frozen in an inventory that CI compares; S7-1 fixed; the outside surface check | PR #78, SECURITY_REVIEW |
| M3 | k6 load scenarios at 100k events / 500k participations within budget (local stack); the catalog kept on the device | PR #79, PERFORMANCE §4b |
| M4 | Pilot metrics from the service's own data; usage analytics opt-in with a consent text, deleted on withdrawal; the health function; error-report redaction | PR #80, ADR-0025, DEPLOYMENT §13 |
| M5 | axe on every route at two widths, a keyboard-only path (found and fixed the cards' Enter), English split out of the initial bundle, the copy list for a native speaker | PR #81, A11Y_CHECKLIST, COPY_REVIEW |
| M6 | Maestro flows 23–25 (province and map, near me, report an event) and their database checks, written, **not run** (no Android work on this laptop) | PR #82, NATIVE_VALIDATION |
| M7 | Open sign-up decided (ADR-0026) with ordered steps and a surface check for it; a support contact in the app with a placeholder; the operations runbook | this PR, DEPLOYMENT §14, OPERATIONS |

## 2. What was actually verified

- **Gates:** `pnpm check`, `pnpm db:test`, `pnpm test:integration` and `pnpm test:e2e`, on the local stack and in CI, for every merged PR.
- **Hosted, by the founder:**
  - the migrations through Phase 7 M4 were pushed;
  - `hosted-surface.mjs` showed PASS on every line except `health`, which is not deployed.
- **iOS:** the EAS device build was checked by hand by the founder.
- **Android:** on the emulator, Phases 2–3 (earlier). Phases 4–7 have **not** run on any Android device.
- **M7:** `hosted-surface.mjs` was dry-run on the local stack in both modes:
  - the closed mode fails because local sign-up is on;
  - the open mode fails because local CAPTCHA is off. This is the expected result.

  The PASS path of the CAPTCHA check is unverified until a CAPTCHA-protected project exists.

## 3. Go / no-go for opening sign-up

**Go** needs every line below to be checked. The order follows DEPLOYMENT §14.

| # | Item | Owner | State |
|---|---|---|---|
| 1 | Real SMTP with SPF/DKIM; a reset email arrives and is not spam | founder | open |
| 2 | Auth rate limits set and written into AUTH_ABUSE | founder | open |
| 3 | Leaked-password protection on (if the plan offers it) | founder | open |
| 4 | Redirect URLs: only the production origin and the app scheme | founder | open |
| 5 | Turnstile secret in hosted Auth **and** the site key in the production build, enabled together; sign-in still works | founder | open (app side built) |
| 6 | Support address set in `brand.ts` and the inbox read | founder + code | open (placeholder built) |
| 7 | An administrator with TOTP on hosted; the runbook's response times confirmed | founder | open (runbook built) |
| 8 | `health` deployed and watched; Sentry DSN in the production build; a backup restore rehearsed | founder | open |
| 9 | A production web host with the headers of DEPLOYMENT §12 (CSP report-only first) | founder | open |
| 10 | Draft legal texts accepted as a risk (ADR-0026) | founder | **accepted 2026-11-07** |
| 11 | After switching on: `hosted-surface.mjs --signup open` all PASS, `auth-probe.mjs` re-run, one real sign-up end to end | founder | open |

**No-go, which keeps sign-up closed or closes it again:**
- any FAIL in the surface check;
- sign-in broken after the CAPTCHA change;
- confirmation emails not arriving;
- no administrator able to open `/admin`.

**Not blocking the pilot, but owed:**
- counsel's review of the Terms, the Privacy Notice, the analytics consent and the 18+ declaration, followed by publishing them as a new version (LAUNCH_CHECKLIST §1);
- the native-speaker copy review;
- Android validation of Phases 4–7 on a real device or a cloud runner;
- VoiceOver and TalkBack (A11Y_CHECKLIST);
- the final store identifiers and listings (ADR-0010).

## 4. Risks

- **Legal:** real personal data under draft texts until counsel approves them. The founder accepted this risk; the code cannot reduce it.
- **One operator** (R-9). The runbook's levers are the quotas, suspension and closing sign-up.
- **Android untested for Phases 4–7.** The map, the pin picker, near me and reporting may break on devices. Web and iOS are the safer first audience.
- **Hosted performance and Auth limits are unmeasured.** The load numbers come from the laptop.
- **Enumeration** stays possible at a cost (ADR-0016).

## 5. Next steps

1. Merge #82 and this PR.
2. The founder works through §3 in order. Claude can prepare the support-address PR and the CSP file for the chosen web host.
3. After counsel: a migration that publishes the legal texts as a new version, plus the re-consent gate.
4. Android validation off this laptop: EAS Build plus an emulator on a GitHub Linux runner, or the founder's phone.
