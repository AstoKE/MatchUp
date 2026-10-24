# ADR-0012 — Single participation table with independent attendance field

**Status:** Accepted

**Context.** The brief lists candidate tables `participation_requests`, `event_participants`, `event_waitlist_entries`, `event_attendance`. Splitting one user's relationship to one event across four tables creates duplicate-state bugs (a user both waitlisted and approved), complicates capacity locking, and multiplies RLS policies. But attendance has a different writer (organizer, after the event) and different semantics from approval.

**Decision.**
- One table `event_participations` with `UNIQUE(event_id, user_id)`, a `status` enum (`REQUESTED, APPROVED, REJECTED, WAITLISTED, CANCELED, REMOVED`) and a separate `attendance` enum (`NOT_CONFIRMED, PRESENT, ABSENT, DISPUTED`) constrained so attendance ≠ NOT_CONFIRMED only when `status = APPROVED`.
- Waitlist order = `waitlisted_at` (FIFO), not a separate table.
- Attendance disputes get their own small table because they have a distinct lifecycle and actors.
- Event lifecycle (`DRAFT/PUBLISHED/CANCELED/COMPLETED`) is not mixed with fullness, registration state, start, or attendance finalization — those are derived or timestamps.
- Event cancellation does not rewrite participation rows.

**Consequences.** Fewer joins and one locking target; transitions are validated in one trigger. A status history is not kept per row beyond timestamps in MVP (reliability needs only `approved_at/canceled_at`; audit of privileged actions goes to `audit_logs`). If detailed history is later required, add an append-only `participation_transitions` table without changing the model.
