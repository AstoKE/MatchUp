# Phase 10 plan: businesses

Status 2026-11-13: M1–M3 merged (#111, #112, #113); M4 staff built (in review). ROADMAP §3.3 P-18 and P-19, started on the founder's instruction (2026-11-12). ADR-0031.

A business is the operator of one or more commercial facilities (a pitch, a court, a hall). It gets operator rights over its venues after an administrator approves it. Each milestone is one PR and leaves `pnpm check`, `db:test`, `test:integration` and web E2E green.

## Decisions taken (founder, 2026-11-12)

| Question | Decision |
|---|---|
| Proof of ownership | **An administrator decides**, by reviewing the person and the request (and contacting the business if needed). No document upload |
| Adding a business | Only with an administrator's approval; administrators can also add one directly (M2) |

Defaults chosen while planning (the founder can change them): at most **3** businesses per person (waiting requests included); at most **10** venues per request; a venue belongs to at most **one** business; only `COMMERCIAL_FACILITY` venues can be claimed; ownership never changes a venue's verification (ROADMAP P-18).

## Milestones

### M1: the business request and its review
- **Database:**
  - `businesses` (name, province, contact phone and/or e-mail for administrators only, a message, status `PENDING` / `ACTIVE` / `REJECTED` / `DISSOLVED`, who decided and why);
  - `business_members` (role `OWNER`, later `STAFF`);
  - `business_venues` (one business per venue; claimed in the request, effective on approval).
  - RLS on, no API grants: everything goes through RPCs.
  - `request_business`, `cancel_business_request`, `list_my_businesses`;
  - `admin_list_business_requests`, `admin_decide_business` (second factor, audited, a reason is required to reject);
  - notifications `BUSINESS_APPROVED` / `BUSINESS_REJECTED`;
  - export and purge (the contact details are personal data).
- **App:** Profile › "İşletmelerim" (status, reason of a rejection, withdraw, limit); the request form (name, province, contact, message, venues found by name in the province); console section "İşletmeler".

### M2: administrators add businesses; businesses on the map
- `admin_create_business` with an owner chosen in the console (P-19); hide and restore.
- The venue and event pages show the venue's business.

### M3: operator tools
- An owner edits their venues' details (name, address, sports), never verification; staff members.
- **As built (founder, 2026-11-12):** once a business is approved or added by an administrator, its owner edits the business (name, contact) and its venues (name, address, sports). Staff members came in M4 (founder, 2026-11-13): the owner invites from a player card; staff edit the venues, not the business, its contact or its staff.

## Risks

- **Impersonation:** a person claims a facility they do not run. The review is the brake; the contact details let the operator check.
- **Personal data:** contact phone and e-mail are visible to administrators only, exported and purged (SECURITY §8 item 18).
- **Moderation load:** every request is manual work (R-9).
