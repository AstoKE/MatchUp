# ADR-0006 — Admin console as a web-only route group in the main app

**Status:** Accepted

**Context.** MVP needs moderation (reports, disputes, suspensions, venue verification) but a separate admin application is extra infrastructure for a solo developer.

**Decision.** Implement the console as an `(admin)` Expo Router group, rendered only on web, lazy-loaded so it does not affect the player bundle. Authorization is entirely server-side: `admin_*` RPCs check `private.is_admin()` and AAL2 (MFA); RLS grants admin read access; every action writes `moderation_actions` and `audit_logs`. No privileged keys exist in the client.

**Consequences.**
+ Zero extra deploy surface; shared auth/design system/types.
− Admin UI code is downloadable by anyone (no secrets in it; threat model assumes this).
− If the console grows large or needs different tech, extract to its own app (`apps/admin`) — API surface (RPCs) is unchanged.
