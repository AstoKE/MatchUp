# Phase 9 report: organizations

Status 2026-11-13. The plan, with each milestone's details and the founder's decisions, is in [PHASE9_PLAN](PHASE9_PLAN.md); the design is ADR-0030. ROADMAP P-16 and P-17.

## 1. What was built

| Milestone | Result | Where |
|---|---|---|
| M1 | A person asks to create an organization; an administrator approves or rejects it with a reason in the console. At most 2 per person, a waiting request included. Export and purge | PR #106, `20261118100000_organizations` |
| M2 | The public page of an active organization; membership by invitation (from a player card) or by request, accepted by the owner or an administrator; leave, remove, promote, hand over ownership | PR #107, `20261119100000_organization_membership` |
| M3 | The organizer links an event to the organization in event management ("Organizasyon adına"); the event page shows it, the organization page lists upcoming events. The event form and `event_type` are unchanged | PR #109, `20261120100000_organization_events` |
| M4 | Reporting an organization (a new report target); the console hides and restores it and sees its members; blocked pairs do not invite or see each other; names and descriptions follow the display-name rules | PR #110, `20261121100000_organization_safety` |

Later, outside the phase: the console's dashboard (P-23, #115) counts waiting organization requests.

## 2. What was actually verified

- **Gates, per PR:** `pnpm check`, `pnpm db:test`, `pnpm test:integration` and web E2E, green in local CI on each PR's last commit (`pnpm ci:local --comment`), because the free Actions minutes were used up.
- **pgTAP:** `35_organizations` to `38_organization_safety`, covering the rules, the limit, who sees what, administrators with and without the second factor, the audit log, blocks, export and purge.
- **Integration:** `packages/db-tests/src/organizations.test.ts`, the RPCs through the API, including refusals for players and guests.
- **Components:** the request form, the list, the page, membership actions, the console section.
- **Hosted:** the founder pushed all four migrations (sixth and seventh pushes, DEPLOYMENT §9).

**Not verified:**
- **No web E2E** walks an organization end to end (request, approval in the console, invitation, event). Components and integration cover the parts, not the whole path in a browser.
- **No device:** Phases 9 and 10 have not run on iOS or Android.
- **The phone requirement is dormant.** Writes require a verified phone only once SMS verification is switched on (ADR-0029). The SMS provider is shelved, so today anyone onboarded can send a request.
- **No real use on hosted yet:** nobody has sent a request there.

## 3. Limitations

- One concept, no tiers: no verified commercial organizer (founder: not now; it comes with pricing, P-15).
- An event is linked after it is created, not chosen in the event form.

## 4. Risks

- **Moderation load:** every request is a manual review by one operator (R-9). The limit of 2 and the review are the brakes; the dashboard shows the queue's age.
- **Public content:** names and descriptions are user content under the display-name filter and reporting. A clever name still passes a filter.
- **Legal:** organization names, descriptions and the record of rejected requests are not mentioned in the draft Privacy Notice (`legal.json`). SECURITY §8 item 17 is waiting for counsel, whose review the founder deferred.

## 5. Next steps

1. The founder checks Phases 9 and 10 on an iOS build (organizations, businesses, staff, push).
2. A web E2E flow for an organization's life, next to `lifecycle.spec.ts`.
3. The Privacy Notice lines for organizations, businesses, feedback and phone numbers, drafted for counsel together (SECURITY §8 items 15–18).
