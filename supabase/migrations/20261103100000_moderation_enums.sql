-- Phase 6 / M4, part 1: the names that part 2 uses. A new enum value cannot be used in the transaction that adds it, so
-- it lives in a migration of its own (docs/PHASE6_PLAN.md M4).

-- An event an administrator canceled. Shown to the participants as the reason, the way the organizer's own reasons are.
alter type public.event_cancel_reason add value if not exists 'MODERATION';

-- Forward-only: 20261031100100 lists the actions known then.
alter table private.audit_logs drop constraint audit_logs_action_check;
alter table private.audit_logs add constraint audit_logs_action_check check (action in (
  'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELED',
  'ACCOUNT_PURGED', 'ACCOUNT_PURGE_FAILED', 'DATA_EXPORTED',
  'ATTENDANCE_DISPUTE_RESOLVED',
  'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN',
  'REVIEW_HIDDEN', 'REVIEW_RESTORED'));
