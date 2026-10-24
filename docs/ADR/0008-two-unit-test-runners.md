# ADR-0008 — Vitest for pure/DB tests, Jest (jest-expo) for React Native

**Status:** Accepted

**Context.** The brief allows "Vitest or equivalent" and requires React Native Testing Library. `jest-expo` (the Expo-maintained preset, built on Jest 30 + `test-renderer`; corrected from Jest 29 after the M0 spike) is the supported path for React Native components; Vitest does not reliably run the RN preset/Metro transforms.

**Decision.** Use **Vitest** for `packages/domain` and database integration/concurrency tests (fast, TypeScript-native, good for parallel async tests with `pg`), and **jest-expo + @testing-library/react-native** for RN components. Playwright for web E2E; pgTAP for schema/RLS.

**Consequences.**
+ Each layer uses its best-supported tool.
− Two configurations; shared test builders must be runner-agnostic plain TS (put in `packages/domain/testing`, no runner imports).
Revisit if Vitest gains first-class RN support or Expo moves its preset.
