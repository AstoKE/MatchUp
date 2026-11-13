# Performance: web bundle analysis and plan

Status 2026-11-02. **Web bundle size only.** Nothing here measures runtime speed, time-to-interactive, memory or the native (Hermes) app on a real device; those are not measured yet and no claim is made about them.

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
| TOTAL web JS | **970 kB** (1051 kB before the SVG tab icons; 1113 kB at the start of this work; 1400 kB was the Phase 1 ratchet) |
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

6. **Sentry replay and feedback left out of the web bundle** (`apps/app/metro.config.js`, `apps/app/metro/sentry-unused-stub.js`). `@sentry/browser` re-exports `@sentry/replay` and `@sentry/feedback`, so ~57 kB gzip of code the app never calls shipped in the lazily loaded Sentry chunk (only with a DSN). **TOTAL 939 → 882 kB; the Sentry chunk 373 → 316 kB; INITIAL unchanged (560).** An *empty* module is not enough: `@sentry/browser` calls `buildFeedbackIntegration` while loading, and a first attempt with the empty module broke Sentry's initialization (`buildFeedbackIntegration is not a function`). A browser probe with a dummy DSN (build with `EXPO_PUBLIC_SENTRY_DSN=https://abc@o1.ingest.sentry.io/2`, serve, load in Chromium, throw an error containing an email address) now shows: no console errors from init, `window.__SENTRY__` present, one error envelope sent, the email address absent from it (our `beforeSend` scrubbing still applies). The stub throws if replay/feedback is ever used, so enabling either means removing the entry first. Ratchet: TOTAL 940 → 900. Not covered: the native app (Hermes) never loaded these browser packages.

7. **Supabase Realtime and Storage left out of the web bundle** (`apps/app/metro.config.js`, `apps/app/metro/supabase-unused-stub.js`). supabase-js constructs the realtime and storage clients eagerly, so `@supabase/realtime-js` (+ phoenix) and `@supabase/storage-js` (~23 kB gzip) shipped in the **initial** chunk although the app uses neither: notifications are polled (ADR-0019) and there are no uploads yet. On web only (the native build keeps the real packages, it is what the device suite validated) they resolve to small stand-ins: `setAuth` is a no-op promise, anything else throws a clear error. **TOTAL 888 → 863 kB, INITIAL 565 → 541 kB.** Checked by the full web E2E (sign-up, sign-in, session survives a reload, token refresh path, join flow, notifications, 47 tests). Remove the entries before using Realtime or Storage on web. Ratchets: TOTAL 900 → 885, INITIAL 570 → 555.

9. **The administration console (2026-11-05, Phase 6 M5): TOTAL 885 -> 897 kB, INITIAL unchanged (554 of 555).** One lazy chunk, `AdminGate` (10 kB gzip), loaded only from `/admin`: the route file is `index.web.tsx`, so the phone app has no such route, and the page, the second-factor screens, the server calls, the copy (added with `i18n.addResourceBundle`) and the hooks all sit behind one `import()`. An earlier attempt with only the screen lazy left the server calls in `__common`, which every visitor loads. The ratchet is the check that this stays true. **Phase 6 M6 then raised the total 897 -> 898 kB:** four notification texts in two languages, the suspended-account page and the display-name check are used by everybody, so they sit in the main bundle. The same change took the Expo SDK 58 patch versions that `expo-doctor` asked for (expo, expo-router, expo-constants, expo-linking, expo-sharing, @expo/metro-runtime, react-native-safe-area-context 5.11, jest-expo): on their own they moved the total by 1 kB, and the initial bundle now sits exactly on its ratchet, 555 of 555 kB.
8. **Theme E (2026-11-02, ADR-0023), no ratchet raised.** Font files fell from 1,027 kB (Inter, three weights) to 343 kB (Bricolage Grotesque and Figtree, six weights); they are not in the JavaScript ratchets. Ten court drawings and the dock were paid for by removing the sport glyphs, the filled icon set, the tab bar options and `SportArtwork`. Result: **885 of 885 kB total, 554 of 555 kB initial. There is no margin:** new shared code needs something removed first, or a raise with its reason recorded in `scripts/check-bundle-size.mjs`. Phase 6's admin console has to load lazily.

## 4. Plan, in order of measured benefit

| # | Change | Expected effect | Needs |
|---|---|---|---|
| 1 | ~~Replace Ionicons for the tab bar with inline icons~~ | **Done 2026-10-25** (§3.5): −131 kB total, first tabbed screen −~130 kB | Visual check on a device is the founder's manual test. |
| 2 | ~~Sentry on web: leave out replay + feedback~~ **Done 2026-10-29** (§3.6, −57 kB). Still open: whether `@sentry/conventions` (78 kB) can be avoided with the browser SDK instead of `@sentry/react-native`'s web build. | up to −80 kB more, lazily loaded, only with a DSN | A stub is not safe for `conventions` (its constants are read by name): measure the browser SDK instead; re-run the dummy-DSN probe (§3.6). |
| 3 | ~~Supabase realtime unused~~ **Done 2026-10-29** (§3.7, with storage-js): decided by ADR-0019 (polling). | −23 kB, initial too | Revisit only if live updates are wanted. |
| 4 | Re-check zod, react-hook-form (12 kB) and i18next (18 kB) only if they grow. | small | — |
| 5 | **Shared feature code lands in the initial `__common` chunk.** Measured at Phase 3 / M2: the event screens (create, edit, cancel, detail) share their form, API and hooks, and Metro's web splitting puts any module used by more than one route into `__common`, which `index.html` always loads: app code there grew 102 → 158 kB minified (INITIAL 543 → 557 kB gzip; ratchet raised to 570 with this reason). Every feature with several routes will add to the first paint the same way. Candidates: load each language's translations on demand instead of bundling all namespaces × 2 languages up front; keep a feature's routes in one route group so its shared code stays out of `__common`; measure before choosing. **2026-11-06:** the event form (create and edit) is now a lazy chunk (`LazyEventStepper`, 4 kB gzip), INITIAL 557 → 554 kB. **2026-11-07:** the event page's request, attendance and review panels too (−2.3 kB); MapLibre (~286 kB) is its own lazy chunk with its own ratchet (MAP). **2026-11-07 (M5):** translations per language: English is a 12 kB chunk on the web, INITIAL 558 → 547 kB. **2026-11-07 (Phase 8 M2):** the wheel picker is shared by Discover and the event form. A lazy chunk for Discover's date sheet was measured and saved nothing, because the shared module went to `__common` anyway; INITIAL 548 → 550 kB. | stops initial growth per feature | Measurement of each option; no new dependency |
| — | expo-router (115) + react-native-web (73) + react-dom (53) ≈ 240 kB gzip is the framework floor of this stack. | not reducible without changing the stack | — |

**Honest statement about the 350 kB initial-route target (ARCHITECTURE §8).** The framework floor alone (`entry`, 287 kB) leaves ~60 kB for *everything else* (Supabase auth, query cache, forms, i18n, zod, app code: today ~235 kB). Items 1–4 do not change that, because they affect lazy chunks. The target is therefore **not reachable on the current stack by trimming**, and this document does not claim otherwise. Options for the founder, none decided yet: (a) keep 350 kB as a long-term goal and accept ~520 kB initial for the MVP web build, (b) re-baseline the budget to "initial ≤ 500 kB gzip, first tabbed screen ≤ 650 kB" after item 1, (c) treat web as secondary (the product is mobile-first) and spend the effort on measured native start time instead. The ratchets stop regressions meanwhile.

## 4b. Load at pilot scale (Phase 7 M3, 2026-11-06)

`node scripts/load/run.mjs --fresh`:
- resets the **local** database;
- seeds 3 000 players, 110 004 events (half upcoming, across all provinces, 60 % with a pin) and 553 339 participations (`scripts/load/seed.sql`, 35 s);
- runs the ARCHITECTURE §8 scenarios in the pinned `grafana/k6:1.3.0` container (`scripts/load/scenarios.js`).

Tokens are signed with the local JWT secret, so Auth's sign-in limits are not what is measured. Everything (gateway, PostgREST, Postgres, k6) shares one laptop (16 threads, 15 GB): the latencies include contention a hosted database would not have, and none of the network to Paris.

| Scenario | Load | p50 | p95 | p99 | Budget (ARCH §8) | Result |
|---|---|---|---|---|---|---|
| Discovery (`search_events`, random province/sport/open filters, a third near a point with a 5–25 km radius, half also page 2) | 100 users, 1–3 s between screens (~45 req/s, three times the pilot's evening peak) | 4 ms | 219 ms | 621 ms | p95 < 800 ms | met |
| Join storm (`request_join` on one event) | 200 players in 20 s (ARCH: within 60 s) | 9 ms | 16 ms | 17 ms | p95 < 500 ms | met; 200 requests stored |
| Last-slot race (`approve_participation`) | 50 approvals at once for 1 place | 33 ms | 42 ms | 42 ms | p95 < 500 ms, no overbooking | met: exactly 1 approved, 49 `EVENT_FULL`, no event over capacity |
| Organizer dashboard (`list_event_requests` with 500 requests, `list_my_events`) | 20 users | 6 ms | 10 ms | 27 ms | p95 < 500 ms | met |
| Fan-out (`cancel_event` with 99 approved players) | 1 call | 13 ms | | | < 1 s for the notifications | met: 99 notifications |
| Cron sweep (`complete_due_events`, 10 000 due) | 1 run | 20 ms | | | | **processes 500 per run** (see below) |
| *Burst (no budget): 200 joins at the same instant* | 200 at once | 308 ms | 588 ms | 601 ms | | the event row lock queues them, by design |
| *Stress (no budget): discovery without pauses* | 100 users, ~165 req/s | 378 ms | 1.75 s | 2.7 s | | the laptop's ceiling, not a query's |

Further findings:
- **Query plans:** during the run, `events`, `event_participations`, `event_private_details` and `notifications` saw **no sequential scans** (128 795, 6 284 and 143 181 index scans). A single search at this size takes 2–4 ms with a province filter and 28 ms for "nearest within 10 km" across the country.
- **Cron sweep:** `complete_due_events` completes at most 500 events per run, every 10 minutes, so it keeps up with 3 000 events ending per hour. The pilot assumes 800 live events in total. No change.
- **Catalog:** now kept on the device for a day (`features/catalog/load-catalog.ts`). It is read from the server at most once a day instead of at every start, and an older copy is used when offline.

Not measured: hosted (the founder can run the same scenarios against a staging project with its own URL and keys; the runner refuses non-local URLs on purpose), and network latency from Turkey to Paris.

## 5. Not measured

- Hermes bytecode size and native cold-start time (the debug build with Metro is not representative).
- Real-network load time on a mid-range Android phone; Lighthouse / Web Vitals.
- Whether gzip vs brotli at the real host changes the ranking (it should not).
