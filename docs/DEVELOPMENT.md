# Development Guide

Status: reflects the repository at the end of Phase 1 (2026-10-24). Everything here was exercised on Windows 11 with Git Bash/PowerShell.

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **24.x** (≥ 24.3; tested 24.11.1) | `.nvmrc`; `engine-strict=true` |
| pnpm | **10.33.x** | pinned by `packageManager`; `corepack enable` or `npm i -g pnpm@10.33.0` |
| Docker Desktop | recent (tested 29.1.3) | **must be running** for the local Supabase stack; Windows needs WSL2 |
| Git | any recent | hooks via husky run on commit |
| Chromium for Playwright | installed on demand | `pnpm --filter @matchup/app e2e:install` |

Not required for Phase 1: Android Studio, Xcode, EAS account, a hosted Supabase project.

> **Do not keep the repository inside OneDrive (or any cloud-sync folder) if you can avoid it.** `node_modules`, `.expo`, `dist` and the Supabase CLI's `.temp` (which holds local-stack secrets) are all written inside the tree. Installs worked here, but sync adds latency, file-lock errors (we saw one intermittent Vitest `EPERM`) and uploads git-ignored local credentials to a cloud account. A path like `C:\dev\matchup` is safer.

## 2. First-time setup

```bash
pnpm install                      # frozen versions via pnpm-lock.yaml; installs git hooks (husky)
pnpm db:start                     # starts the local Supabase stack in Docker (first run downloads images), applies migrations + seed
pnpm env:local                    # writes apps/app/.env.local with PUBLIC values only (API URL + anon key)
pnpm --filter @matchup/app e2e:install   # one-time Playwright browser download
```

`apps/app/.env.local` is git-ignored. The service-role/secret keys printed by `supabase status` are never read or written by our tooling, and the app **refuses to start** if a `service_role`/`sb_secret_` key is placed in `EXPO_PUBLIC_*` (`src/lib/env.schema.ts`).

## 3. Everyday commands

| Command | What it does |
|---|---|
| `pnpm --filter @matchup/app web` | Expo dev server for web at http://localhost:8081 |
| `pnpm --filter @matchup/app start` | Expo dev server (choose platform in the terminal; native needs a dev build, see §5) |
| `pnpm check` | typecheck + lint + format check + brand check + script tests + unit/component tests |
| `pnpm test:integration` | Vitest against the **running local stack** (Data API exposure, real Auth + Mailpit, health function, concurrency harness) |
| `pnpm db:test` | pgTAP: schema, RLS, grants, `SECURITY DEFINER` hygiene, negative authorization |
| `pnpm test:e2e` | Playwright + axe in Chromium (exports the SPA, serves it on :4173); auth specs need the stack (`REQUIRE_STACK=1` makes a missing stack fail) |
| `pnpm test:coverage` | coverage with enforced thresholds for `packages/*` |
| `pnpm db:reset` | drops and recreates the local DB from migrations + seed |
| `pnpm db:types` | regenerates `apps/app/src/types/supabase.generated.ts` (CI fails if it drifts) |
| `pnpm db:stop` | stops the stack |
| `pnpm check:bundle` / `check:bundle-size` | after `pnpm --filter @matchup/app export:web`: no privileged keys in the bundle / size ratchets (total + initial, docs/PERFORMANCE.md) |
| `.\scripts\android\dev.ps1 up` / `down` / `validate` | Android bench on Windows (PowerShell): local Supabase + emulator + tunnels + Metro; `validate` runs the 22-check device suite (docs/ANDROID_SETUP.md) |
| `bash scripts/android/build-apk.sh debug x86_64` | builds the debug APK in the pinned Linux container (needed only after native changes: a new native dependency, app config) |
| `node scripts/auth-probe.mjs` / `node scripts/auth-lab.mjs up` | account-enumeration probe and the isolated CAPTCHA lab stack (docs/AUTH_ABUSE.md) |

The pgTAP and integration tests scope their assertions to their own fixtures, so they also pass on a database that already holds users from device runs; `pnpm db:reset` gives a pristine one (what CI uses).

Local-only services: API http://127.0.0.1:54321 · Postgres 127.0.0.1:54322 · **Mailpit** (all auth emails) http://127.0.0.1:54324.

## 4. Repository map

```
apps/app/            Expo app (iOS, Android, Web) — routes in app/, code in src/
  src/features/      auth, catalog (sports/cities + pickers), onboarding (gate, 18+/consent, legal drafts),
                     profile (view/edit/sports/settings), settings (language picker); api/ folders are the
                     only places that call Supabase
  src/lib            env, i18n (+ stored language choice), supabase client (+ crypto polyfill), observability, query client
  e2e-mobile/        Maestro flows for the Android device suite (results are git-ignored)
  src/ui             tokens, theme, components (provisional design — see UI_DESIGN_SYSTEM.md)
  e2e/               Playwright specs (+ support/)
packages/domain      pure TypeScript: error codes, auth schemas, level formula
packages/config      brand + market constants (the ONLY place the product name may appear)
packages/db-tests    integration tests against the local stack + concurrency harness
supabase/            config.toml, migrations/, seed/, functions/health, tests/database (pgTAP)
scripts/             repo tooling (type generation, env writer, brand/bundle/secret checks) + tests
```

Rules enforced by lint/CI: Supabase is imported only in `src/lib/supabase` and `src/features/*/api`; features are imported only through their `index.ts`; no hard-coded product name outside `packages/config`; no hard-coded UI strings are *linted yet* (parity tests cover resources — a literal-string lint rule is a Phase 2 item).

## 5. Platform validation status (be honest about this)

| Platform | Status |
|---|---|
| Web (Chromium) | **Verified**: dev server, static export, 40 Playwright tests, axe (WCAG 2.2 AA tags) on the account, onboarding, legal and profile screens |
| Web (Firefox, Safari) | **Not tested** |
| Android | **Verified on an emulator** (Android 16, x86_64): 22 automated device checks incl. sign-up, onboarding, profile edit and database assertions; see docs/NATIVE_VALIDATION.md for what is and is not covered |
| Android (physical device, release build, TalkBack walk-through) | **Not tested** |
| iOS | Bundle compiles. **Never launched** — iOS builds need macOS or EAS cloud builds + an Apple Developer account |

Android setup, the container build and the Windows-specific pitfalls are in docs/ANDROID_SETUP.md and ADR-0015.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `failed to connect to the docker API` | Docker Desktop is not running — start it, wait for the engine |
| `Local Supabase Auth is not reachable` (integration tests) | `pnpm db:start` first |
| E2E tests all fail with odd content | a stale `serve` process from an earlier run is still listening on :4173 — stop it (`Get-NetTCPConnection -LocalPort 4173` in PowerShell) |
| `EnvError: Invalid environment configuration` | missing `EXPO_PUBLIC_*` — run `pnpm env:local` (stack must be running) |
| pnpm: "Ignored build scripts" | intentional (supply-chain safety). Only `supabase` is allow-listed in `pnpm-workspace.yaml` |
| Types drift in CI | run `pnpm db:types` locally and commit the result |
| Port 54321/54322 already in use | another Supabase stack is running (`pnpm db:stop` or `supabase stop --all`) |
| Prettier reformatted a file you must not touch | add it to `.prettierignore` (we do this for the local `settings.json`) |
