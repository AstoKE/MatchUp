# Rating, Reliability, XP and Badges

Status: Phase 0 specification · Algorithm versions: skill v1, reliability v1, XP rules v1 · Implemented in Phase 5

Related: [DATABASE §3.5 / §6.3](DATABASE.md) · [SECURITY](SECURITY.md) · ADR-0004

## 1. Principles

1. **Three independent dimensions**, three separate computations, three separate stores:

| Dimension | Answers | Input | Output |
|---|---|---|---|
| **Skill** (per sport) | "How good, according to peers who played with them?" | Peer reviews (+ self-assessment as a prior) | 1.0–5.0 + confidence |
| **Reliability** | "Will they show up?" | Organizer-confirmed attendance & cancellation timing | 0–100 % + confidence |
| **XP / level** | "How active have they been?" | Verified activity | integer ledger → level |

2. **Nothing counts without verified attendance.** Every input originates from an organizer-finalized event; self-reports never count.
3. **Participation never raises skill.** Skill moves only through peer review scores. (Property test: adding attended events without reviews leaves skill unchanged.)
4. **Explainable.** Every number can be traced to rows (reviews, reliability events, XP transactions) and a documented formula; every snapshot stores `algorithm_version`.
5. **Honest.** Skill is subjective peer feedback, not an objective measurement; small samples are labeled provisional; ratings are never presented as professional assessments.
6. **Raw facts are kept, derived values are recomputable.** Changing an algorithm means a new version and a recompute job, not data surgery.
7. Constants live in one config module (`packages/domain/src/rating/constants.ts`); SQL reads the same values from a `rating_config` seed/migration generated from it (single source, drift-tested — ADR-0004).

## 2. Verified attendance (shared prerequisite)

An event reaches **finalized** when `attendance_finalized_at` is set (organizer action or cron at `completed_at + 48h`). Only then:
- reliability events are created,
- XP is awarded,
- achievements are evaluated,
- the review window opens (72 h).

A participation is **verified present** iff `status = APPROVED ∧ attendance = PRESENT` at finalization (or resolved to PRESENT via dispute). `NOT_CONFIRMED` after finalization is neutral. `DISPUTED` is excluded until resolved.

**Organizer-player row.** When the organizer also plays, their row is PRESENT by default (self-attested). Therefore it (a) **never creates reliability signals**, (b) earns attendance XP/badge credit and review rights only if the event has ≥ 2 verified-present *non-organizer* participants, and (c) can be reviewed/review others like any present participant.

## 3. Skill rating (v1)

### 3.1 Scale and anchors
1.0–5.0 per sport. Each sport defines five anchor descriptions in `sports.skill_descriptors` (TR/EN), e.g. Football: 1 *just starting*, 2 *recreational*, 3 *comfortable in casual games*, 4 *strong club-level*, 5 *competitive/semi-pro*. Anchors reduce scale drift between raters.

### 3.2 Prior (self-assessment)
`prior` = the user's `self_assessed_level` for the sport, default `3.0` if none. Changing the self-assessment is allowed at most once per 30 days. The prior has weight `k = 2` (equivalent to two fully weighted events).

### 3.3 Reviews
After finalization, each verified-present participant may review every *other* verified-present participant of the same event within 72 h: `skill_score ∈ {1..5}` and an optional `fair_play` commendation. Negative behaviour is **not** expressed via reviews (it goes through reports) so skill reviews cannot be used for revenge.

- **Double-blind:** reviews are hidden from everyone but their author until the window closes; reviewees never see individual scores or reviewer identities, only the aggregate.
- Rating recomputation runs once, when the window closes (`close_review_windows`).

### 3.4 Formula
For reviewee *u*, sport *s*, over finalized events *e* in which *u* was reviewed by ≥ 2 distinct reviewers:

```
reviewer_weight(r,u,e) = 1 / (1 + max(0, c(r,u) − 2))          # c = # of events in the last 90 days (incl. e) where r reviewed u
o_e   = weighted mean of scores in e using reviewer_weight        # if n_e ≥ 5: drop the single highest and lowest score first
w_e   = min(n_e, 3) / 3 · 0.5^(age_days(e) / 180)                 # n_e = distinct reviewers; 180-day half-life
rating = ( k·prior + Σ w_e·o_e ) / ( k + Σ w_e )                  # k = 2
confidence = Σ w_e / ( Σ w_e + k )                                # 0 … <1
```

Rounded to one decimal for display; stored with two. Confidence bands: **LOW** < 0.40, **MEDIUM** 0.40–0.70, **HIGH** > 0.70. LOW ⇒ UI shows "provisional" and the self-assessed level is shown alongside.

Worked example (prior 3.0): one event, three reviewers all give 4 → `(6 + 1·4) / (2 + 1) = 3.33`, confidence 0.33 (LOW). Five such events, no decay → `(6 + 20) / 7 = 3.71`, confidence 0.71 (HIGH).

Properties (tested): rating ∈ [1,5]; one reviewer alone cannot move the rating; repeating the same reviewer pair beyond 2 events in 90 days has diminishing weight; trimmed mean resists a single outlier; monotonic in scores; independent of attendance count.

### 3.5 Manipulation controls
- Players cannot review themselves, non-attendees, or people at non-finalized events; duplicate reviews blocked by UQ; blocked pairs cannot review.
- Reciprocal-pair weight decay (above); a **mutual-5 ring detector** flags pairs/groups with repeated perfect mutual scores to the moderation queue (flag only — no automatic nullification).
- Reviews can be reported; admins can `HIDE` a review (excluded from recomputation, audit-logged).
- Review-bombing: a reviewer who gives ≥ 3 deviations of ≥ 2 points from the consensus across 10 reviews is flagged, not auto-penalized.

## 4. Reliability (v1)

### 4.1 Signals (one per participation, created at finalization)

| Situation | Kind | Value `v` |
|---|---|---|
| APPROVED, `PRESENT` | `ATTENDED` | 1.0 |
| APPROVED, then canceled **late** and not excused | `LATE_CANCEL` | 0.5 |
| APPROVED, `ABSENT` (not disputed or dispute resolved ABSENT) | `NO_SHOW` | 0.0 |
| Canceled early (not late) / excused (event materially changed) / `REMOVED` by organizer | none | neutral |
| Request never approved (REQUESTED, WAITLISTED, REJECTED, canceled before approval) | none | neutral |
| The organizer's own participation row | none | self-attested, excluded (§2) |
| Event `CANCELED` (by anyone) | none | neutral — **participants are never penalized for event cancellation** |
| `NOT_CONFIRMED` after finalization | none | neutral |
| `DISPUTED` | pending | excluded until resolved |

**Late cancellation** = canceled after `starts_at − min(12 h, ½ · (starts_at − approved_at))`. The "½ of the time since approval" clause means someone approved 3 hours before a game is not late-canceling 2 hours before it only because of the fixed 12-hour rule; the window never exceeds 12 h. **Excused** = canceled within 24 h after a material change of time/place.

### 4.2 Formula
```
w_i = 0.5^(age_days(i) / 180)
score = ( A·p0 + Σ w_i·v_i ) / ( A + Σ w_i )         # A = 3, p0 = 0.90   (shown as 0–100 %)
confidence = Σ w_i / ( Σ w_i + A )                     # same bands as skill
```
Display: with fewer than **3 counted signals** show "New player / Yeni oyuncu" instead of a percentage. Examples (no decay): 10 attended → 97.7 %; 9 attended + 1 no-show → 90.0 %; 2 attended + 1 no-show → 78.3 %; 3 no-shows → 45.0 %.

### 4.3 Disputes and corrections
A participant marked `ABSENT` may dispute within 72 h after finalization. An admin resolves to `PRESENT` or `ABSENT`; the system voids the old `reliability_events` row (`voided_at`) and creates the correct one, and posts compensating XP rows if needed. Repeated false-ABSENT marking by one organizer is surfaced to moderation.

### 4.4 Moderation hooks (not automatic penalties)
≥ 3 `NO_SHOW` in 30 days → admin flag. A separate "restricted from requesting" sanction is a post-MVP, human-decided action.

## 5. XP and levels (rules v1)

### 5.1 Ledger
`xp_transactions` is append-only, immutable, deduplicated by `dedupe_key`. XP is awarded **only** in the finalization (or review-window-close) transaction; the `dedupe_key` encodes the action so retries and double-clicks are no-ops. Corrections are compensating negative rows. `user_progress.xp_total = SUM(amount)` is a cache that can be rebuilt.

### 5.2 Rules

| Reason code | XP | Condition | `dedupe_key` |
|---|---|---|---|
| `ATTENDED_EVENT` | +50 | verified present at a finalized event with ≥ 2 verified-present participants (for the organizer's own row: ≥ 2 verified-present *non-organizer* participants, §2) | `attend:{event}:{user}` |
| `ORGANIZED_EVENT` | +40 | organizer of a finalized event with ≥ 2 verified-present **non-organizer** participants | `organize:{event}` |
| `FIRST_IN_SPORT` | +30 | first verified attendance in a sport | `first_sport:{user}:{sport}` |
| `REVIEWS_SUBMITTED` | +10 | submitted ≥ 1 review for the event (once per event; independent of score) | `reviews:{event}:{user}` |
| `FAIR_PLAY_RECEIVED` | +10 | ≥ 2 distinct reviewers gave `fair_play` for the event (at window close) | `fairplay:{event}:{user}` |
| `ACHIEVEMENT_BONUS` | per definition | achievement awarded | `ach:{code}:{user}:{sport?}` |

**Anti-farming caps (per user, Istanbul calendar):** attendance XP from at most **2 events per day** and **6 per week**; organizer XP from at most 2 events per day. Events beyond the cap still count for reliability, reviews and achievements but give no XP. Events must be published ≥ 60 min before start, attendance cannot be marked before start, and a new account (< 24 h) earns no organizer XP.

### 5.3 Level formula (single definition, in `packages/domain`)
```
xp_required(L) = 50 · L · (L − 1)         # L1 = 0, L2 = 100, L3 = 300, L4 = 600, L5 = 1000, L10 = 4500
level(xp)      = floor( (1 + sqrt(1 + xp / 12.5)) / 2 )
```
(equivalent to `floor((1+√(1+8·xp/100))/2)`; level is derived at read time from `xp_total`, never stored as truth, so retuning the curve does not need data migration). At 50 XP/game this is ≈ 2 games to L2, ≈ 20 to L5, ≈ 90 to L10.

## 6. Badges (v1)

Definitions live in `achievement_definitions` (`rule` JSON evaluated by a SQL function at finalization; each rule has a unit test with positive and negative fixtures). Awards are idempotent via UQ; revocation only by moderation (`revoked_at`).

| Code | Scope | Unlock condition | Bonus XP |
|---|---|---|---|
| `FIRST_MATCH` | global | ≥ 1 verified attendance | 50 |
| `TEN_GAMES` | global | ≥ 10 verified attendances | 100 |
| `SPORT_REGULAR` ("Football Regular", "Volleyball Enthusiast", … title template per sport) | per sport | ≥ 10 verified attendances in that sport | 75 |
| `MULTI_SPORT` | global | verified attendance in ≥ 3 distinct sports | 75 |
| `RELIABLE_PLAYER` | global | reliability ≥ 90 %, confidence HIGH, ≥ 10 counted signals, no `NO_SHOW` in the last 60 days | 100 |
| `COMMUNITY_ORGANIZER` | global | ≥ 5 finalized events organized, each with ≥ 3 verified-present non-organizer participants | 100 |
| `FAIR_PLAY` | global | `fair_play` from ≥ 5 distinct reviewers across ≥ 3 events | 75 |

Display of badges respects `show_badges`.

## 7. Independence (verified by tests)

| Test | Expectation |
|---|---|
| 50 attended events, zero reviews | skill = prior (unchanged); XP and reliability rise |
| Perfect reviews, zero attendance rows | impossible (reviews require presence) |
| XP spent/corrected | skill and reliability unchanged |
| No-show | reliability drops; skill unchanged; no XP |
| Re-running finalization | no new XP rows, no new reliability rows |

## 8. Versioning and recomputation

- `algorithm_version` is stored on `user_sport_ratings` and `user_progress`; XP rows store `rule_version`.
- A new version ships as: constants change + migration bumping the version + a recompute job over raw rows (reviews, reliability events). Old XP rows are never rewritten; rule changes apply forward (or via explicit compensating rows decided by the owner).
- Implementation: authoritative SQL functions, with a pure-TS reference implementation and golden-vector tests; an integration test compares SQL output to the TS reference on randomized fixtures (ADR-0004).

## 9. Known limitations and ethics

- **Organizer-attested attendance** is the trust root. A colluding or careless organizer can fabricate or omit attendance; caps, distinct-participant requirements, moderation flags and (post-MVP) QR/geo check-ins mitigate but do not eliminate this.
- If an organizer never finalizes, nobody gets credit for that event (neutral). Reminders go to organizers; a participant self-claim flow is deferred.
- Small communities mean few distinct reviewers; confidence labeling is intentionally conservative.
- Skill labels are social signals; copy must say "Bu seviye, oyuncu geri bildirimlerine dayanır" (based on player feedback) and never imply measured performance.
- Reliability penalties can feel harsh in early life; the prior (A = 3, p0 = 0.9) and the "New player" state soften first impressions. Parameters are tuned after pilot data.
- Rating/reliability visibility is user-controllable (`show_reliability`), but organizers evaluating a join request always see the game-relevant subset (disclosed at request time).
- KVKK: scores are personal data (right of access/erasure applies); profiling/automated-decision implications of reliability need legal review (SECURITY §8).

## 10. Decisions made while building M3a (2026-10-31)

Where the text above left room, the code does this (the TypeScript reference and the SQL agree; `packages/db-tests` compares them on random input):

1. **Thresholds count verified-present participants besides the organizer.** §5.2 says "≥ 2 verified-present participants"; the organizer's own row is self-attested, so it never counts toward a threshold. One organizer plus one friend pays nobody.
2. **Caps apply to `ATTENDED_EVENT` (2 a day, 6 a week) and `ORGANIZED_EVENT` (2 a day).** `FIRST_IN_SPORT` is paid once per sport and is not capped. The Istanbul calendar is a fixed UTC+3 (no daylight saving since 2016), weeks run Monday to Sunday, and the day of an event is the day it starts.
3. **A new account (< 24 h at finalization) earns no `ORGANIZED_EVENT` XP, but still earns attendance XP** if it plays.
4. **Signals are dated by the event's start** (`occurred_at`), and age is measured from it to the moment of computing. The cached `user_progress` is recomputed when something changes (finalization, a dispute); decay therefore shows from the next recompute, and the exact value is always derivable from `reliability_events`.
5. **A dispute removes the signal until it is resolved** (the old row is voided with reason `DISPUTED`), then the resolution creates the correct one; the first resolution to `PRESENT` also pays the attendance XP the player never received.
6. **Account purge keeps the ledger and the signals, linked to the anonymous tombstone** (no free text, no identifier left); the user's own are in the export. Counsel to confirm (SECURITY §8).
7. **Per-user advisory lock** around every XP decision, taken in user-id order, so two events finalized at once for the same player cannot both pass a cap.

## 11. Decisions made while building M3b (2026-10-31)

1. **Only reviews of closed windows and `ACTIVE` status enter the formula**, both the scores and the pair count `c`. An open window stays double-blind and cannot influence anything. Closed events are recorded in `private.closed_review_windows`, because finalized events are frozen (I-7).
2. **The 90 days of `c(r,u)` end at the event's start** (`e' ∈ (starts_at(e) − 90 d, starts_at(e)]`), so an event's reviewer weights do not change with time, and they **count across sports** as the formula has no sport in `c`. Only reviews in the sport being rated enter `o_e`.
3. **Trimming with equal scores** drops the lowest reviewer id among the lowest scores and the highest among the highest, so the result is deterministic. `n_e` in `w_e` is the count before trimming.
4. **The age of an event is measured from its start**, like reliability signals. The stored snapshot decays from its next recompute; the exact value is always derivable from the reviews. A changed self-assessment also takes effect at the next recompute.
5. **No row means no counted event** and the self-assessment stands. A lone reviewer therefore leaves no trace that the user could read. A recompute that finds nothing to count removes the row.
6. **Stored with two decimals** (`numeric(3,2)`), as §3.4 says.
7. **`REVIEWS_SUBMITTED` and `FAIR_PLAY_RECEIVED` are not capped** (§5.2 caps attendance and organizer XP) and count `ACTIVE` reviews only.
8. **Account purge deletes the snapshot**; it is derived and useless without the account. Reviews of a deleted account keep counting for the others (anonymous, §10.6). The tombstone earns nothing and gets no rating.
9. **Other people cannot read a rating yet**: `user_sport_ratings` is select-own, like `user_progress`. Showing it on a profile (visibility flags, DATABASE RLS table) comes with the screens milestone, through an RPC.
10. **Not built yet:** the mutual-5 and review-bombing flags and hiding a review from a screen (§3.5, moderation queue, Phase 6). Recompute already skips `HIDDEN` reviews.
