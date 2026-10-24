# ADR-0007 — Monorepo layout and sharing `domain` code

**Status:** Accepted (bundling approach validated in Phase 1 M0/M8)

**Context.** Pure logic (Zod schemas, error codes, transition tables, level formula, rating reference specs, constants) is needed by the app, by tests, and potentially by Edge Functions (Deno). A single-app repo would blur boundaries; a many-package monorepo would be heavy for one developer.

**Decision.** pnpm workspace with `apps/app`, `packages/domain` (pure TS, only depends on `zod`), `packages/config` (branding and constants, no secrets), plus `supabase/`. `packages/ui` and a separate web app are **not** created until there is a second consumer. Edge Functions import from `packages/domain` via relative paths/import map; if Supabase function bundling cannot resolve the monorepo path reliably, Edge Functions keep a thin, duplicated schema subset generated from `domain` by a script (checked in CI for drift).

**Consequences.**
+ Clear dependency direction (`app → domain`, never reverse); fast unit tests without RN.
− pnpm + Metro needs care (`node-linker=hoisted` fallback, M0 spike).
− Deno/Node module-resolution differences for shared code (kept minimal: no Node built-ins in `domain`).
