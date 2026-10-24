# ADR-0013 — Guest (unauthenticated) event discovery

**Status:** Accepted 2026-10-24 (D-09 confirmed by the founder; supersedes the Phase 0 recommendation of sign-in-required browsing)

**Context.** Phase 0 recommended requiring sign-in to browse events (less scraping, simpler privacy). The founder decided that public discovery must work for guests, with authentication required for joining, organizing, rating and other authenticated actions — lowering friction and enabling shared event links to open without an account.

**Decision.**
1. `anon` may read only: active catalog/reference data and **public** events (`PUBLISHED ∧ PUBLIC`) through RLS select policies and two read RPCs (`search_events`, `get_event`). The `anon` execute whitelist is exactly these RPCs; a CI test compares the live function privileges to the whitelist.
2. Guest responses contain no participant lists, no private details, no profiles except organizer display name/avatar, and hidden-location events keep their snapped pin and district only.
3. Every write, `My Events`, profile, notification, report and block action requires authentication. The client prompts sign-in and returns to the same screen (`returnTo`); the guard is UX only.
4. Abuse controls: page-size cap, `statement_timeout`, IP-level rate limiting at the CDN/API domain, no enumerable ids, caching of identical queries.
5. Phase 1 scope: routing/guard architecture, the `anon` privilege whitelist test harness and `app_config`/reference-table policies. The event tables and RPCs arrive in Phase 3.

**Consequences.** + Lower friction, shareable links, better growth. − Larger unauthenticated surface (scraping, query-cost abuse); − the "anon never executes RPCs" rule has a controlled exception; − client must handle intent-preserving sign-in. Residual scraping risk is accepted and monitored.
