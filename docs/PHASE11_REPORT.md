# Phase 11 report: recurring events

Status 2026-11-14. The plan, with the founder's decisions and the defaults chosen while building, is in [PHASE11_PLAN](PHASE11_PLAN.md); the design is ADR-0032. ROADMAP P-05.

## 1. What was built

| Milestone | Result | Where |
|---|---|---|
| M1 | A published, upcoming event becomes a weekly or fortnightly series. An hourly job opens every event of an active series that starts within two weeks, as an ordinary published event, acting as the organizer only while they may organize. At most 2 active series; a full upcoming-events limit skips a week; invalid details or an organizer who can no longer organize stop the series. Export and purge | PR #118, `20261128100000_event_series` |
| M2 | Event management: the "Tekrarla" card (start, see, stop, start again, a hint on drafts). Event page: "Her hafta salı 20:00". My events: a "Tekrarlanan" mark | PR #119, `20261129100000_event_series_app` |
| M3 | The previous event's players are told when the next one opens (in the app, and by push behind "Etkinliklerim"). "Sonraki etkinlikler bunun gibi olsun". A series stops by itself after 3 events in a row with nobody but the organizer. The organizer is told when a series stops by itself | `20261130100000_event_series_regulars` |

## 2. What was actually verified

- **Gates:** `pnpm check`, `pnpm db:test`, `pnpm test:integration` and web E2E. M1 and M2 were green in local CI on each PR's last commit; M3's result is on its PR.
- **pgTAP:**
  - `44_event_series` (36): the rules, the job, limits, stops, export and purge, the app's fields;
  - `45_event_series_regulars` (31): who is told and who is not (organizer, blocked pair, mere request, suspended account), the push and its switch, "like this one", the automatic stop, the organizer's notice.
- **Integration:** `packages/db-tests/src/event-series.test.ts` (6), through the API with refusals for another user and a guest. The races:
  - two creations at once give one series;
  - two runs of the job at once open each week once;
  - a change at the same moment as the job does not deadlock, and the series goes on after the last opened week.
- **Components:** the card in each state, the stop reasons (an unknown one shows none), "like this one" and when it is not offered, the event page line (and no call for a guest), the My events mark, the two new notifications.
- **Web E2E:** `series.spec.ts`. Start a weekly series, apply "like this one", see the next week open and marked, stop, and check that the opened week stays. axe runs on the management page.
- **Device:** the founder checked Phases 8–10 on an iPhone. Phase 11 has not been run on a device.

**Not verified:**
- **Push delivery:** a real push for a new week was not sent to a phone. The queue, the text, the switch and the send-time check are tested in the database.
- **Hosted:** the three migrations are not pushed yet (the founder's step, DEPLOYMENT §9).
- **Time:** a series running for weeks on hosted has not been seen. The job's weekly steps are tested by moving dates in tests.

## 3. Limitations

- Only every week or every two weeks. Monthly was left out.
- No standing membership: the regulars are told, then join each week themselves (the founder's decision).
- The weekday and time are Turkey's local time, whatever the city. All cities are in Turkey today.
- A stopped series cannot be restarted as the same series; the organizer starts a new one from an upcoming event of it.
- The organizer's notice of an automatic stop is in the app only, with no push.

## 4. Risks

- **Ghost listings:** mitigated by the limits (2 series, 5 upcoming events) and the automatic stop after 3 empty events.
- **Notification fatigue:** a regular of several series gets one notice per new week of each. They are dropped at send time once the player has joined, and there is one switch for all "my events" pushes.
- **The job:** one more hourly task (`open-series-events`) to watch. A failure of one series does not stop the others, and is retried next hour.
- **Personal data:** a series keeps a copy of the event's details, including the private address and notes, for as long as it lives. It is exported with the organizer's data and wiped at purge. The draft Privacy Notice does not mention series yet (SECURITY §8, counsel deferred).

## 5. Next steps

- The founder pushes the three migrations to hosted (dry-run, push, advisor), then tries a series on an iPhone build.
- The open items of Phases 9–10: web E2E for organizations and businesses, and the Privacy Notice lines for counsel.
- The next phase starts only on the founder's instruction.
