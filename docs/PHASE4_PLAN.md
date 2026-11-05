# Phase 4 plan: all of Turkey, places, venues and the map

Status 2026-11-06: **M1 and M2 built** (one PR), M3 to M6 not started. Scope: ROADMAP F-20 (the pin, postponed from Phase 3 by ADR-0019), F-21, F-22, plus all 81 provinces and their districts, a decision of 2026-11-05 recorded in [ADR-0024](ADR/0024-turkey-wide-catalog-and-phase-4-providers.md). Sources of truth stay `docs/PRD.md` §4.4 and §4.6, `docs/DATABASE.md` §3, `docs/SECURITY.md`, ADR-0011. This file sequences the work and lists the decisions it needs.

**Why now.** The launch offers every province, and the catalog, the city picker and the pin are hard to add once real events exist in places the schema does not know. Phase 7 starts after this.

## What exists

- `cities` (Ankara) and `districts` (its 25), loaded by `20261025100000_reference_catalog.sql`, with `names` jsonb, `timezone`, `is_active`; `private.assert_location`.
- Events: city, district, place label, optional address; `location_visibility` `PUBLIC/APPROVED_ONLY`; `booking_status` with its four values, already on the form and the event page.
- `search_events` filters by city and district, with no distance filter or sort.

Not there:

- PostGIS, centroids, any point.
- `venues`.
- A city picker: four places take `cities[0]` (`DiscoverScreen`, `EventStepper`, `EventForm`, `draft.ts`), and onboarding says "Ankara only".
- A map.

## Milestones (one at a time, each leaves `pnpm check`, `db:test`, `test:integration` and web E2E green)

### M1: the catalog of Turkey

**Status 2026-11-06: built** in `20261106100000_turkey_catalog.sql`: 81 provinces, 973 districts, centroids, `wikidata_id`, PostGIS (moved here from M3 so the points load with the rows), `catalog_places()`. Deviations from the plan below: the list of which districts exist comes from the official count as tabulated on Turkish Wikipedia (the Wikidata class holds 1038 items), and no per-province counts file was needed (ADR-0024 §2, revised). The 973 districts arrive in one RPC, not per province: about 120 kB of JSON once per session, cached for an hour. pgTAP `25_turkey_catalog` (20), script tests for slugs and for the migration matching the JSON, the integration catalog test.

- **Script** `scripts/catalog/build-tr-catalog.mjs` (run by hand, not in CI): it queries Wikidata, writes `supabase/seed/catalog/tr-provinces-districts.json` with ids, Turkish and English names, slugs, centroids and the Wikidata QID, and checks each province against the official count in `scripts/catalog/official-counts.json`. It stops on any difference not listed in `scripts/catalog/exceptions.json` with a reason. The JSON is committed and reviewed in the PR.
- **Migration:** it inserts the 80 new provinces and their districts, keeps Ankara's rows and ids, and adds the `wikidata_id` columns. Centroids stay in the file until M3 adds PostGIS and the column, then they are loaded from it. Slugs are made with the `tr` locale (İ/ı) and are unique per province.
- **Catalog reads:** it is no longer one request with every district (973 rows). Cities come in one request; a city's districts come when it is chosen, with a long cache. A new `get_districts(city_id)` is not needed if the RLS read with a filter stays fast. It is measured.
- **Tests:**
  - pgTAP: 81 provinces, the official total, every district under an active province, unique slugs, Ankara's 25 ids unchanged.
  - Vitest for the slug function (İstanbul → istanbul, Iğdır → igdir, Şırnak → sirnak).
- **Acceptance:** `db:reset` loads the full country. The hosted push loads it once (`on conflict do nothing`), and existing events and profiles still point at the same rows.

### M2: choosing a province and a district everywhere

**Status 2026-11-06: built.** `Select` gained a search box (Turkish letters fold: "izm" finds İzmir), used for province and district in onboarding, the profile, the event form and the district filter. Discover has a province button at the top (a sheet with search, 81 provinces), remembered as `matchup.city`, and now sends `city_id` to `search_events` (before, it listed every city). A new event starts in the profile's province, else the last pick, else Ankara (`defaultCityId` in the domain package). No `cities[0]` is left. The Turkish label is now "İl" (English "Province"). The event form became a lazy chunk to make room in the first load (`docs/PERFORMANCE.md` §4 item 5). Tests: domain, components (Discover, create flow), a Playwright flow with axe.

- A searchable picker for the 81 provinces (Turkish-aware matching: "izmir" finds İzmir) and then for the district. The same component is used in onboarding, the profile, the event form and Discover.
- Discover default: the province on the profile; otherwise the last one picked on this device (`matchup.city`, read in try/catch); otherwise Ankara. It can be changed from the top. An event's city and timezone come from what was picked, not from `cities[0]`.
- Onboarding copy no longer says Ankara (tr and en).
- **Tests:**
  - Components: picker search with Turkish characters, the default order.
  - Playwright with axe: create an event in İzmir/Karşıyaka and find it from Discover after switching city.
- **Acceptance:** no code path assumes one city (a grep for `cities[0]` is empty).

### M3: points: PostGIS, the pin and distance

- PostGIS in `extensions`.
- `cities.centroid` and `districts.centroid` are filled from the M1 file.
- `event_private_details.exact_point` holds the exact pin; `events.public_point` holds the exact pin for `PUBLIC` events and a 500 m grid snap for `APPROVED_ONLY` ones, computed by the server.
- **`create_event` / `update_event`** take an optional `point` in their jsonb input (additive: old apps send none and get the district centroid as `public_point`, flagged `point_is_approximate`). The point must lie within the province's bounding box plus a margin. The organizer changing the pin is a material change (notification, as for the address).
- **`get_event`** gives the exact point only to those who see the address today (organizer, approved players, everyone for `PUBLIC`).
- **`search_events`** takes optional `near` (a point the device sends, never stored or logged) and `radius_km` (1 to 50), plus sort `NEAREST`. Results carry a rounded distance. A GiST index backs this.
- Export includes the user's own pins; purge removes nothing new (events are anonymized, not deleted).
- **Security impact:** high. A wrong branch leaks an exact location. The tests are a matrix: viewer (guest, stranger, requested, waitlisted, approved, removed, blocked, organizer) × visibility. Mutation checks remove the snap and the visibility condition.
- **Tests:**
  - pgTAP: the matrix, the snap is ≥ 300 m from the truth for random points, input validation.
  - Integration: distance search over 5000 events (target: same order as today's 52 ms guest search on this laptop).
  - Components: distance shown rounded.
- **Acceptance:** nobody who could not see the address can get within 300 m of the pin from any RPC.

### M4: venues

- `venues` and `venue_sports` as in DATABASE §3, plus `name_search` with `private.normalize_tr` and a trigram index.
- RPCs:
  - `search_venues(city, district, sport, text)`, for everyone.
  - `suggest_venue(...)`, for signed-in users, counted against the new-account quotas and 5 a day.
  - `admin_add_venue`, `admin_set_venue_status` (verify, hide, restore; aal2, written to `moderation_actions`).
  - `events.venue_id`: an optional input of `create_event`. The venue's point becomes the event's pin; the organizer still chooses the visibility.
- Reports gain the target type `VENUE`. Hidden venues disappear from search but stay on existing events as plain text.
- Screens:
  - The event form offers "pick a venue" before "place a pin".
  - "Suggest a venue" with name, kind, sports and pin.
  - The event page shows "unverified" for a suggestion. The booking status keeps its "declared by the organizer" label (PRD §4.6), which is checked, not rebuilt.
- Admin console: a venues tab (queue of suggestions, verify or hide, search).
- **Tests:**
  - pgTAP: RLS, quotas under concurrency, hidden venues, admin aal2 negatives.
  - Components and Playwright: suggest, then verify as admin, then see it as verified.
- **Acceptance:** a suggestion is usable at once, labeled unverified; only an administrator at aal2 changes that.

### M5: the map

- **Configuration:** `EXPO_PUBLIC_MAP_STYLE_URL` (MapTiler style with the restricted key) in `packages/config` validation. Without it the app shows the list only and says why in development.
- **Web:** `maplibre-gl` as one lazy chunk, loaded when someone opens the map or the pin picker. It gets a separate ratchet in `scripts/check-bundle-size.mjs`; INITIAL must not move.
- **Native:** `@maplibre/maplibre-react-native`, a native dependency, so a new development build in the Linux container (ADR-0015) and on EAS for iOS.
- **Discover:** a list ⇄ map toggle. Pins come from `public_point`; snapped events show a circle, not a pin. Tapping one opens the card. Attribution is always visible.
- **Pin picker** in the event form, centered on the district, and in "suggest a venue".
- **Device location:** "near me" only on request, through the OS permission. It is not stored or sent anywhere but the search call.
- **Tests:**
  - Components with the map mocked at the module boundary.
  - Playwright: toggle, pin pick, attribution, axe (the map gets a text alternative: the list stays reachable).
  - Bundle ratchets.
- **Acceptance:** works on web and on the Android emulator (the user says "koş"); iOS on the simulator via EAS.

### M6: validation and the report

- Performance of distance search and of the catalog read on hosted-like data.
- `docs/PHASE4_REPORT.md`: what is verified where (web, Android emulator, iOS simulator) and what is not.
- Hosted push of the migrations by the founder, with a dry run first and then the advisors.
- Privacy notice draft: MapTiler named as a processor, for counsel (SECURITY §8).

## Decisions taken (2026-11-05, with the founder)

| Question | Decision |
|---|---|
| Map | MapLibre + a commercial tile provider: MapTiler (ADR-0024 §3) |
| Provinces and districts | Wikidata CC0, checked against the official 81 / 973 |
| Venues | Administrators add, users suggest, suggestions are "unverified" until approved |
| Discover default | Profile province, else the last pick, else Ankara, changeable from the top |

## Needed from the founder, and when

- **By M5:**
  - A MapTiler account and a key restricted to the app's web origins and the Android and iOS bundle identifiers. The key is put in `.env.local` and in EAS secrets by the founder; it is never committed.
  - The plan's free quota is checked against the expected use first.
- **M1 review:** the reconciled district list in the PR (973 rows: a skim, plus the exceptions file).
- **Proposed defaults, which a review comment can change:**
  - The 500 m snap.
  - A 50 km maximum radius.
  - 5 venue suggestions a day.
  - A pin is required in the new event form (old apps keep working without one).

## Risks

- **District reconciliation** is the slowest unknown: 1038 Wikidata items against 973. It is bounded by the exceptions file and the per-province counts.
- **Map size on web:** MapLibre GL is about 250 kB gzip. It stays lazy and outside INITIAL; if TOTAL has to grow, the reason is written down.
- **Location leaks:** covered by the M3 matrix and mutation checks.
- **Nationwide moderation load with one operator** (R-9). Sign-up stays closed until the launch checklist.
