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
8. **The regulars, changes and automatic stops (M3, 2026-11-14).**
   - When an event opens, the players approved for the previous event that was not canceled are told: an in-app `SERIES_EVENT_OPENED` notification, and a push behind the "my events" switch. Not told: the organizer, accounts that are not active, and anyone in a block with the organizer. They still join themselves.
   - `apply_event_to_series` copies an opened, upcoming event's details, weekday, time and registration close into the series. The series continues in the period after the last opened event; opened events stay as they are.
   - A series stops by itself (`NO_PLAYERS`) when its last 3 events that took place had no approved player besides the organizer (`series.empty_events_to_stop`). Canceled events do not count.
   - When a series stops by itself, its organizer gets an in-app `SERIES_STOPPED` notification while the account is active. Payloads carry ids and the reason key only.

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
- Opened weeks are still edited one by one; "apply to the next events" (M3) changes only the weeks not opened yet.
- A new stop reason (`NO_PLAYERS`) reaches apps built before M3. From M3 on, the app reads the reason as text and shows none for a reason it does not know. Only internal builds had the M2 app.
