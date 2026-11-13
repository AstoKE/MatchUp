# Phase 10 report: businesses

Status 2026-11-13. The plan, with each milestone's details and the founder's decisions, is in [PHASE10_PLAN](PHASE10_PLAN.md); the design is ADR-0031. ROADMAP P-18 and P-19.

## 1. What was built

| Milestone | Result | Where |
|---|---|---|
| M1 | A person asks to list a business and claims commercial venues; an administrator approves or rejects it with a reason. Contact details are visible to administrators only. At most 3 per person, 10 venues per request, one business per venue. Export and purge | PR #111, `20261122100000_businesses` |
| M2 | Administrators add a business directly with an owner they choose, hide and restore it; venue and event pages show the venue's business | PR #112, `20261123100000_business_admin` |
| M3 | Once approved, the owner edits the business (name, contact) and its venues (name, address, sports). Place, kind and verification stay with administrators | PR #113, `20261124100000_business_operator` |
| M4 | Staff: the owner invites from a player card (at most 20); the person accepts or declines; staff edit venues only, not the business, its contact or its staff; leave and remove; blocked pairs cannot invite each other | PR #114, `20261126100000_business_staff` |

Later, outside the phase: the console's dashboard (P-23, #115) counts waiting business requests.

## 2. What was actually verified

- **Gates, per PR:** `pnpm check`, `pnpm db:test`, `pnpm test:integration` and web E2E, green in local CI on each PR's last commit.
- **pgTAP:** `39_businesses` to `41_business_operator` and `43_business_staff`: the rules and limits, one business per venue, who sees the contact details, what owners and staff may do, administrators with and without the second factor, the audit log, blocks, export and purge.
- **Integration:** `packages/db-tests/src/businesses.test.ts`, the RPCs through the API, including refusals.
- **Components:** the request form, the list, the edit screen (owner and staff views), the staff invitation, the console section.
- **Hosted:** the founder pushed all four migrations (seventh push, DEPLOYMENT §9).

**Not verified:**
- **No web E2E** for a business end to end.
- **No device:** not run on iOS or Android.
- **No real use on hosted yet.**
- **The phone requirement is dormant**, as in Phase 9: it starts when SMS verification is switched on.

## 3. Limitations

- **Ownership rests on the administrator's judgement.** There is no document, tax number or call recorded in the app (founder's decision). The contact details are there for the administrator to call.
- A business cannot add a new facility itself: it claims existing commercial venues. A missing venue is added by an administrator or suggested by a player first.
- No availability, booking or payments (P-08, P-09; out of the MVP by rule).

## 4. Risks

- **Impersonation:** someone claims a facility they do not run. The review and the possibility to hide are the brakes; the owner can never change a venue's verification.
- **Personal data:** a business's contact phone and e-mail are visible to administrators only, exported and purged. They are not in the draft Privacy Notice yet (SECURITY §8 item 18, counsel deferred).
- **Moderation load (R-9):** every request is manual work for one operator.

## 5. Next steps

The same as Phase 9 (PHASE9_REPORT §5): an iOS check, a web E2E flow, the Privacy Notice lines for counsel.
