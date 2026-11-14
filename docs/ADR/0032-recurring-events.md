# ADR-0032: Recurring events as a series that opens ordinary events ahead

**Status:** Accepted (Phase 11, 2026-11-14). Implements ROADMAP P-05. Plan: `docs/PHASE11_PLAN.md`.

## Context

Most pickup games repeat on a fixed weekday and time. Organizers re-create the same event every week. A recurring event must not weaken what the event model already guarantees:
- a capacity locked per event;
- the lifecycle states `DRAFT`, `PUBLISHED`, `CANCELED` and `COMPLETED`;
- attendance and reliability per event;
- moderation per event.

## Decision

1. **A series is a parent row that opens ordinary events.** An `event_series` row holds a copy of an event's details, the interval (1 or 2 weeks), the first start and the next start to open. The events it opens are normal `events` rows with a `series_id`. No new lifecycle state, and no "virtual" occurrences: everything a player sees, joins or reports is a real event.
2. **Opened two weeks ahead, by the database.** An hourly pg_cron job (`private.open_series_events()`) opens, for each active series, every event starting within the next two weeks. A unique index on `(series_id, starts_at)` makes opening idempotent under concurrency, and keeps a canceled week canceled.
3. **Players join each event separately.** There is no standing membership: the approval, capacity, waitlist, attendance and reliability rules stay per event. The regulars are told when the next event opens (M3).
4. **Changes reach only the events not yet opened.** An opened event is edited or canceled on its own, as today. Stopping a series leaves opened events alone.
5. **The series acts as its organizer, and only while they may organize.** Each run checks the organizer as `assert_onboarded_user` would: active, onboarded, current consent, and a verified phone when required. The same limits apply as for hand-made events (5 upcoming published events). If the organizer may no longer organize, or the saved details no longer validate, the series is stopped with a reason; a full limit only skips that week.
6. **Writes through RPCs only** (`create_event_series`, `stop_event_series`), with RLS on and no API grants. `SECURITY DEFINER`, `search_path = ''`, revoked from `anon`. Reads go through `get_event_series` and `list_my_event_series`.
7. **Weekday and time in Europe/Istanbul.** Starts are computed in local time, so the time of day stays the same.

## Alternatives rejected

- **Generating every occurrence up front:** it floods search and makes "change only the future" impossible without bulk edits.
- **Virtual occurrences materialised on first join:** they would need a second, non-event kind of listing in search, the map and moderation.
- **Series membership with automatic seats:** absent players would hold places and lose reliability for weeks they never chose (founder, 2026-11-14).

## Consequences

**Positive**
- Every guarantee of an event holds for each week without new code paths.
- Old apps see ordinary events; `series_id` and the new RPCs are additive.

**Negative**
- An hourly job is one more moving part to watch (OPERATIONS).
- Details copied at creation can go stale. The job stops the series rather than opening a broken event.
- The organizer has to edit future weeks one by one until M3 adds "apply to the next events".
