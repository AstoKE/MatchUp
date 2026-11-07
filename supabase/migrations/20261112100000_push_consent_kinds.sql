-- Phase 8 / M4: consent kinds for the two kinds of push notification (ADR-0028). Alone in its migration: a new enum value
-- cannot be used in the transaction that adds it (20261112110000 uses them).
alter type public.consent_kind add value if not exists 'PUSH_RECOMMENDATIONS';
alter type public.consent_kind add value if not exists 'PUSH_REMINDERS';
