# MatchUp

> Choose your sport. Find your team. Join the game.
> _Sporunu seç, takımını bul, oyuna katıl._

MatchUp (working name) is a multi-platform (iOS, Android, Web) sports community app. People create and join local sports activities, find teammates, and build a verified reputation. Launch market: **Ankara, Turkey** (Turkish first, English supported).

## Status

**Status 2026-10-29: Phases 1–3 are built** (foundation, identity and onboarding, the list-based event engine; reports: [Phase 1](docs/PHASE1_REPORT.md), [Phase 2](docs/PHASE2_REPORT.md), [Phase 3](docs/PHASE3_REPORT.md)). Web is verified end to end in Chromium. Android was validated on an emulator in Phase 2 (22 device checks); **nothing of Phase 3 has run on a device yet** and iOS has never been launched. Phase 4 has not started.

Quick start (details and troubleshooting: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)):

```bash
pnpm install && pnpm db:start && pnpm env:local   # Docker Desktop must be running
pnpm --filter @matchup/app web                    # http://localhost:8081
pnpm check && pnpm db:test && pnpm test:integration && pnpm test:e2e
```

## Where to read

| Start here                                     |                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| [docs/PHASE0_REVIEW.md](docs/PHASE0_REVIEW.md) | Summary, consistency review, **open decisions you must answer**    |
| [CLAUDE.md](CLAUDE.md)                         | Durable engineering rules for AI-assisted work                     |
| [docs/PHASE1_REPORT.md](docs/PHASE1_REPORT.md) | What Phase 1 delivered, test results, unverified areas, next steps |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)     | Setup, commands, repo map, platform status, troubleshooting        |

| Document                                             | Purpose                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md)     | Why, who for, differentiation, GoodRec research notes                  |
| [docs/PRD.md](docs/PRD.md)                           | Personas, roles, MVP scope, functional requirements                    |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)         | System design, **pinned versions**, observability, performance budgets |
| [docs/DATABASE.md](docs/DATABASE.md)                 | Schema, ER model, state machines, invariants, RPCs, RLS                |
| [docs/USER_FLOWS.md](docs/USER_FLOWS.md)             | Screen-level flows and edge cases                                      |
| [docs/UI_DESIGN_SYSTEM.md](docs/UI_DESIGN_SYSTEM.md) | Provisional design system (superseded by `design.md` when provided)    |
| [docs/SECURITY.md](docs/SECURITY.md)                 | Threat model, authorization, privacy, KVKK items for legal review      |
| [docs/RATING_SYSTEM.md](docs/RATING_SYSTEM.md)       | Skill, reliability, XP, levels, badges                                 |
| [docs/ROADMAP.md](docs/ROADMAP.md)                   | Phases, prioritized backlog, top risks, Phase 1 plan                   |
| [docs/TESTING.md](docs/TESTING.md)                   | Test strategy and critical-path test list                              |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)             | Environments and production-readiness checklist                        |
| [docs/ADR/](docs/ADR/)                               | Architecture decision records                                          |

## Branding

The name is temporary. All user-visible brand values live in one config module (`packages/config`). Store identifiers (iOS bundle ID, Android package, domains) are **not** easily changeable after publication — see [ADR-0010](docs/ADR/0010-identifiers-and-branding.md).

## Language policy

Code, identifiers and documentation: English. User-facing copy: Turkish (default) and English via i18n resources.
