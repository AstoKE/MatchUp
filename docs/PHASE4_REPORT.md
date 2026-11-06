# Phase 4 report: all of Turkey, pins, venues and the map

Status 2026-11-07. Scope: ROADMAP F-20 (the pin, postponed by ADR-0019), F-21, F-22, plus every province and district of Turkey (ADR-0024, a decision of 2026-11-05). Plan and per-milestone notes: [PHASE4_PLAN](PHASE4_PLAN.md). **Not started on purpose:** Phase 7.

## 1. What was built

| Milestone | Result | Where |
|---|---|---|
| M1 catalog | 81 provinces, 973 districts (the official count), centroids, Wikidata ids, PostGIS; `catalog_places()` as one read; a reproducible build script with a pinned source revision | `20261106100000_turkey_catalog.sql`, `scripts/catalog/`, #72 |
| M2 province picker | searchable province and district fields (Turkish letters fold), Discover's province at the top (profile, else last pick, else Ankara), Discover now filters by province, no `cities[0]` left | #72 |
| M3 points | the exact pin only in `event_private_details`; `events.public_point` exact / ~500 m cell / district centre; distance search (`near`, `radius_km`, `NEAREST`) measured from the public point | `20261107100000_points_and_venues.sql`, #73 |
| M4 venues | directory closed to the API roles, guest search, suggestions (quotas, duplicates folded), admin verify / hide / restore, venue reports, venue in the event form and on the event page, the console's Mekânlar section | same migration, #73 |
| M5 map | MapLibre on phones and on the web (lazy chunk), Discover list ⇄ map, near me (approximate location only), pin picker, "suggest a venue" with a point, centres in the catalog read | `20261108100000_catalog_centers.sql`, `features/map`, #74 |
| M6 validation | performance on 5000 events, this report, the privacy-notice wording for counsel (§6) | this change |

Decisions: ADR-0024 (all of Turkey, Wikidata plus the official list, MapTiler, PostGIS, venue suggestions, default province), revised in M1 for the source of the district list. PRD §1, §3, §4.1, §4.6, DATABASE, SECURITY, PERFORMANCE, ARCHITECTURE, DEVELOPMENT, LAUNCH_CHECKLIST and NATIVE_VALIDATION were updated in the same changes.

## 2. What was actually tested (local stack, 2026-11-07)

| Level | Result |
|---|---|
| pgTAP (all phases) | **1280 pass** in 27 files. Phase 4: `25_turkey_catalog` (21), `26_event_points` (46: every viewer kind × visibility, the snap, distance search, paging by distance, input guards, edits that move or drop the pin, export), `27_venues` (58: access, suggestions and their quotas, search, admin aal2, venues in events, hidden venues, reports, export and purge) |
| Mutation checks | 11 deliberate breakages of the new SQL, all caught: snap removed, the "inside" rule widened, the district guard removed, a moved pin not counted as a change, venues leaking for hidden locations (page and search), hidden venues found, the quota removed, the admin check removed, duplicate folding broken; plus the per-user lock removed (caught by the concurrency test) |
| API integration | **189 pass**, including `venues-concurrency`: six identical suggestions at once store one; six different ones at the daily limit store five |
| Component / domain / scripts | **562** / **155** / slug and catalog-migration tests pass; the map paths run against a stand-in map (`map-flows.test.tsx`) |
| Web E2E (Playwright + axe) | **73 pass**, Phase 4: province picker (81 provinces, search, remembered), venue on the event page, admin verifying a suggestion, near me with a granted browser position (order and distances) |
| Real web map | one headless Chromium run with MapLibre's demo tiles: canvas, worker, markers, no console errors (a probe, not kept as a test, because headless WebGL is not something CI should depend on) |
| CI | all four checks green on #72, #73, #74 |

### Performance (local stack on the Linux laptop, 5000 published events, rolled back)

2000 events in Ankara and 3000 across the country; 60 % with a pin, half of those hidden. Median after two warm-up runs (13 runs per search, 8 for the catalog), as a guest, inside the database (no network):

| Query | Median |
|---|---|
| `search_events`, soonest, Ankara | 1.1 ms |
| nearest, Ankara | 5.9 ms |
| nearest, Ankara, 10 km radius | 3.4 ms |
| nearest, whole country, 25 km radius | 12.2 ms |
| nearest, whole country, no radius | 11.6 ms |
| `catalog_places` (81 provinces, 973 districts) | 7.0 ms |

A result page is about 16 kB of JSON. The catalog is about **152 kB of JSON, 50 kB gzipped**; it is read once per app start and kept for an hour. The local gateway does not compress responses; whether the hosted gateway does was **not checked** (reading hosted is the founder's). If it does not, a cached catalog on the device (next item in §5) becomes more urgent.

### Bundle (web)

| Ratchet | Before Phase 4 | After |
|---|---|---|
| INITIAL (first load) | 555 kB | 556 kB (measured 555.26 → 555.6) |
| TOTAL (app code) | 898 kB | 913 kB |
| MAP (MapLibre, new) | none | 287 kB, loaded only when a map opens |

The event form, the event page's request/attendance/review panels and the map view became lazy chunks to keep the first load flat (PERFORMANCE §4 item 5).

## 3. What is not done or not verified

- **Native map, pin picker and near me on a device.** The new native modules need new development builds (Android in the Linux container, iOS on EAS); NATIVE_VALIDATION "Next" 0 lists what to check. Nothing native of Phase 4 has run.
- **MapTiler tiles with the founder's key.** No automated test uses the key; the founder checks it on the web once the key is in `.env.local`.
- **Hosted.** The first push (2026-11-07) applied the Phase 6 migrations and `20261106100000`, then stopped at `20261107100000`: its backfill met canceled and completed events, which no local test had (#76, DEPLOYMENT §9 fourth push). Corrected and rehearsed over frozen events; the founder retries `20261107100000` and `20261108100000` after #76.
- **Accessibility of the map itself.** Markers are buttons with names on the web and the list carries the same content, but placing a pin needs a pointer: someone who cannot use the map can still choose a venue or leave the pin out (it is optional). A typed-address alternative would need geocoding, which ADR-0011 rules out for the MVP.
- **District boundaries.** Only centres are stored; "75 km from the district seat" guards against mistakes but does not prove a pin is inside the district.

## 4. Risks

- **Moderation across the whole country with one operator** (ROADMAP R-9). Venue suggestions add a queue; quotas and reports limit it. Sign-up stays closed until the launch checklist.
- **MapTiler as a third party and a cost.** Tile requests reveal an approximate map area and the IP address; the key must be restricted by origin and bundle id (LAUNCH_CHECKLIST). The style URL is configuration, so a provider change needs no release.
- **MapLibre GL JS 6 on the web** ships its worker as a separate module file (copied by `scripts/copy-map-worker.mjs`). An upgrade must keep that script and `setWorkerUrl` in step.
- **First-load budget.** INITIAL is on its ratchet again; the next shared code needs something to leave first.

## 5. Next steps

1. Founder: push the three migrations to hosted, add the MapTiler key locally and in EAS, then "koş" for the Android development build and the native checks.
2. Keep the catalog on the device between starts (it changes only with migrations): saves ~150 kB per start if hosted does not compress.
3. Counsel: the privacy-notice paragraph in §6.
4. Phase 7, on the founder's instruction.

## 6. Privacy notice: wording proposed for counsel (draft, not legal advice)

To be added to the Privacy Notice (SECURITY §8); the app's legal texts stay drafts until counsel approves them.

> **Konum ve harita.** Etkinliğin yerini düzenleyen haritada işaretleyebilir. Yer "sadece onaylananlar" olarak gizlendiyse, onaylanmayan kullanıcılara yalnızca yaklaşık 500 metrelik bir alan gösterilir; tam nokta yalnızca düzenleyene ve onaylanan katılımcılara açılır. "Yakınımdakiler" seçeneğini kullandığında cihazının yaklaşık konumu, yalnızca o aramayı yapmak için bir kez alınır; saklanmaz ve başka bir amaçla kullanılmaz. Haritalar MapTiler AG (İsviçre) tarafından sağlanır; harita açıldığında cihazın, gösterilen bölgeye ait harita parçalarını ve IP adresini MapTiler'a iletir. Mekân önerdiğinde mekânın adı, türü ve konumu herkese açık olarak listelenir; öneriyi kimin yaptığı yalnızca yöneticilere görünür.

> **Location and maps.** An organizer may mark an event's place on a map. If the place is hidden until approval, people not yet approved see only an area of about 500 metres; the exact point is shown only to the organizer and approved participants. When you use "Near me", your device's approximate location is read once, only to run that search; it is not stored or used for anything else. Maps are provided by MapTiler AG (Switzerland); when a map opens, your device sends MapTiler the map tiles requested for the area shown and its IP address. When you suggest a venue, its name, kind and location are listed publicly; who suggested it is visible only to administrators.

Open questions for counsel: MapTiler's role (processor or independent controller) and the transfer to Switzerland under KVKK; whether "near me" needs explicit consent beyond the operating system's permission prompt.
