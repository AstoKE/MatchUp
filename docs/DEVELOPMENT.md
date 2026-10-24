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
| `pnpm check:bundle` / `check:bundle-size` | after `pnpm --filter @matchup/app export:web`: no privileged keys in the bundle / size ratchet |

Local-only services: API http://127.0.0.1:54321 · Postgres 127.0.0.1:54322 · **Mailpit** (all auth emails) http://127.0.0.1:54324.

## 4. Repository map

```
apps/app/            Expo app (iOS, Android, Web) — routes in app/, code in src/
  src/features/auth  the only feature so far (api/ is the only place that calls Supabase Auth)
  src/lib            env, i18n, supabase client, observability, query client
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
| Web (Chromium) | **Verified**: dev server, static export, 28 Playwright tests, axe (WCAG 2.2 AA tags) on all pages |
| Web (Firefox, Safari) | **Not tested** |
| Android | Metro + Hermes **bundle compiles**. **Never launched** — no Android SDK/emulator/device on the development machine |
| iOS | Bundle compiles. **Never launched** — iOS builds need macOS or EAS cloud builds + an Apple Developer account |

To run on Android later: install Android Studio (SDK + an emulator, needs hardware virtualization), then `pnpm --filter @matchup/app exec expo run:android` (development build; Expo Go for SDK 58 was not yet published when this was written). Items that **only** a device can confirm are listed in PHASE1_REPORT §5.

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
