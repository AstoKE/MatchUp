# ADR-0009 — Expo SDK 58 baseline with SDK 57 fallback; TypeScript 6, ESLint 9

**Status:** Accepted 2026-10-24 (D-01 confirmed: start on SDK 58; fall back to SDK 57 only if the M0 spike shows reproducible, meaningful blockers; prefer development builds over Expo Go). M0 outcome is appended below.

**Context (facts as of 2026-10-24, from the npm registry and Expo's SDK manifest).**
- SDK 58: `expo@58.0.x` (React 19.3.0, React Native 0.88.0, expo-router ~58.0.26, Node ^22.13 || ^24.3 || ^26). npm `58.0.0` published 2026-09-29; upgrade guide published 2026-10-21. The new Expo Go "supports only SDK 58" and is to reach the stores "in the next few weeks".
- SDK 57: `expo@57.0.31` (React 19.2.3, RN 0.86.3), published 2026-06-30; Expo Go for it is available now.
- Expo templates for both SDKs pin `typescript ~6.0.3`; TypeScript 7.0.x is `latest` on npm. ESLint 10 is `latest`; ESLint 9.39 is the maintenance line.
- Native map (MapLibre) and push need development builds regardless of SDK; on Windows iOS builds require EAS cloud builds.

**Decision (proposed).** Start on **SDK 58** (longest runway, iOS 27/Xcode 27 readiness) using development builds and web/Android emulator until the new Expo Go ships; pin TypeScript `~6.0.3` and ESLint `9.39.x`; install Expo-managed packages only via `npx expo install`. A Phase 1 M0 spike must pass (install, `expo-doctor`, web export, Android run, jest-expo + RNTL, pnpm layout) or we fall back to **SDK 57** with the identical architecture.

**Consequences.**
+ Avoids a forced SDK upgrade in the middle of MVP; current store-requirement alignment.
− Newer SDK ⇒ fewer community reports, possible library lag, no Expo Go for the first weeks; breaking changes list in ARCHITECTURE §6.2 must be respected (strict TS API, removed `InteractionManager`, `web.output` default).
− If we choose SDK 57 instead, plan an upgrade to the then-current SDK before the pilot.
