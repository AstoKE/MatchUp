# ADR-0030: Organizations, created on request and approved by an administrator

**Status:** Accepted (Phase 9, 2026-11-11). Implements ROADMAP P-16 and P-17; merges P-04 (persistent teams) and P-07 (organizations) into one concept. Plan: `docs/PHASE9_PLAN.md`.

## Context

The founder wants lasting groups (teams, clubs) that people belong to and that create events. Without a brake, groups become a spam and impersonation surface, and moderation is one person (R-9). DATABASE §4 already reserved `organizations`, `organization_members` and `events.organization_id`.

## Decision

1. **One concept.** "Team", "club" and "organization" are the same thing in the product and the schema: `organizations`, with members in `organization_members` (roles `OWNER`, `ADMIN`, `MEMBER`). Authority comes only from membership rows, following the `platform_admins` pattern; nothing is taken from the client or JWT claims.
2. **Created on request, approved by a person.** `request_organization` writes a `PENDING` organization and its owner row. An administrator with the second factor approves it (`ACTIVE`) or rejects it with a reason (`REJECTED`), in the console, and each decision is audited. The requester is notified either way.
3. **Thresholds (founder):** no account-age, event-count or reliability threshold; the review is the filter. A verified phone is required once ADR-0029's switch is on (the onboarded-user guard already enforces it). At most **2** organizations per owner, pending ones included.
4. **Status, not deletion.** `PENDING` → `ACTIVE` or `REJECTED`; a requester may withdraw a pending request (the row is deleted, since nothing depends on it). `DISSOLVED` ends an active organization (its owner's purge without another administrator; later, by the owner). Rejected rows stay for the record and stop counting toward the limit.
5. **RPCs only.** RLS is on with no API grants on either table; reads and writes go through `SECURITY DEFINER` functions (`search_path = ''`, `auth.uid()`, revoked from `anon`).
6. **No commercial tier now.** `events.event_type` stays `COMMUNITY`; organization events (M3) use `events.organization_id`.
7. **Privacy.** Names and descriptions are public once active and follow the display-name filter (no links, e-mail addresses or phone numbers). Memberships and requests are in the account export; the purge removes memberships and dissolves organizations left without an owner or administrator.

## Consequences

**Positive**
- One small model that teams, clubs and later commercial organizers can share.
- Abuse is limited by a human review and a low per-person limit, with no score to game.

**Negative**
- Every request is manual work for the operator; a backlog delays groups.
- Without a commercial tier, a business that wants to run events must wait for P-18.
- An organization whose owner deletes their account without handing over is dissolved (hand-over comes in M2).
