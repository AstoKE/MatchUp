# MatchUp Visual Identity — `design.md`

Status: **v0.2: v0.1 authored in Phase 2 preparation (2026-10-25), direction A added 2026-10-30 (§0).** This is the visual source of truth that `UI_DESIGN_SYSTEM.md` §0 said would arrive. It supersedes the provisional values in that document **where they differ**; accessibility minimums (UI_DESIGN_SYSTEM §8) still outrank taste. The product name and logo remain provisional (ADR-0010); nothing here depends on either.

Process note: this file was written by the engineering assistant at the founder's request, as an *original* specification. It has not been reviewed by a professional brand designer. Treat it as a strong, buildable draft, and expect refinement once real screens and photography exist.

## 0. Direction A, "Gece Maçı" (founder's choice, 2026-10-30): supersedes where it differs

The founder picked one of three drawn directions (A "Gece Maçı", B "Mahalle Maçı", C "Net Sayfa"; the drawings are a private canvas, not in the repo). **Where this section differs from §4.1, §5 and §6, this section wins**; §1 to §3 and §7 to §13 stay as written (personality, voice, logo rules, accessibility, microcopy). The founder drew only the dark theme and two screens (Discover, event page). The **light theme is derived**, not drawn, and needs the founder's review.

- **Character:** dark near-black ground, one vivid lime accent, strong condensed headlines, round shapes.
- **Color (implemented in `apps/app/src/ui/tokens`; contrast enforced by `tokens.test.ts`):**

| Role | Dark (as drawn) | Light (derived) |
|---|---|---|
| App ground | `#0E1116` | `#F4F6F8` |
| Raised surface (cards) | `#171C23` | `#FFFFFF` |
| Sunken surface | `#0A0D12` | `#E9EDF2` |
| Primary / secondary text | `#F2F5F7` / `#A9B4C0` | `#0E1116` / `#4A5565` |
| Primary action | lime `#C6F432`, label `#0E1116` | ink `#0E1116`, label lime `#C6F432` |
| Link | lime `#C6F432` | olive `#3F6B00` |
| Warning (full, waitlist) | `#FFB454` | `#8A4B00` |
| Danger / success | `#FF8A80` / `#6EE7A8` | `#B42318` / `#067647` |
| Subtle border | `#222B38` | `#D5DCE4` |

  Lime is never text or a fill on a light ground. Measured (dark): text 15.6:1 on cards, secondary 8.1:1, lime on ground 14.8:1; (light) link 6.3:1, secondary 7.6:1. The pitch-green primary of §4.1 is retired; the other rules of §4.2 (one loud color per screen, never color alone, ember/warning for time pressure) still apply with lime as the loud color.
- **Shape (replaces the §6 radius list):** `sm 6 · md 10 · lg 20 · xl 28 · pill`; buttons are pills (minimum height 48), cards 20, chips pills, meters 6 px with a round end.
- **Type (replaces §5's heading family; not implemented yet):** **Barlow Condensed** 600/700 for headlines and numbers (times, spot counts), **Inter** 400/500/600 for body and controls. Same release gate as §5 (Turkish glyph coverage, no `text-transform` for case changes), same two-family limit. Until added (a new dependency, justified and pinned with `expo install`), the app uses the system font.
- **Screens as drawn (not yet applied):** Discover with a large title, filter button, sport chips, day headings, cards with a large time, title, place, spot meter and label; the event page with a time block and a spots block, the organizer, the roster and a pinned lime action; the tab bar with the Create tab as a round lime button.
- **Logo:** not in the Discover header or on the account screens any more (founder's request 2026-10-30, consistent with §3); the new mark is the app and web icon only.
- **Applied so far:** color tokens (both themes), the radius scale, pill buttons, the Discover header without the logo. **Not yet:** fonts, card and event page layouts, tab bar details, sport tints (§4.2 item 6, a separate review), a dark/light preference setting (the app follows the system).

### Founder's notes for the general design pass (2026-10-31, not applied yet)

From testing the Phase 5 screens. Apply them when the general design pass starts; the behaviour is already correct.

- **Badges are round icons**, not the text cards the profile shows today.
- **XP and level are a progress bar**, as in games: current level, filled share toward the next level. Today it is text only. Keep the numbers available to screen readers.
- **Negative states stand out**, with a warning icon or a red or orange color: an expired window (reviews, disputes), being marked absent, and similar. Today they are plain text. Use the `danger` and `warning` tokens; never color alone (§ accessibility minimums): the text or icon must say it too. This does not change the rule that a neutral state (not marked, under review) is not presented as a penalty.

## 1. What we take from GoodRec — and what we do not

GoodRec (public marketing pages, reviewed 2026-10-24; app not seen) is our **usability benchmark**: a player can answer, within a second of seeing a game, *what / when / where / how many spots / can I trust it?* — and has one obvious action.

| We adopt the *principle* | We do **not** copy |
|---|---|
| Glanceable game card: sport + format, time, place, spots left | Any GoodRec color, typeface, layout, icon, illustration, photography, screenshots or copy |
| One dominant action per screen (request / manage) | Their card/page composition or navigation arrangement |
| Cancellation rules visible *before* committing | Their wording or policy structure |
| Honest availability ("spots left" is shown, never implied) | A platform-managed/paid model (ours is community-led, no payments in MVP) |

Everything below was designed from MatchUp's own requirements. Originality guardrail for reviews: if a design choice can be traced to a specific competitor asset, it is rejected.

## 2. Personality

**Energetic · fair · local · welcoming · trustworthy.** A neighbourhood pitch at 19:00 on a weeknight, not a stadium broadcast. Confident but never aggressive; competitive spirit with fair-play values (our reputation system is a design theme, not an add-on).

Voice (Turkish first): second person informal ("sen"), short, concrete, warm. *"Bir yer açıldı — katılmak ister misin?"*, not *"Katılım talebinizin değerlendirilmesi beklenmektedir."* Never shame ("Güvenilirlik puanın düştü" is stated factually with a way forward).

## 3. Logo and brand assets

- **Update 2026-10-30:** the founder supplied a new mark (`apps/app/assets/brand/logo-v2-1254.png`: three figures around a tennis ball, lime and navy, transparent background). It is used **only** as the app icon (iOS, Android adaptive and themed, splash asset) and the web favicon, on the light ground `#F4F6F8` because its navy shapes vanish on a dark ground; it is **not shown inside the app**. The icons are generated by `scripts/brand/make-app-icons.py`. It is still a raster, so the SVG master and one-color requirements below stand. The older mark described next is retired:
- The earlier mark (`image.png`: three abstract figures forming a circle, orange / green / blue) stays **provisional**. This system is deliberately **independent** of its colors, so adopting, changing or replacing it requires no palette change.
- Requirements for a final mark: SVG master (single-path, no embedded raster), **transparent** background, a one-color version (for dark UI and tiny sizes), safe-area rules for Android adaptive icons (66 % safe zone) and iOS, readable at 16 px, license/ownership documented. Wordmark TBD with the final name.
- Where the logo may appear: auth screens, empty states, app icon/splash. **Not** in the event card or tab bar.

## 4. Color

Design intent: a deep **ink** base, a fresh **pitch green** for primary actions, a **volt lime** highlight that says "game on", and a warm **ember** for urgency. Neutrals are cool and slightly blue so green and lime read clean. All values below are tokens (§12); contrast figures are computed (WCAG 2.x relative luminance).

### 4.1 Core ramps

| Role | Token | Light | Dark | Notes |
|---|---|---|---|---|
| Ink (text, structure) | `ink.900` | `#0E1A2B` | `#F2F5F9` (as text) | 16.5:1 on app bg (light) |
| Pitch (primary) | `pitch.700` / `pitch.400` / `pitch.300` | `#0A6B4E` | `#4FD1A0` fills, `#7BE0B5` text | white-on-fill 6.5:1; dark ink-on-fill 9.8:1 |
| Volt (highlight) | `volt.400` | `#C8F135` | `#C8F135` | **only with `ink.900` text/icon on it (13.4:1)**; never as text color on light surfaces |
| Ember (urgency/secondary) | `ember.700` / `ember.300` | `#B54708` | `#FDB022` | text on white 5.4:1; white on fill 5.4:1; dark: 10.2:1 |
| Info / focus | `blue.700` / `blue.300` | `#1D4ED8` | `#93B4FF` | 6.7:1 / 9.1:1 |
| Danger | `red.700` / `red.300` | `#B42318` | `#FF8A80` | 6.6:1 / 8.2:1 |
| Success | `green.700` / `green.300` | `#067647` | `#6EE7A8` | 5.7:1 / 12.2:1 |
| Surfaces | `bg` / `surface` / `sunken` | `#F7F8FA` / `#FFFFFF` / `#F2F5F9` | `#0B1220` / `#141D2E` / `#0F182A` | |
| Borders | `border.subtle` / `border.strong` | `#E4E7EC` / `#8793A4` | `#243049` / `#5B6B82` | `border.strong` ≥ 3:1 on surface (3.1:1) |

### 4.2 Usage rules

1. **One loud color per screen.** The primary action is pitch green. Volt marks *state* (live/just-opened/selected sport chip), ember marks *time pressure* (starting soon, last spot), never decoration.
2. **Color never carries meaning alone** — status = color + icon + word. Slot meters always print numbers ("8/14 · 6 yer").
3. **Capacity meter:** fill `pitch.700`/`pitch.400`; the empty track is *not* the meaningful part (the number is), but it must still be perceivable: draw it as a 1 px `border.strong` outline with `sunken` fill (the lighter `#A9B4C4` track measured only 2.1:1 and is **rejected**).
4. **Last spot / starts < 2 h:** ember pill with clock/alert icon + text. Full: neutral "Dolu" pill (not red — full is a success state for organizers).
5. **Dark mode** is a first-class theme, not an inversion: surfaces get lighter with elevation; green and lime keep their meaning.
6. **Sport tints** (decorative only, always paired with the sport icon and name): football `#2E9E5B`, futsal `#1FA38A`, basketball `#E0701F`, volleyball `#D9A400`, tennis `#9AB800`, padel `#2A8FD6`, badminton `#6B5BD6`, table tennis `#D6457A`, running `#C2410C`, walking `#5B6B82`. Use at 12–16 % opacity as chip backgrounds; text stays `ink`.

## 5. Typography

| Use | Family | Weights | Why |
|---|---|---|---|
| Display / headings / big numerals | **Plus Jakarta Sans** (OFL) | 700, 800 | Geometric, athletic, friendly; strong numerals for times and slot counts |
| Body / UI | **Inter** (OFL), variable | 400, 500, 600 | Exceptional small-size legibility; full Turkish coverage |
| Numerals in meters/times | either, `tabular-nums` | | Counts and clocks must not jitter |

Rules: **Turkish glyph coverage is a release gate** — render `İ ı Ş ş Ğ ğ Ç ç Ö ö Ü ü` (and `İSTANBUL`/`ıspanak` casing via `tr` locale) in a visual test before adopting any font. Self-host subsetted WOFF2 (Latin + Latin-Extended-A only, ≈ 25–40 kB per weight) loaded with `expo-font`; system font is the fallback and the default until fonts are added (see PERF plan, `docs/PERFORMANCE.md`). No more than two families, no italics for UI text.

Scale (sp/line-height): display 36/42, headline 28/34, title 22/28, title-sm 18/26, body 16/24, body-sm 14/20, label 14/20 (600), caption 12/16. Never below 12. Text scales with OS settings up to 1.6× on native, 200 % zoom on web, with wrapping (no truncation of essential content such as time and place).

## 6. Shape, depth, spacing, motion

- **Radius:** `sm 6 · md 10 · lg 16 · xl 24 · pill`. Cards `lg`; buttons `md`; chips/pills `pill`; sheets `xl` top corners. The "pitch corner" motif: event cards have one asymmetric `xl` corner on the top-left, echoing a court corner arc — used **only** on event cards so it stays distinctive.
- **Spacing:** 4-pt grid (`2 4 8 12 16 20 24 32 40 56 72`); gutters 16/24/32 by breakpoint; touch targets ≥ 48.
- **Elevation:** light — 1 px `border.subtle` + very soft shadow on cards, stronger on sheets/menus; dark — elevation by surface lightness + border, no shadows.
- **Motion:** 120–240 ms ease-out; sheets 300 ms. Meaningful motion only: a joined spot "fills" in the meter; a freed spot pulses once. **Reduced motion** replaces movement with fades and disables the pulse. No auto-playing animation loops except skeletons (which also stop under reduced motion).
- **Haptics (native):** light tap on primary success (request sent), warning on destructive confirm; never on scroll or hover.

## 7. Iconography and imagery

- **Icons:** one outline family, 24 px grid, 1.75 px stroke, rounded joins. Use **inline SVG for only the icons we ship** (≈ 40 in MVP) rather than a full icon-font package — see PERFORMANCE.md (the icon font is a measurable cost). Sport icons: custom, simple, consistent silhouette (ball + one distinguishing mark), designed in-house or commissioned; no stock sport-icon packs without license review.
- **Pattern language ("court lines"):** subtle line patterns (center circle, halfway line, three-point arc) at 4–6 % opacity on empty states and onboarding backgrounds. Purely geometric → no licensing risk and no resemblance to any competitor.
- **Photography (later):** real local players and venues, licensed or founder-owned, adults only, diverse in age/gender/ability, never staged "stock" handshakes; every photo needs written consent. No photos of minors. Images are decorative-by-default with alt text only when informative.
- **Illustration:** none in MVP beyond court-line patterns.

## 8. Layout and navigation

- Mobile first: bottom bar < 768 px; **left rail 184 px at 768–1199**, **248 px ≥ 1200** (verified in Phase 1); content max-width 720/960/1200. Discover is list + detail two-pane on wide screens.
- Navigation is data-driven (`src/navigation/config.ts`); Create is visually emphasized (filled pitch icon), not floating over content. Community slot reserved.
- Page anatomy: one `h1`, primary action in the thumb zone on mobile (sticky bottom action bar on event detail), secondary actions in a menu. Headers stay quiet; the content is the star.

## 9. Components — design specifications

Each component ships with states: default, hover (web), focus-visible (2 px `focus` ring, 2 px offset), pressed, disabled (never conveyed by opacity alone), loading, error. Minimum target 48 px.

**Event card (the hero component)** — anatomy top→bottom:
1. Sport chip (icon + name, sport tint) · format ("7v7") · distance if known.
2. **Title** (title-sm, max 2 lines).
3. **When/where line:** "Per 19:30 · Çankaya, Kuğulu Park" — time in `tabular-nums`; relative hint ("bugün", "yarın") before the exact time.
4. **Capacity block:** meter + "8/14 · 6 yer" (+ ember pill "Son yer!" when ≤ 1, or "2 saat içinde başlıyor").
5. **Meta row:** skill range ("Seviye 2.5–4"), cost note if any ("Ücret: ~150 ₺ · bilgilendirme"), booking label ("Saha rezervasyonu organizatör tarafından beyan edilmiştir" — shortened on card, full on detail).
6. Organizer micro-line: name + at most two trust chips (only what their privacy settings allow).
The whole card is one link/target; no nested buttons.

**Primary action (event detail):** "Katılma isteği gönder" (pitch fill). States change the *label and meaning*, not just color: "İstek gönderildi" (secondary, with "Geri çek"), "Bekleme listesindesin", "Onaylandın ✓", "Etkinlik dolu — bekleme listesine katıl".

**Trust indicators (progression):** *Skill* shows value + confidence ("3.7 · geçici" when low confidence, with the self-assessed level beside it); *Reliability* shows "%94 · yüksek güven" or "Yeni oyuncu"; *Level/XP* is a quiet progress ring in profile — never in feed cards. Badges are 40 px medallions with text labels; locked badges show their unlock rule, not a sad icon.

**Forms:** visible labels, helper text under the field, inline errors tied to the field (role=alert), sticky primary action on long forms (event creation stepper), autofill attributes correct, date/time with typed alternative.

**Feedback:** toasts bottom-center (mobile) / bottom-left (wide), 5 s (errors 10 s), always dismissible; banners for persistent states (offline, unverified email); skeletons for lists, never full-screen spinners except auth callbacks.

**Empty states:** court-line pattern + one sentence + one action ("Henüz etkinlik yok — ilk etkinliği sen oluştur"). Never blame the user.

**Safety surfaces** (report, block, location privacy): calm neutral styling, plain language, no alarming red except destructive confirmation.

## 10. Accessibility (design-level commitments)

WCAG 2.2 AA; contrast tokens enforced by test (`requiredContrast`); focus never removed; all status has text; motion respects reduce-motion; dynamic type to 1.6×; touch targets 48 px; screen-reader order matches visual; Turkish pronunciation checked with TalkBack/VoiceOver (dotted/dotless I); no color-only encodings; captions for any future video. Dark mode must pass the same tests as light.

## 11. Content patterns (Turkish microcopy)

| Situation | Copy |
|---|---|
| Request sent | "İstek gönderildi. Organizatör onaylayınca haber vereceğiz." |
| Full | "Etkinlik dolu. Bekleme listesine katılırsan yer açıldığında organizatöre haber veririz." |
| Late cancel warning | "Başlangıca az kaldı; şimdi iptal edersen güvenilirlik puanın etkilenebilir." |
| Booking label | "Rezervasyon durumu organizatör tarafından beyan edilmiştir; MatchUp doğrulamaz." *(name from brand config)* |
| Cost | "Ücret bilgisi bilgilendirme amaçlıdır; ödeme uygulama dışında yapılır." |
| Skill disclaimer | "Bu seviye, oyuncu geri bildirimlerine dayanır." |
| Error generic | "Bir şeyler ters gitti. Tekrar dener misin?" |

Rules: no exclamation-mark inflation, no emoji in system messages (allowed in user content), plurals via ICU, no concatenated sentences, brand name only via `{{appName}}` without Turkish suffixes.

## 12. Token mapping (engineering contract)

| Design token | Code (`apps/app/src/ui/tokens`) | Status |
|---|---|---|
| ink / pitch / volt / blue / red / success / surfaces / borders | `primitives.ts` → `semantic.ts` | implemented (Phase 1) |
| `ember.700/300` → `warning` + `urgency` semantic | `semantic.ts` | added in Phase 2 (this change: `urgency`, `onUrgency`) |
| Plus Jakarta Sans / Inter | `expo-font` + theme `fontFamily` | **not yet loaded** (needs Turkish glyph visual test + bundle measurement) |
| Sport tints | `sportTints` map keyed by `sports.slug` | **not yet implemented** (Phase 3) |
| SVG icon subset | `src/ui/graphics/Icon.tsx` (`react-native-svg`) | **started**: 4 tab icons (compass, calendar, add-circle, person), outline + filled; more icons are added there as screens need them |
| Court-line pattern | `src/ui/graphics` | **not yet implemented** |

**Acceptance gate for any visual change:** `pnpm test` (contrast pairs in both themes) green · Playwright axe clean · screenshot review at 390/800/1280 in light and dark · Turkish glyph check · bundle ratchet not increased without a recorded reason.

## 13. Open design questions

1. Final name/logo → wordmark and icon reconsideration (does the three-figure circle suit a sports app, or does it read "community/charity"?).
2. Whether to commission custom sport icons now or after the pilot (recommended: after the first 3 sports are confirmed).
3. Photography plan and consent workflow for pilot marketing.
4. Native large-title navigation headers (iOS) vs the quiet header above.
5. A professional design review of this spec — recommended before the pilot, since this was authored by an engineer.
