-- Phase 5 / M1 follow-up: the admin resolution of an attendance dispute is audited, so its action must be allowed
-- by the audit_logs check (20261025150000 lists the actions known then). Forward-only: the first M1 migration stays as
-- applied.
alter table private.audit_logs drop constraint audit_logs_action_check;
alter table private.audit_logs add constraint audit_logs_action_check check (action in (
  'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELED',
  'ACCOUNT_PURGED', 'ACCOUNT_PURGE_FAILED', 'DATA_EXPORTED',
  'ATTENDANCE_DISPUTE_RESOLVED'));
