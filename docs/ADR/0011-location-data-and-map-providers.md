# ADR-0011 — Location data, tiles and geocoding

**Status:** Accepted principles; concrete provider selected in Phase 4

**Context (verified 2026-10-24 on the OSMF policy pages).** `tile.openstreetmap.org` is best-effort and donation-funded; it prohibits bulk/offline/prefetch use, requires a distinctive User-Agent and a valid Referer on web, requires visible attribution, and may block without notice. The public Nominatim service prohibits autocomplete, limits to 1 request/s for the whole app, requires caching, and must be switchable off without an app update. OSM data is ODbL (attribution + share-alike on derived databases).

**Decision.**
1. No dependence on the public OSM tile or Nominatim servers in production.
2. MVP needs **no geocoding**: location = seeded `districts` + a user-placed pin + label; venue search runs on our own `venues` table using `unaccent`/`pg_trgm` and a deterministic Turkish normalizer.
3. Tiles (Phase 4): MapLibre rendering with either a commercial vector-tile provider (restricted key, attribution displayed) or self-hosted Protomaps/PMTiles on object storage; choose by cost estimate and Turkish label quality at that time.
4. Venue data provenance is stored separately from verification. OSM-derived venues, if ever imported, remain separable (`provenance = OSM_IMPORT`) pending legal review of ODbL share-alike; initial venue data comes from admin curation and user submissions.
5. No scraping of Google Maps/Places; no storage of Google content beyond permitted caching; not used in MVP.
6. User location is optional and transient; events may hide exact location until approval; hidden pins are snapped to a ≥ 300 m grid server-side.

**Consequences.** Slightly more manual venue seeding work and a paid or self-hosted tile source in exchange for licensing clarity and predictable behavior. Map features require development builds on native.
