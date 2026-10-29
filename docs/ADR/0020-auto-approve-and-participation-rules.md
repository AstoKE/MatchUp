# ADR-0020 — Optional auto-approve, and the participation rules fixed in M4

**Status:** Accepted (2026-10-29, founder). Amends PRD §4.3 (Event engine) and DATABASE §0c, §9.

**Context.** The PRD required the organizer to decide on every join request. For casual pickup games that is friction: the organizer must be online to fill the roster. The founder asked for an option, off by default, for organizers who prefer to admit players at once. M4 also had to settle some rules the documents left open.

**Decisions.**
1. **`events.auto_approve boolean not null default false`**, set through the same jsonb event input (`auto_approve`, optional; installed apps that do not send it keep working). It can be changed on a published event; the change only affects later requests.
2. **When it applies.** `request_join` approves immediately only if a spot is free **and no request is `WAITLISTED`**. Otherwise the request is `REQUESTED` (decided by the organizer) or, on a full event with a waitlist, `WAITLISTED`. The waitlist is never jumped, and waitlist promotion remains an explicit organizer action (PRD §4.3 unchanged).
3. **Decided under the event row lock**, like every capacity-changing path (DATABASE §8): of N players racing for the last spot exactly one is approved and the rest are waitlisted, none gets an error (integration test with real parallel connections; fails when the lock is removed).
4. **Participation rules as built:** at most 3 requests per event (`REQUEST_LIMIT_REACHED`), at most `quota.max_open_requests` (20) open requests per player (`QUOTA_EXCEEDED`); `REJECTED` and `REMOVED` are terminal for that event (`NOT_ALLOWED` on a new request); the organizer cannot ask to join their own event; nothing changes after the start (`REGISTRATION_CLOSED` for requests, `INVALID_TRANSITION` for decisions and withdrawals); a withdrawal within 24 h of a time/place change is marked excused.
5. **Invite-only events cannot be requested yet** (`NOT_FOUND`): the invite flow (`get_event_by_invite`) is not built, and exposing the token to the app would widen what it may see. To be revisited with that RPC.
6. **Notifications** for every transition use only ids in the payload (SECURITY §6) and are deduplicated per participation and request attempt.

**Consequences.** + Casual events fill without the organizer online. + The organizer keeps control wherever fairness matters (waitlist, full events, rejection). − An auto-approve organizer can no longer vet players first; the removal action and the 3-request rule are the remaining controls. − The pending-request quota is checked per player, not per organizer: an organizer cannot cap incoming requests.
