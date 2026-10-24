# ADR-0005 — In-app notifications first, as a transactional outbox

**Status:** Accepted

**Context.** Participation workflows require reliable notice to organizers and participants. Push needs Apple/Google credentials, device testing and consent handling; email is needed for Auth anyway but not for every event.

**Decision.** MVP delivers in-app notifications only: a `notifications` row inserted **in the same transaction** as the state change (so it cannot be lost or sent for a rolled-back change), de-duplicated by `dedupe_key`, ids-only payloads, read through RLS, with Realtime/polling for freshness. The table is designed to be the outbox for future channels: a `NotificationChannel` interface with per-channel delivery rows (push, email) is added with P-01, without altering producers.

**Consequences.**
+ Reliable, simple, no external credentials in MVP; trivially testable.
− Lower reach: users who do not open the app miss requests (risk R-8). Push is therefore the first post-MVP item; auth emails use custom SMTP from day one.
− Payload rendering happens client-side; notification text is not stored (avoids stale/PII text).
