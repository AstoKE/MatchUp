-- Phase 7 / M4: a consent kind for usage analytics. Alone in its migration: a new enum value cannot be used in the
-- transaction that adds it (20261110110000 uses it).
alter type public.consent_kind add value if not exists 'ANALYTICS';
