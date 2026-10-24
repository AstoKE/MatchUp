# Phase 1 · M0 — Compatibility Spike Report

Date: 2026-10-24 · Verdict: **PASS — Expo SDK 58 is adopted; SDK 57 fallback not needed** (ADR-0009).

The spike was a throw-away pnpm workspace built **outside the repository** (and outside OneDrive): `apps/app` (Expo SDK 58 blank-TypeScript template + Expo Router) and `packages/domain` (pure TS + Zod + Vitest). Nothing from it is committed; its findings shaped the real scaffold (M1).

## Environment

| Item | Value |
|---|---|
| OS | Windows 11 Pro 10.0.26200, 31 GB RAM |
| Node / npm / pnpm | 24.11.1 / 11.12.0 / 10.33.0 |
| Git | 2.50.0 |
| JDK | 24.0.2 (present; no Android SDK) |
| Docker | CLI 29.1.3 installed; daemon was **not running** at the time of M0 (see M5) |
| Android SDK / emulator, Xcode | **not installed / not available on Windows** |

## Installed versions (exact, from `pnpm ls`)

| Package | Version | Package | Version |
|---|---|---|---|
| expo | 58.0.19 | react / react-dom | 19.3.0 |
| react-native | 0.88.0 | react-native-web | 0.21.4 |
| expo-router | 58.0.26 | @expo/metro-runtime | 58.0.15 |
| expo-linking / expo-constants | 58.0.14 / 58.0.13 | expo-localization / expo-secure-store | 58.0.5 / 58.0.2 |
| react-native-reanimated / worklets | 4.7.1 / 0.13.0 | react-native-screens | 4.30.0 |
| react-native-safe-area-context | 5.10.1 | react-native-gesture-handler | 3.3.0 |
| typescript | 6.0.3 | eslint / eslint-config-expo | 9.39.5 / 58.0.4 |
| jest / jest-expo | **30.5.2** / 58.0.12 | @react-native/jest-preset | 0.88.0 |
| @testing-library/react-native | 14.1.0 | test-renderer | 1.3.1 |
| vitest | 5.0.5 | zod | 4.6.7 |
| @playwright/test / @axe-core/playwright | 1.64.1 / 4.14.0 | Chromium (headless shell) | 156.0.8078.4 |

## Checks and results

| # | Check | Result |
|---|---|---|
| 1 | `pnpm install` in a workspace (isolated `node_modules`, default linker) | ✔ 462 packages in ~19 s; no `node-linker=hoisted` fallback needed |
| 2 | `npx expo install` of router + native modules resolved versions from Expo's manifest | ✔ (versions above) |
| 3 | `tsc --noEmit` (TS 6.0.3, `strict`, `noUncheckedIndexedAccess`) | ✔ after adding `"types": ["jest"]` (see finding F-2) |
| 4 | ESLint 9.39.5 + `eslint-config-expo/flat` | ✔ no errors |
| 5 | Jest 30 + jest-expo + RNTL 14: component importing the workspace `@matchup/domain` | ✔ 1/1 passed |
| 6 | Vitest 5 on `packages/domain` | ✔ 1/1 passed (level-formula thresholds from RATING_SYSTEM §5.3) |
| 7 | `expo export --platform web` (`web.output: "single"`) with workspace package resolution | ✔ SPA exported |
| 8 | `expo export --platform android --platform ios` (Metro + Hermes bytecode compile) | ✔ both `.hbc` bundles produced (3.1 / 3.2 MB) |
| 9 | `npx expo-doctor` | ✔ 20/20 checks passed |
| 10 | Exported web served and loaded in headless Chromium via Playwright | ✔ expected text rendered; no console/page errors |
| 11 | axe-core on that page | 1 *moderate* finding `region` (content not inside a landmark) — expected for a bare prototype; the real shell defines a `main` landmark (M4) |

## Findings that change Phase 0 documents

| ID | Finding | Action |
|---|---|---|
| F-1 | **jest-expo 58 requires Jest 30**, not Jest 29: its dependencies are `^30` libraries, `jest-watch-typeahead@3` needs Jest 30, and it needs peer `@react-native/jest-preset@^0.88` and `test-renderer` (RNTL 14 peer). Phase 0 text said Jest 29 (taken from SDK 57 metadata) | ARCHITECTURE §6.4, ADR-0008, TESTING corrected |
| F-2 | **TypeScript 6 no longer auto-includes `@types/*`**; test globals need `"types": ["jest"]` (and other ambient types must be listed explicitly) | tsconfig.base documents it |
| F-3 | pnpm 10 skips dependency build scripts by default (`@parcel/watcher`, `unrs-resolver` ignored). Nothing failed; they are optional native accelerators. Keep default-deny (supply-chain safety) | Documented; revisit only if a real need appears |
| F-4 | `expo-doctor` is not a local bin; run it as `npx expo-doctor` | CI step |
| F-5 | Axe `region` rule requires a landmark; plan `main` landmark in the root layout | M4 |
| F-6 | Playwright + axe: pages must come from `browser.newContext()` | Harness note for M8 |

## Not verified in M0 (explicit gaps)

- **No Android emulator/device and no iOS simulator/device run.** Only bundle compilation for both native platforms (Metro + Hermes) was verified — this proves the JS compiles, not that the app launches or behaves correctly on a device. iOS cannot be run on this Windows machine at all; iOS validation requires EAS cloud builds + a device/TestFlight (outside Phase 1 unless credentials are provided).
- Interactive `expo start` dev-server/HMR session and development-build creation were not exercised.
- Behavior under OneDrive sync of `node_modules` (the real repo lives under OneDrive; the spike did not).
