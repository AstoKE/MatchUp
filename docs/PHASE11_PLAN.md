# Phase 11 plan: recurring events

Status 2026-11-14: planned; M1 in progress. ROADMAP P-05, started on the founder's instruction ("1i yap", 2026-11-14). ADR-0032.

An organizer turns a published event into a series ("her salı 20:00 halı saha"). The service then opens the next events of the series by itself, a fixed time ahead, as ordinary events. Each milestone is one PR and leaves `pnpm check`, `db:test`, `test:integration` and web E2E green.

## Decisions taken (founder, 2026-11-14)

| Question | Decision |
|---|---|
| How often | **Every week** or **every two weeks**. Monthly is left out (the "31st" and "last Friday" questions); it can be added later |
| How far ahead | Events open **two weeks ahead**: a weekly series shows the next two, a fortnightly one the next one |
| How players join | **Each event separately**, with today's rules (approval, capacity, waitlist, attendance, reliability). No standing membership of a series |
| Changing or stopping | Affects **only the events not opened yet**. Opened events stay as they are; the organizer edits or cancels them one by one, as today |

Defaults chosen while planning (the founder can change them):
- at most **2 active series** per person;
- a new event of a series counts towards the existing limit of 5 upcoming published events. When the limit is reached, that week's event is skipped, and the series continues;
- a series has no end date. It stops when the organizer stops it, or when the organizer can no longer organize: suspended, deleting the account, or missing consent or phone;
- it also stops when its saved details are no longer valid: the sport format is retired, or the district is closed;
- the time of day stays the same in Turkey's local time (Europe/Istanbul).

## How it works

- **The series is made from an event.** In event management, the organizer of a published, upcoming event chooses "Her hafta" or "2 haftada bir". The series keeps:
  - a copy of that event's details (title, sport, format, place, capacity, rules, cost, notes);
  - the weekday and time;
  - how long before the start registration closes.

  The event form itself does not change.
- **Opening the next events.** A database job runs every hour. It locks each active series and opens every event that starts within the next two weeks and is not open yet: a published event with the series' details, under the same organizer, and under the same organization while the organizer is still its owner or administrator.
  - A unique row per series and start time means a run never opens the same week twice, even with two runs at once.
  - A week the organizer has canceled is never opened again.
- **Only the future changes.** Editing an opened event does not change the series. M3 adds "the next events should be like this one", which copies an event's details, weekday and time into the series. Stopping a series leaves the opened events alone.

## Milestones

### M1: the series in the database
- **Table and columns:**
  - `event_series`: organizer, interval in weeks (1 or 2), the copied details, the first start, the next start to open, status `ACTIVE` / `STOPPED`, why it stopped, timestamps;
  - `events.series_id`, with a unique index on `(series_id, starts_at)`.
- **RPCs:**
  - `create_event_series(event, interval_weeks)`: organizer only; the event must be published, upcoming and not in a series yet; the 2-series limit applies. It opens the first events at once.
  - `stop_event_series(series)`: organizer only.
  - `get_event_series(event)`: visible to whoever can see the event; the reason it stopped only to the organizer.
  - `list_my_event_series()`.
- **The job:** `private.open_series_events()` on pg_cron every hour, plus a call for the new series from `create_event_series`.
- **Export and purge.** The series belongs to the organizer: exported with their data, deleted with their account.
- RLS on, no API grants, as everywhere else.
- **Tests:**
  - pgTAP: creating a series, the rules for who may and when, the limit, the next starts, a canceled week staying canceled, the organizer becoming unable to organize, invalid details, export and purge;
  - integration through the API, including a refusal for another user and for a guest;
  - concurrency: two job runs and two creations at the same time leave exactly one event per week.

### M2: the app
- **Event management:** a "Tekrarla" card. It offers every week or every two weeks, explains when the next events open, and shows the series' state with "Seriyi durdur" once the event is in a series.
- **Event page:** a line such as "Her hafta salı 20:00".
- **My events:** a mark on events that belong to a series.
- **Tests:**
  - component tests;
  - a web E2E flow: make a series from an event, see the next event appear, stop the series.

### M3: the regulars, and changing the series
- When a new event of a series opens, the players approved for the previous event are told: in the app, and by push behind the "Etkinliklerim" switch. No standing seat: they still join the new event themselves.
- "The next events should be like this one": copies an opened event's details, weekday and time into the series. Only events not yet opened change.
- A series stops by itself after 3 events in a row that ended with no player approved besides the organizer, so that empty listings do not pile up.
- The organizer is told whenever a series stops by itself, and why.
- The phase report.

## Risks

- **Ghost listings:** a series keeps opening events nobody comes to. Mitigated by the 2-series limit, the 5-upcoming-events limit, and the automatic stop in M3.
- **Stale details:** a venue hidden or a format retired after the series was made. The job stops the series rather than opening a broken event, and the organizer is told (M3).
- **The job itself:** a failure must not stop the other series. Each series runs in its own subtransaction; an unexpected error leaves that series for the next run, and only the known causes (the organizer, invalid details) stop it.
- **Moderation:** an event of a series is an ordinary event. Reporting, admin cancel and suspension all work as today, and a suspension stops the person's series at the next run.
