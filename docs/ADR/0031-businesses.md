# ADR-0031: Businesses, approved by an administrator, operate their venues

**Status:** Accepted (Phase 10, 2026-11-12). Implements ROADMAP P-18 and P-19 and the PRD's "Venue Operator" role. Plan: `docs/PHASE10_PLAN.md`.

## Context

Commercial facilities (pitches, courts, halls) want to be present and to manage their listing. Anyone claiming a facility is an impersonation risk, and venue verification (Phase 4) must stay an administrator's statement about the place, not something a claimant can grant themselves.

## Decision

1. **A business is its own entity.** `businesses`, with members in `business_members` (`OWNER`, later `STAFF`) and its venues in `business_venues`. Operator rights come only from these rows (the `platform_admins` pattern), never from the client.
2. **Ownership is decided by an administrator (founder).** `request_business` writes a `PENDING` business with its owner and the claimed venues; an administrator with the second factor approves or rejects it with a reason, audited; the requester is notified. No document upload: the review, and contact with the business when needed, is the proof.
3. **Venues.** Only `COMMERCIAL_FACILITY` venues can be claimed; a venue belongs to at most one business (a unique row, so two claims cannot both stand); a rejected request releases its claims. Ownership never changes `verification_status`.
4. **Contact details are for administrators only.** Phone and/or e-mail, at least one; never shown to players; exported and purged with the person.
5. **RPCs only,** with RLS on and no API grants; `SECURITY DEFINER`, `search_path = ''`, revoked from `anon`.
6. **Limits:** at most 3 businesses per person (waiting requests included), at most 10 venues per request.

## Consequences

**Positive**
- Operators can be onboarded without a document pipeline or storage of sensitive papers.
- Verification and ownership stay separate statements.

**Negative**
- Manual review per request.
- A wrong approval gives someone operator rights until an administrator notices; hiding (M2) and reporting limit the damage.
