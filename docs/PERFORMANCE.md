# Performance: web bundle analysis and plan

Status 2026-10-25. **Web bundle size only.** Nothing here measures runtime speed, time-to-interactive, memory or the native (Hermes) app on a real device; those are not measured yet and no claim is made about them.

## 1. How it was measured

```bash
pnpm --filter @matchup/app exec expo export --platform web --source-maps   # needs EXPO_PUBLIC_* (pnpm env:local)
node scripts/analyze-bundle.mjs apps/app/dist      # estimated gzip per npm package, whole bundle
node scripts/bundle-chunks.mjs                     # which packages sit in which chunk; marks the INITIAL chunks
node scripts/bundle-files.mjs <package>            # which files of one package were pulled in
node scripts/check-bundle-size.mjs                 # the CI ratchet (total and initial)
```

Sizes are gzip level 9 of the exported files. Per-package numbers are source-map attributions (shared minifier output, module concatenation): good to a few percent, right for ranking, not for sub-kilobyte claims. Two different numbers matter and must not be mixed up:

- **TOTAL**: every JS chunk, including lazily loaded ones (the ratchet's original metric).
- **INITIAL**: the scripts `index.html` loads before anything renders. This is the first-paint cost.

## 2. Current numbers (2026-10-25)

| | gzip |
|---|---|
| TOTAL web JS | **917 kB** (1051 kB before the SVG tab icons; 1113 kB at the start of this work; 1400 kB was the Phase 1 ratchet) |
| INITIAL (`entry` 287 + `__common` 247 + runtime 4) | **~537 kB** |
| route chunk `_layout` (tab bar) | 1 kB (was 149 kB with Ionicons) |
| route chunk `index` (Sentry, lazy) | 373 kB |
| **first tabbed screen** (INITIAL + tab `_layout`) | **~538 kB** (was ~670 kB) |

What is in them:

| Chunk | Contents (minified) | Loaded |
|---|---|---|
| `entry` 287 kB | expo-router 423k, react-native-web 276k, react-dom 203k, expo-modules-core 16k | always |
| `__common` 247 kB | zod 145k, @supabase/auth-js 123k, app + workspace code 102k, @tanstack/query-core 60k, react-hook-form 48k, react-native-svg (web renderer, ~16 kB gzip) | always |
| `_layout` 1 kB | tab bar configuration (until 2026-10-25: 149 kB, the complete Ionicons glyph table plus expo-font and expo-asset) | with the tab screens |
| `index` 373 kB | **Sentry** (core 468k, conventions 340k, react-native 298k, replay 125k, browser 103k) | **only when `EXPO_PUBLIC_SENTRY_DSN` is set**, after start (dynamic `import()` in `lib/observability/sentry.ts`) |

Correction to an earlier reading: Sentry is about a third of the *total* but **not** part of the initial load; it is already lazy. It still costs bandwidth on every session once a DSN is configured.

## 3. What was done

1. **Three unused optional native libraries removed** (`react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`; only optional peers of expo-router): −196 kB gzip total, measured at the time with the same script.
2. **zod → `zod/mini`** (domain, env schema, API parsers; one unused duplicate loader deleted). Same rules, same stable error keys; all 42 domain, 236 app, 72 integration, 40 web e2e and 22 device checks pass. Alone this saved only ~7 kB, because of the next item.
3. **Unused zod modules resolved to an empty module** (`apps/app/metro.config.js`). `zod/mini` and `zod/v4/core` re-export (`export *`) every locale (~80 files), the JSON-Schema generator and the schema compiler; Metro does not tree-shake, so they shipped. They were ~90 % of zod's minified size. zod's own schema code only `import type`s from them. **zod: 471 kB → 145 kB minified, 114 → 37 kB gzip; TOTAL 1106 → 1051 kB.** Risk: a zod upgrade that renames those files would silently stop the stubbing (the size ratchet catches that) or, if zod starts using them at runtime, break validation (tests catch that). Re-check after every zod upgrade with `node scripts/bundle-files.mjs zod` (expect ~25 files, ~145 kB).
4. **Ratchets tightened**: TOTAL 1400 → 1080 kB, plus a new INITIAL ratchet of 540 kB (`scripts/check-bundle-size.mjs`).
5. **In-house SVG tab icons instead of Ionicons** (`src/ui/graphics/Icon.tsx`, `react-native-svg` 15.16.0 via `npx expo install`; `@expo/vector-icons` removed). Ionicons, expo-font and the icon font are no longer in the web bundle (checked by searching the exported chunks). **TOTAL 1048 → 917 kB (−131 kB); tab `_layout` 149 → 1 kB; INITIAL 521 → 537 kB (+16 kB)**, because the SVG renderer is shared code. Net for the first tabbed screen: ~670 → ~538 kB. Ratchets: TOTAL 1080 → 940 kB; INITIAL raised 540 → 555 kB with this reason recorded in the script. `expo-font` stays a direct dependency: `expo` and `@expo/router-server` depend on it and removing it risks native autolinking for no web gain. Native: `react-native-svg` is a native module, so the Android dev APK must be rebuilt (ADR-0015 container).

## 4. Plan, in order of measured benefit

| # | Change | Expected effect | Needs |
|---|---|---|---|
| 1 | ~~Replace Ionicons for the tab bar with inline icons~~ | **Done 2026-10-25** (§3.5): −131 kB total, first tabbed screen −~130 kB | Visual check on a device is the founder's manual test. |
| 2 | **Sentry on web**: leave out replay + feedback (~42 kB gzip) and check whether `@sentry/conventions` (81 kB) can be avoided with the browser SDK instead of `@sentry/react-native`'s web build. | up to −40…−120 kB, lazily loaded, only with a DSN | Measure first; the same resolver trick may apply. Error reporting must keep working (test with a dummy DSN). |
| 3 | **Supabase realtime** (`realtime-js` 10 + `phoenix` 6.5 kB) is unused today. | −~16 kB | Keep until Phase 3: chat/notifications may need it. Decide then. |
| 4 | Re-check zod, react-hook-form (12 kB) and i18next (18 kB) only if they grow. | small | — |
| — | expo-router (115) + react-native-web (73) + react-dom (53) ≈ 240 kB gzip is the framework floor of this stack. | not reducible without changing the stack | — |

**Honest statement about the 350 kB initial-route target (ARCHITECTURE §8).** The framework floor alone (`entry`, 287 kB) leaves ~60 kB for *everything else* (Supabase auth, query cache, forms, i18n, zod, app code: today ~235 kB). Items 1–4 do not change that, because they affect lazy chunks. The target is therefore **not reachable on the current stack by trimming**, and this document does not claim otherwise. Options for the founder, none decided yet: (a) keep 350 kB as a long-term goal and accept ~520 kB initial for the MVP web build, (b) re-baseline the budget to "initial ≤ 500 kB gzip, first tabbed screen ≤ 650 kB" after item 1, (c) treat web as secondary (the product is mobile-first) and spend the effort on measured native start time instead. The ratchets stop regressions meanwhile.

## 5. Not measured

- Hermes bytecode size and native cold-start time (the debug build with Metro is not representative).
- Real-network load time on a mid-range Android phone; Lighthouse / Web Vitals.
- Whether gzip vs brotli at the real host changes the ranking (it should not).
