# Accessibility checklist (manual, devices)

Phase 7 / M5 prepared this; it is filled in during M6 on real devices (ROADMAP F-33). The automated part runs in CI:
- axe with the WCAG 2.2 AA tags on every route at a phone width and a desktop width (`e2e/a11y-routes.spec.ts`);
- axe at the key steps of every flow;
- a keyboard-only path through sign-in, Discover, an event and a join request (`e2e/keyboard.spec.ts`);
- contrast pairs from the design tokens (`src/ui/tokens/tokens.test.ts`).

Automated checks cannot tell whether a screen *makes sense* read aloud. That is what this list is for.

Mark each line with the device, OS version and date, or "fail" with a note. Record the results in NATIVE_VALIDATION.

## Screen readers: VoiceOver (iPhone) and TalkBack (Android)

| # | Check | VoiceOver | TalkBack |
|---|---|---|---|
| 1 | Sign in: each field announces its label; an error is announced when it appears | | |
| 2 | Onboarding: the 18+ and consent checkboxes say what they are and whether they are ticked | | |
| 3 | Discover: the sport strip reads as choices with the selected one marked; each event card reads in one swipe (time, sport, title, place, spots) | | |
| 4 | Discover → map: the map has a name; markers are reachable and named; the list remains reachable without the map | | |
| 5 | Province picker: the sheet's title is announced, the search field works with the on-screen keyboard, the chosen province is marked | | |
| 6 | Event page: the facts read in order; the join action is reachable without scrolling past everything | | |
| 7 | Join request and its result: the outcome ("request sent", "on the waitlist") is announced | | |
| 8 | Organizer's manage page: each request reads with the person's name, and approve/decline are distinct buttons | | |
| 9 | Attendance and reviews: each player's choices are a group with the player's name | | |
| 10 | Notifications: the unread count is in the bell's name | | |
| 11 | Settings: each consent checkbox reads its full text | | |
| 12 | Report and block: the sheet traps focus and is closed with the back gesture | | |

## Display and motion

| # | Check | iPhone | Android |
|---|---|---|---|
| 13 | Largest system text size: nothing is cut off on Discover, the event page, the form and Settings (scrolls instead) | | |
| 14 | Reduce motion on: no animated transitions or skeleton pulsing | | |
| 15 | Dark mode: all screens readable, focus rings visible | | |
| 16 | Every tappable thing is at least 44 × 44 pt (check the dock, chips, map markers, the province button) | | |

## Web, beyond the automated keyboard path

| # | Check | Result |
|---|---|---|
| 17 | Browser zoom at 200 %: no horizontal scrolling on phone-width layouts | |
| 18 | Every sheet (filters, province, pin, report) can be closed with Escape and returns focus to its button | |
| 19 | The skip link is the first stop and moves focus to the content | |
| 20 | `lang` switches between `tr` and `en` with the language | |
