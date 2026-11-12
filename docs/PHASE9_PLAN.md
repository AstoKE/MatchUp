# Phase 9 plan: organizations

Status 2026-11-12: M1–M3 merged (#106, #107, #109); M4 built (in review). ROADMAP §3.3 P-16 and P-17, started on the founder's instruction ("sıradaki feature ile devam et", 2026-11-11). ADR-0030.

An organization is a lasting group (a team, a club, a regular crowd): a name, a page, members and roles, and events created as the group. It merges ROADMAP P-04's persistent teams and P-07's organizations into one concept. Each milestone is one PR and leaves `pnpm check`, `db:test`, `test:integration` and web E2E green.

## Decisions taken (founder, 2026-11-11)

| Question | Decision |
|---|---|
| Who may create one | Anyone onboarded may **send a request**; an administrator looks at the person in the console and approves or rejects it. No other threshold (account age, events organized, reliability). Once SMS verification is switched on (ADR-0029), a verified phone is required, as for every write |
| How many | At most **2** per person as owner; a waiting request counts. Being a member of others is unlimited |
| Membership | By **invitation or request**; either way the owner or an administrator of the organization accepts |
| Commercial tier | **Not now.** A verified commercial organizer (PRD §2) comes with businesses and pricing (P-15, P-18) |

## Milestones

### M1: the creation request and its review
- **Database:**
  - `organizations` (name, description, province, 1–5 sports, status `PENDING` / `ACTIVE` / `REJECTED` / `DISSOLVED`, who decided and why);
  - `organization_members` (role `OWNER` / `ADMIN` / `MEMBER`; M1 only writes the owner).
  - RLS on, no API grants: everything goes through RPCs.
  - `request_organization`, `cancel_organization_request`, `list_my_organizations`;
  - `admin_list_organization_requests`, `admin_decide_organization` (second factor, audited, a reason is required to reject);
  - notifications `ORGANIZATION_APPROVED` / `ORGANIZATION_REJECTED` to the requester;
  - export and purge.
- **App:**
  - Profile › "Organizasyonlarım": the person's organizations and requests with their status, and "Organizasyon kur" (hidden at the limit);
  - the request form (name, description, province, sports);
  - console section "Organizasyonlar": waiting requests, the requester's account, approve, reject with a reason.
- **Tests:** pgTAP (rules, limit, who sees what, admin with and without the second factor, audit, export, purge), integration through the API, components.

### M2: the organization page and membership
- A public page for an active organization: name, description, province, sports, member count, owner and administrators.
- Invite a person (from their player card), request to join, accept or decline, leave, remove, make or unmake an administrator, hand over ownership.
- The organization's member list is visible to its members.
- Notifications for invitations and requests.

### M3: events as the organization
- An owner or administrator creates an event as the organization (`events.organization_id`). The event page shows it, and the organization page lists its upcoming events.
- **As built:** the organizer links (or unlinks) their event in event management ("Organizasyon adına"), so the multi-step event form is unchanged; `set_event_organization` is a separate, additive call.
- `event_type` stays `COMMUNITY`: no commercial tier (decision above).

### M4: safety
- Report an organization (new report target). The console can hide an organization and see its members.
- Blocks: a blocked pair cannot invite each other or see each other in member lists.
- Organization names and descriptions follow the display-name rules (no links, addresses or phone numbers).

## Risks

- **Moderation load:** every request is a manual review by one operator (R-9). The limit of 2 and the review itself are the brakes.
- **Names:** an organization name is public content; the same filter as display names, and reporting (M4).
- **Purge:** an organization survives its owner only if another administrator exists; otherwise it is dissolved (M1 for owners, M2 hands over ownership).
