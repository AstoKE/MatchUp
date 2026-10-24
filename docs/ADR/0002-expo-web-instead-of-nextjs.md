# ADR-0002 — Expo Web SPA instead of a Next.js app

**Status:** Accepted, with a defined revisit trigger

**Context.** The brief prefers Expo Web for shared player-facing UI and asks for tradeoffs before adding Next.js. Player-facing web needs: authenticated app experience, responsive desktop layout, shareable event links. Admin console is web-only but authenticated.

**Decision.** Ship web from the same Expo codebase using Expo Router with `web.output: "single"` (client-rendered SPA on static hosting). SDK 58 changed the default `web.output` to `"server"`; we set `single` explicitly to avoid needing a Node/edge server for MVP.

**Consequences.**
+ One UI codebase and one design system; fastest path to cross-platform parity; trivial hosting.
− No server-side rendering: poor SEO for event pages and no rich link previews (Open Graph) for WhatsApp/Instagram shares — shares are a likely growth channel in Turkey.
− Larger initial JS payload than a purpose-built web app (mitigated: route-level lazy loading, bundle budget 350 kB gzip initial).
− react-native-web limits for some web-specific patterns (rich tables in admin).

**Mitigation / revisit trigger.** (1) Post-MVP: a tiny edge worker or Edge Function that serves OG-tag HTML for `/e/:id` to crawlers (no framework change). (2) Introduce a dedicated Next.js app only if organic search/SEO landing pages become a measured acquisition channel, or if the admin console outgrows RN-web. The `packages/domain` and Supabase client contracts are framework-agnostic, so this addition would not require rewriting business logic.
