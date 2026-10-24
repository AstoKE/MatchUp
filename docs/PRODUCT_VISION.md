# Product Vision

Status: Phase 0 draft · Working name: MatchUp (temporary — see ADR-0010)

## 1. Vision

MatchUp connects people who want to play sports together. Anyone can create a local activity, anyone can ask to join it, and every participant builds a reputation that other players can trust.

**Tagline.** EN: *Choose your sport. Find your team. Join the game.* TR: *Sporunu seç, takımını bul, oyuna katıl.*

## 2. Problem

In Turkish cities, organizing a game is done in WhatsApp groups and Instagram stories:

- Newcomers and people without a team cannot find games.
- Organizers chase confirmations by message, and last-minute dropouts break games.
- There is no reliable signal for "is this person a good teammate, and will they show up?"
- Skill mismatches make games unpleasant, so people stop playing.

## 3. Target users (initial)

Adults (18+) in **Ankara** who play or want to play team and racket sports casually. Turkish-speaking first.

| Persona | Need |
|---|---|
| **Newcomer Nil** — moved to Ankara, wants to play volleyball, knows nobody | Find an open game at her level, join with minimal friction |
| **Organizer Okan** — runs a weekly 7v7 football game, always 2 short | Fill missing spots with reliable players, stop chasing in WhatsApp |
| **Regular Reha** — plays 3 sports | Discover games near home, see his progress and reputation |
| **Padel Pelin** — needs a 4th for doubles | Find a compatible-level partner quickly |

## 4. Product principles

1. **Fast to a game.** Discover → request → approved in as few steps as possible.
2. **Organizers stay in control.** Every participation requires organizer approval; no auto-joins.
3. **Honest about what we don't know.** A venue listing never implies a booking. A skill rating is peer opinion, not an objective measurement. Low-sample scores are labeled as provisional.
4. **Trust is earned from verified activity.** Progress (XP, reliability, skill) derives from attendance that the organizer confirmed — never from self-reported claims.
5. **Safe by default.** Meeting strangers for physical activity carries real risk: reporting, blocking, privacy defaults and moderation are core, not extras.
6. **Original identity.** Inspired by GoodRec's simplicity, not its look.

## 5. Differentiation

| | Managed pickup platforms (e.g. GoodRec) | MatchUp |
|---|---|---|
| Who creates games | The platform / vetted hosts and partners | **Any eligible user** (community events), later verified partners |
| Booking & payment | Platform books venues and takes payment | **Out of scope for MVP**; organizers book externally, MatchUp coordinates people |
| Sports | A few core sports | **Database-driven catalog**; new sports and formats without schema change |
| Progression | Not described on public pages | **Three independent dimensions**: sport-specific skill, reliability, XP/badges |

## 6. GoodRec research notes

Method: read the two reference sites on 2026-10-24 (public marketing pages only; no app access, no authenticated pages).

**Stated on https://www.goodrec.com/** — pickup games for soccer, basketball and volleyball; players browse by city and sport, see day/time/location/format/indoor-outdoor/spots left; players pay to reserve a spot; friends must each book their own spot; 18+; in-app cancellation with the window shown per game and spot returned as game credit; GoodRec says it finds replacements; GoodRec books venues and provides equipment, hosts sort teams on arrival; claims 1M+ players, 100k+ games, 50+ cities (US/Canada, plus Ireland).

**Stated on https://partner.goodrec.tech/** — organizers set time/place/price/format, book a venue, create the game in a dashboard and submit it for review; facilities list open slots and price; players book and pay in-app; automatic payouts; GoodRec keeps a share of paid bookings; organizers track bookings, fill rates and player feedback.

**Not stated on the public pages (do not assume):** a formal player reputation system, attendance verification details, notification behavior, the content of the partner FAQ answers.

**Research limitations.** Marketing claims are unverified self-reports. The brief lists reputation, attendance verification and reminders as GoodRec concepts; the public pages do not confirm them. MatchUp's designs for those areas are therefore derived from this product's own requirements, not from observed GoodRec behavior. A hands-on review of the GoodRec app (with the founder's own account) would close this gap and is recommended before finalizing UX details in Phase 2–3.

**Takeaways adopted:** show format + spots left + time + place at a glance; visible cancellation rules; separate partner (commercial) flow from player flow; review step before commercial listings go live; organizer-facing fill-rate analytics (later).
**Deliberately not adopted:** platform-managed venue booking, mandatory pre-payment, credit system (all post-MVP at earliest).

## 7. Business model (future, not MVP)

Free for players at launch. Potential later: venue booking commissions, facility partnerships, clearly labeled sponsored placements, premium organizer tools, business subscriptions, tournament services. MVP builds only the seams (see ARCHITECTURE §10), no billing, ads or payments.

## 8. Success metrics (pilot, Ankara)

Targets are hypotheses to calibrate after the pilot, not commitments.

| Metric | Why |
|---|---|
| Onboarding completion rate | Funnel health |
| Events created per week; % reaching ≥1 approved participant | Supply quality |
| Join-request → approval conversion; median time-to-decision | Marketplace liquidity |
| Event fill rate | Core outcome |
| Show-up rate (PRESENT / approved at completion) | Reliability of the community |
| Week-4 repeat participation | Retention |
| Reports per 100 events; median time to resolve | Safety health |

See ARCHITECTURE §9 for event naming and privacy rules.

## 9. Non-goals (MVP)

Payments, in-app venue booking, chat, friends graph, tournaments, push notifications, recommendations, advertising, minors (<18), cities other than Ankara.
