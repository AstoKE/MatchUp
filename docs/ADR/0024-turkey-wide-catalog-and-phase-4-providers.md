# ADR-0024 — All of Turkey in the catalog, Wikidata for it, MapTiler for tiles, PostGIS for points

**Status:** Accepted (2026-11-05, the Phase 4 plan was merged in #71)

**Context.** The PRD scoped the MVP to an Ankara pilot: one city, its 25 districts, "Ankara only" in onboarding. The founder decided on 2026-11-05 that the public launch offers every province and district of Turkey, and that Phase 4 (location, venues, map) is finished before Phase 7. ADR-0011 left the tile provider open until Phase 4; ADR-0019 postponed coordinates and PostGIS to it. Four choices were made with the founder the same day: MapLibre with a commercial tile provider, Wikidata as the source of provinces and districts, venues added by administrators and suggested by users, and the province on the profile as the default for discovery.

**Decision.**

1. **Catalog: all 81 provinces and their districts** (973 according to the Ministry of the Interior's published count). Every province is active. The pilot's operations (moderation hours, first communities) can still start in Ankara; the product no longer assumes it. Existing `cities`/`districts` rows (Ankara and its 25 districts) keep their ids and slugs, since events and profiles reference them.
2. **Source: Wikidata (CC0) for identity and points, the official list for which districts exist.** Querying Wikidata by class returns 1038 "district of Turkey" items (former districts, abolished central districts, towns typed as districts), so the class is not the list. The list is the Ministry of the Interior's 81 / 973 as tabulated in the Turkish Wikipedia article "Türkiye'nin ilçeleri" at a pinned revision; only names, which are facts, are taken from it. Each district is matched to the Wikidata item of the article it links to (usually the seat town). The result is a file committed to the repo; where the two sources' points differ by more than 15 km the row was checked by hand (two use the list's point, recorded in the script). *(Revised 2026-11-06 in M1.)* The app never queries Wikidata at runtime. Centroids come from P625. A missing one is taken from OpenStreetMap by hand and recorded as such. Only a point is taken, no geometry, so ODbL share-alike does not reach the database (ADR-0011 §4).
3. **Tiles: MapLibre with MapTiler** (vector tiles, Turkish labels, restricted key, attribution visible). The style URL lives in configuration, so changing the provider (or moving to self-hosted PMTiles, ADR-0011 §3) needs no app release. The founder opens the account and keeps the key. No geocoding (ADR-0011 §2 stays).
4. **PostGIS** in schema `extensions`, `geography(Point, 4326)` (DATABASE §2 rule 6). The exact pin is stored only in `event_private_details`. `events.public_point` holds the exact pin for `PUBLIC` events and a point snapped to a 500 m grid for `APPROVED_ONLY` ones, computed by the server (ADR-0011 §6 asks for ≥ 300 m).
5. **Venues:** administrators add them as verified; signed-in users suggest them, and a suggestion is usable straight away but shown as "unverified" until an administrator verifies or hides it (ROADMAP F-21). Provenance and verification stay separate columns (DATABASE §3, ADR-0011 §4).
6. **Default city for discovery:** the province on the profile; for guests and people without one, the last one picked on this device, else Ankara. It can be changed from the top of Discover.
7. **The map is a lazy chunk on web** with its own size ratchet. INITIAL must not move (it is exactly on its limit). On native the map is a native dependency, so it ships with a new development build.

**Consequences.**

- PRD §1, §3 (row 6), §4.1 and §4.6 change from "Ankara" to "Turkey, Ankara by default". The pilot city becomes an operational choice, not a product rule.
- Moderation and support cover the whole country from the first day. This is a risk for a solo operator (ROADMAP R-9): the quotas for new accounts (Phase 6 M6) and reports apply everywhere. Hosted public sign-up stays disabled until the launch checklist is done (ADR-0016).
- MapTiler is a recurring cost and a third party that sees tile requests (approximate area, IP address). It has to be named in the privacy notice (SECURITY §8, needs counsel).
- The catalog file is a reviewed artifact. A change to districts (law, merger) is a new migration that updates names or deactivates rows. Rows are never deleted.
