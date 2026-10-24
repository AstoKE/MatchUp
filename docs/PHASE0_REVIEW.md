# Phase 0 Review

Date: 2026-10-24 · Status: **Phase 0 complete and approved; Phase 1 authorized** with the confirmed decisions in §4a. (Original Phase 0 text below is retained as written; where §4a differs, §4a wins.)

## 1. What Phase 0 produced

`README`, `CLAUDE.md`, `.gitignore`, and under `docs/`: PRODUCT_VISION, PRD, ARCHITECTURE, DATABASE, USER_FLOWS, UI_DESIGN_SYSTEM (provisional), SECURITY, RATING_SYSTEM, ROADMAP (backlog, risks, Phase 1 plan), TESTING, DEPLOYMENT, this review, and 12 ADRs.

## 2. Evidence base and its limits

| Claim type | How established | Limitation |
|---|---|---|
| Package versions, Expo SDK 57/58 contents, peer dependencies, Node requirements | npm registry + Expo's `bundledNativeModules.json` queried 2026-10-24 | **Nothing was installed or built.** Compatibility is inferred from metadata; the Phase 1 M0 spike is the real test. Registry values moved during the session (e.g. `expo` 58.0.19 → 58.0.28), so ranges, not exact pins, are recorded |
| SDK 58 release facts (Expo Go timing, breaking changes) | Expo upgrade-guide page via web fetch (summarized by a tool) | Secondary summary; re-read the primary changelog in M0 |
| OSM tile and Nominatim policies | OSMF policy pages via web fetch | Policies change; re-check in Phase 4 |
| Supabase SMTP limits, regions, PostGIS guidance | Supabase docs via web fetch | Plan limits and extension availability per plan must be checked at project creation |
| GoodRec | Two public marketing pages | No app access; reputation/attendance/notification behavior **not observed** (PRODUCT_VISION §6) |
| Color contrast ratios | Computed with the WCAG formula (script run) | Provisional palette; recompute for `design.md` |
| Rating/reliability examples | Hand-computed (e.g. 97.7 %, 90.0 %, 78.3 %, 45.0 %; level thresholds) | Not yet executed in code; they become golden test vectors in Phase 5 |
| Legal/KVKK content | Engineering knowledge | **Not legal advice**; list of items for counsel in SECURITY §8 |

## 3. Consistency review

Checks performed by cross-reading the documents against each other, with defects found and fixed in this pass.

| Requirement | Result |
|---|---|
| MVP scope matches roadmap | All 31 brief items map to feature IDs (PRD §3) and each ID appears in the backlog with a phase (ROADMAP §3). ✔ |
| DB matches user flows | Each flow's data needs exist (e.g. `request_message`, `preferred_position_id`, `cancellation_excused`, `event_private_details` for WhatsApp links/approved-only locations, `attendance_disputes`). ✔ **Fixed:** `analytics_events` and `app_config` were referenced by other docs but timed/defined inconsistently → now defined, with phase placement (Phase 1 / Phase 3). |
| Authorization matches roles | PRD matrix ⇄ DATABASE RLS/RPC ⇄ SECURITY S-1…S-20 ⇄ ADR-0003. Admin is a table row (not JWT metadata) everywhere. ✔ **Fixed:** new-account rule was a publish ban in SECURITY but a quota elsewhere → now quotas only. |
| Event states match participation workflows | Lifecycle is exactly four states; fullness/closed/started/finalized derived (DATABASE §6.1). Participation transitions cover REQUESTED/APPROVED/REJECTED/WAITLISTED/CANCELED/REMOVED; attendance separate with CK. Event cancel does not rewrite participation rows; cutoffs at start are identical in PRD, DATABASE and USER_FLOWS. ✔ **Fixed:** `organizer_plays` post-publish behavior was undefined → immutable; organizer row cannot be canceled via participant RPCs (I-7). |
| Ratings depend on verified attendance | Reviews, XP, reliability and badges all originate at finalization from `PRESENT`; NOT_CONFIRMED neutral; DISPUTED excluded (RATING §2). ✔ **Fixed:** the organizer's self-attested row could have created reliability credit → excluded; XP/badge credit conditioned on ≥ 2 verified non-organizer attendees. |
| Venue logic implies no reservation | No hours/prices/availability stored; booking status is organizer-declared with fixed labels; copy in USER_FLOWS and design components; `reservations` only in future entities. ✔ |
| Business expansion without premature build | `event_type` CK, provenance/verification split, notification outbox, labelled-sponsorship rule, payment abstraction named but unimplemented (ARCH §10). Future tables listed, not created. ✔ |
| Cross-references | Section references corrected (PRD→SECURITY §3/§8/§9). A link check over all `docs/*.md` and `README.md` was run (§6). |
| Tension noted, not a defect | The brief asks for five navigation sections; MVP ships four visible tabs (D-02). The brief lists many candidate tables; MVP consolidates (ADR-0012) — both are flagged for your confirmation rather than silently decided. |

## 4a. Decisions confirmed by the founder (2026-10-24) — these supersede §4 defaults

| ID | Confirmed decision | Where reflected |
|---|---|---|
| D-01 | Start with Expo SDK 58; use SDK 57 only if the M0 spike reveals meaningful, reproducible blockers; prefer development builds over Expo Go | ADR-0009, ARCHITECTURE §6, `docs/PHASE1_M0_REPORT.md` |
| D-02 | Four visible MVP tabs; navigation extensible for a future Community section | PRD §3, ARCHITECTURE §4 |
| D-04 | Supabase **Frankfurt (`eu-central-1`)** for the initial development environment; data-residency and legal-review requirements documented | DEPLOYMENT §1, SECURITY §8 |
| D-05 | Clearly documented **temporary development identifier**, not final; branding configurable | ADR-0010 |
| D-07 | 18+ self-declaration for MVP with abuse prevention and legal review | SECURITY §3, §8 |
| D-09 | **Public event discovery supports guests**; auth required for joining, organizing, rating and other authenticated actions (reverses the Phase 0 recommendation) | ADR-0013, PRD §2/§3, DATABASE §9–10, SECURITY §5/§11 (S-11, S-21), USER_FLOWS FL-2 |
| Design | GoodRec remains the primary experience reference; MatchUp design must be completely original | UI_DESIGN_SYSTEM |
| Branding | `image.png` is a **provisional** logo; its palette is not final | ADR-0010, UI_DESIGN_SYSTEM §10 |

## 4. Open decisions (original list; see §4a for those now confirmed)

**Blocking Phase 1:** D-01, D-05. Others can be answered during Phase 1–2, but defaults apply if you say nothing, and the *irreversible* ones are marked ⚠.

| ID | Decision | Recommendation (default) | Reversible? |
|---|---|---|---|
| **D-01** | Expo SDK 58 (new, no Expo Go for a few weeks) vs SDK 57 (stable, Expo Go available) | **SDK 58** with M0 gate and automatic fallback to 57 (ADR-0009). Also pins TS ~6.0, ESLint 9.39, pnpm 10 | Reversible early; upgrade cost grows with code |
| **D-02** | Navigation: ship 4 visible tabs in MVP, Community reserved | Yes (Community has no MVP features) | Yes |
| **D-03** | Attendance trust root = organizer attestation only (no participant self-claim/QR in MVP) | Accept; QR/geo check-in is P-02 | Yes, but affects data trust |
| **D-04** ⚠ | Supabase region | **eu-central-1 Frankfurt** (closest EU region; cross-border transfer needs counsel) | Migration is painful |
| **D-05** ⚠ | Domain, reverse-DNS app id, trademark check *before* the Expo app is generated | You pick/own a domain first; otherwise dev-only id marked non-publishable (ADR-0010) | **Effectively irreversible after publication** |
| **D-06** | v1 parameters: skill prior weight k = 2, review window 72 h, reliability prior (A = 3, 0.9), late-cancel rule, XP values/caps | Accept as tunable v1; recalibrate after pilot | Yes (versioned) |
| **D-07** ⚠ | Age gate = self-declaration only (no ID check) | Accept for pilot; counsel to confirm | Policy-level |
| **D-08** | Notifications: in-app only at launch; push is first post-MVP item | Accept; consider email digest for organizers if pilot shows slow approvals | Yes |
| **D-09** | Anonymous browsing of events | **No** in MVP (sign-in required; public landing only) — less scraping, simpler privacy; revisit for growth/SEO | Yes |
| **D-10** | Avatar delivery | Public bucket, unguessable names | Yes |
| **D-11** | Analytics | First-party table + Sentry (no third-party product analytics) | Yes |
| **D-12** | Moderation operations: who handles reports, what SLA (target triage < 24 h), who holds admin accounts | You, with MFA; define before pilot | Yes |
| **D-13** | Retention periods in DATABASE §11 | Provisional; counsel to confirm | Yes |

Also needed from you: **`design.md`** (place at `docs/design.md`), and a decision on whether you can review Turkish UX copy yourself or need a native-speaker reviewer for the pilot.

## 5. Assumptions made (reversible, low risk)

A-1…A-8 in PRD §6, plus: Istanbul-calendar caps for XP; organizer plays by default; one global reliability score; 60-minute publish lead time; 3-request cap per user per event; avatar-only storage in MVP; admin console inside the main app; no geocoding provider in MVP; `packages/ui` and a separate web app deferred; `web.output = "single"`.

## 6. Verification performed in this phase

- Registry/manifest queries for the versions listed in ARCHITECTURE §6 (see §2 for limits).
- WCAG contrast computation for the provisional palette (all required pairs pass; table in UI_DESIGN_SYSTEM §3).
- Hand verification of the level formula and reliability examples.
- Link/anchor-file existence check across docs (result recorded below).

**Not done (by design):** no code, no dependency installation, no migrations, no builds, no tests (none exist yet).

## 7. Link check result

A script run on 2026-10-24 over all 27 Markdown files found 57 relative links (0 broken) and 66 `DOC §N` section references (0 unresolved). Anchors inside files and external URLs were not checked.
