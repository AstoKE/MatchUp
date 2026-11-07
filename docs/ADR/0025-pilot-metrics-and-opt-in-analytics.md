# ADR-0025 — Pilot metrics from the service's own data; usage analytics only with explicit consent

**Status:** Accepted (2026-11-07, Phase 7 / M4)

**Context.** ADR-0019 §5 deferred product analytics to Phase 7. ARCHITECTURE §9 planned an `analytics_events` table written by the server inside RPCs, plus a client `track_event`. Two questions remained:
- whether such events need consent beyond the Terms (counsel, LAUNCH_CHECKLIST §1);
- how to answer the pilot's questions (registrations, conversion, fill rate, no-shows, active provinces) with as little new personal data as possible.

The founder chose (2026-11-07) to put an explicit consent text in place so the question does not block the pilot.

**Decision.**
1. **Pilot metrics come from the data the service already holds to work** (profiles, events, participations, attendance), computed on request by `admin_pilot_metrics(p_days)` for administrators at aal2.
   - The result holds only totals, rates and provinces; no person is in it (tested).
   - No server-side event stream is added: the operational tables already answer every row of ARCHITECTURE §9's question table except "which parts of the app are used".
2. **Usage analytics are opt-in with a separate, explicit consent.**
   - `consent_kind` gains `ANALYTICS`, versioned `v1`, recorded in `user_consents` like marketing, and mirrored in `user_settings.analytics_consent_at`.
   - The consent is **off by default** and given only in Settings. The checkbox label *is* the consent text, so what is ticked is exactly what is agreed to.
   - Withdrawing it stops collection and **deletes what was recorded**.
   - Guests are never recorded.
3. **What is recorded** (`analytics_events`, written only by `track_event`):
   - an allow-listed event name (`discover_viewed`, `filter_applied`, `event_detail_viewed`, `map_opened`, `near_me_used`, `venue_suggest_opened`), with coded properties checked by the server;
   - the time and the person.

   No free text, no coordinates, no ids of events or other people. The limit is 300 an hour; beyond it events are dropped silently, and the app never waits or fails for analytics. The table is closed to the API roles, included in the export and deleted on purge.

**Consequences.**
- No funnel per person without consent. Pilot questions are answered from totals.
- ARCHITECTURE §9's server-side `analytics_events` inside RPCs is replaced by item 1. Its event names stay the vocabulary for future work.
- The consent text and the Privacy Notice paragraph (PHASE7_PLAN M4) still go to counsel. Having the text in place does not make it legally sufficient (⚖).
- Adding an event or a property is a migration (the allow-list lives in the database) plus a change to the app's `UsageEvent` type.
