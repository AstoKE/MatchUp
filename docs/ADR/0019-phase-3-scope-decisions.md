# ADR-0019 — Phase 3 scope: location without coordinates, quotas in config, polling, analytics later

**Status:** Accepted (2026-10-27, founder). Amends PRD §4.6 (Phase 3 location), DATABASE §3.3/§3.4/§3.6 and §9 (event input shape).

**Context.** Phase 3 (event engine) is list-based; maps and venues are Phase 4. The documents asked for coordinates/pins and PostGIS already in Phase 3, server-side analytics from the first event RPCs, and did not fix quota numbers.

**Decisions.**
1. **Location in Phase 3 = city + district + place label (+ optional street address), no coordinates.** `public_point`/`exact_point`, PostGIS and city/district centroids arrive with the map in Phase 4 (ADR-0011). Location privacy still works: `events.public_location_label` is filled only when `location_visibility = PUBLIC`; the label and address always live in `event_private_details` (organizer + approved participants). The district is always public.
2. **Quotas live in `app_config`** (changeable without a migration) and are checked under a per-organizer / per-user advisory lock so parallel requests cannot exceed them: ≤ 5 upcoming published events per organizer, ≤ 10 events created per rolling 24 h, ≤ 20 open requests per user (Phase 3 M4), ≤ 3 requests per event (already specified). Publishing needs `starts_at ≥ now() + event.min_lead_minutes` (60).
3. **Event RPCs take one `jsonb` input** validated by a single server function (`private.parse_event_input`), instead of ~20 positional parameters: new optional fields can be added without versioning the function, which keeps installed apps compatible (DEPLOYMENT §3). Updates merge the input over the stored event and re-validate the whole result.
4. **Notifications are polled** (on app focus and every 60 s while visible); Supabase Realtime can be added later without schema changes.
5. **`analytics_events` is deferred to Phase 7** together with the client `track_event` RPC and dashboards: no product analytics data is collected before then (less personal data, nothing extra to export/purge).
6. New domain codes: `QUOTA_EXCEEDED`, `START_TOO_SOON`.

**Consequences.** + No map/geo dependency in Phase 3; the schema adds coordinates additively in Phase 4. + Quotas can be tuned for the pilot from config. − Discovery cannot sort by distance until Phase 4 (district filter only). − Without analytics there are no funnel numbers for the pilot until Phase 7.
