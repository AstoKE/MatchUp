# UI Design System

> **`docs/design.md` is the source of truth for visual identity**, now Theme E (ADR-0023). This file holds the engineering contract: token architecture, components, accessibility. Its color values, type scale and navigation below are **older than Theme E**: where they differ, `design.md` wins, and M1 to M3 of `docs/THEME_E_PLAN.md` change the code to match.
>
> Precedence if documents disagree: accessibility minimums in §8 > `design.md` > this file's visual defaults.

Related: [USER_FLOWS](USER_FLOWS.md) · [ARCHITECTURE §4](ARCHITECTURE.md)

## 1. Direction

Modern, energetic, clean, friendly, sport-oriented, highly readable, professional (not childish). Original identity — no GoodRec layouts, illustrations or copy. Photography/illustration direction, logo and mascot decisions wait for `design.md`.

## 2. Token architecture

Three layers, implemented in `apps/app/src/ui/tokens` and consumed through `useTheme()`:
1. **Primitive** (raw palette, scale steps) — never used by components directly.
2. **Semantic** (`color.text.primary`, `color.surface.raised`, `color.action.primary`, `color.border.subtle`, `color.status.danger`, …) — what components use.
3. **Component** (optional, e.g. `button.height.md`) — only when a component needs its own deviation.

Themes: `light` and `dark` are two semantic maps over the same primitives; the user setting is `system | light | dark` (stored in `user_settings.theme`; default system). Components never branch on theme name. Branding seed values (primary hue, logo, name) come from `packages/config` so a rename/rebrand touches one place.

## 3. Color (default palette — to be replaced/confirmed by design.md)

Contrast ratios computed with the WCAG formula on 2026-10-24.

| Semantic token | Light | Dark | Contrast / use |
|---|---|---|---|
| `bg.app` | `#F7F8FA` | `#0B1220` | page background |
| `surface.raised` | `#FFFFFF` | `#141D2E` | cards, sheets |
| `text.primary` | `#0E1A2B` | `#F2F5F9` | 16.5:1 on bg · 17.1:1 dark |
| `text.secondary` | `#475467` | `#A9B4C4` | 7.2:1 · 8.9:1 |
| `action.primary` (fill) | `#0A6B4E` | `#4FD1A0` | white-on-fill 6.5:1 · dark-ink-on-fill 9.8:1 |
| `action.primary.text` (links/outline) | `#0A6B4E` | `#7BE0B5` | 6.5:1 on white · 11.7:1 on dark bg |
| `accent.highlight` | `#C8F135` (lime) | `#C8F135` | **only** with `#0E1A2B` text (13.4:1); never as text on light surfaces |
| `status.danger` | `#B42318` | `#FF8A80` | 6.6:1 · 8.2:1 |
| `status.warning` | `#8A4B00` | `#FFC266` | 6.8:1 · 11.7:1 |
| `status.success` | `#067647` | `#6EE7A8` | 5.7:1 · 12.2:1 |
| `border.strong` (inputs, controls) | `#8793A4` | `#5B6B82` | ≥ 3:1 for UI boundaries (3.1:1 both) |
| `focus.ring` | `#1D4ED8` | `#93B4FF` | 6.7:1 · 9.1:1; 2 px + 2 px offset |

Rules: information is never conveyed by color alone (icon + label for status, slot bars have numeric text). Sport colors, if any, are decorative tints with icons, never the sole identifier.

## 4. Typography

- Family: a humanist sans with full **Turkish glyph support (İ ı Ş ş Ğ ğ Ç ç Ö ö Ü ü)** — to be confirmed by design.md; system font stack as fallback. Test dotted/dotless I rendering and uppercase transforms (`"ı".toUpperCase()` must use the `tr` locale; avoid CSS/`textTransform: uppercase` on Turkish strings without locale handling).
- Scale (sp / px, line-height): `caption 12/16`, `body-sm 14/20`, `body 16/24`, `title-sm 18/26`, `title 22/28`, `headline 28/34`, `display 36/42`. Weights: 400, 500, 600, 700.
- Dynamic type: all text scales with the OS font setting up to 200 % on web zoom and ~1.5× on native without clipping; layouts use min-heights and wrap, no fixed-height text containers.

## 5. Spacing, shape, elevation, motion, icons

| Area | Default |
|---|---|
| Spacing (4-pt grid) | `2, 4, 8, 12, 16, 20, 24, 32, 40, 56, 72` → tokens `space.0.5 … space.18`; screen gutter 16 (mobile) / 24 (tablet) / 32 (desktop) |
| Radius | `sm 6`, `md 10`, `lg 16`, `xl 24`, `pill 999` (cards `lg`, buttons `md`/`pill`, chips `pill`) |
| Elevation | `0` flat, `1` card (subtle shadow + 1 px border), `2` sheet/menu, `3` modal; in dark theme elevation is expressed by surface lightness and borders rather than shadows |
| Motion | 120–240 ms ease-out for state changes; 300 ms max for sheets; honor **reduce motion** (disable parallax/slide, use fades) via `AccessibilityInfo.isReduceMotionEnabled` / `prefers-reduced-motion` |
| Icons | one outline icon family (24 px grid, 1.5–2 px stroke), sport icons in a custom set keyed by `sports.icon_key`; decorative icons `accessibilityElementsHidden`; icon-only buttons always have labels |

## 6. Layout and responsiveness

Breakpoints (min width): `compact 0`, `medium 768`, `expanded 1200`.
- **Compact:** bottom tab bar (4 destinations + prominent Create), single column, sheets for filters/join.
- **Medium:** navigation rail, content max-width 720, sheets become centered dialogs.
- **Expanded:** left nav with labels, Discover as list + detail two-pane, organizer console as multi-column, content max-width 1200. Hover/focus states and keyboard shortcuts for web only.
Touch targets ≥ 44×44 (iOS) / 48×48 dp (Android) with ≥ 8 px spacing; web pointer targets ≥ 24×24 CSS px (WCAG 2.2 AA 2.5.8) but we keep 40+ where possible.

## 7. Component inventory (contract)

Every component documents: props, variants, **states** (default, hover, focus-visible, pressed, disabled, loading, error), accessible name/role, and has a unit test + a11y assertion.

| Group | Components |
|---|---|
| Primitives | `Text`, `Icon`, `Button` (primary/secondary/tertiary/destructive; sizes; loading), `IconButton`, `Link`, `Divider`, `Avatar`, `Skeleton`, `Spinner` |
| Inputs | `TextField`, `TextArea`, `PasswordField`, `Select/Picker`, `Checkbox`, `Switch`, `RadioGroup`, `Stepper (number)`, `Slider/RangeInput (skill)`, `DatePicker`, `TimePicker`, `SearchField`, `ChipGroup` |
| Domain | `SportChip`, `EventCard` (compact + expanded), `CapacityIndicator` (bar + text "8/14, 6 yer"), `SkillIndicator` (value + confidence "geçici"), `ReliabilityIndicator` (percent/“Yeni oyuncu”), `LevelBadge`, `AchievementBadge`, `PlayerCard`, `BookingStatusLabel`, `ParticipationStatusPill`, `NotificationItem` |
| Navigation | `TabBar`, `SideRail/SideNav`, `Header`, `Breadcrumb` (web admin), `MapListToggle` |
| Feedback | `Toast`, `Banner`, `ConfirmDialog`, `BottomSheet/Dialog` (adaptive), `EmptyState`, `ErrorState` (with retry), `OfflineBanner` |
| Layout | `Screen`, `Stack`, `Row`, `Grid`, `ResponsiveShell`, `FormSection` |

Domain components receive **display-ready props** (they do not fetch). Skill/reliability indicators must show confidence state, never a bare number for LOW-confidence data.

## 8. Accessibility requirements (non-negotiable)

Target **WCAG 2.2 AA** on web; equivalent platform guidance on iOS/Android.
- Contrast: text ≥ 4.5:1 (≥ 3:1 for large text); non-text UI ≥ 3:1 (computed table above; any new color must be checked in CI via a token contrast test).
- Screen reader: every interactive element has role + name (`accessibilityLabel`/`aria-label`), state announced (selected, expanded, busy), live regions for toasts and async results, meaningful heading structure, images with alt or marked decorative. Slot bars read "6 yer boş, toplam 14".
- Keyboard (web): full operability, logical order, visible `:focus-visible` ring, no keyboard traps, skip-to-content link, dialogs trap and restore focus, Esc closes.
- Forms: visible labels (not placeholder-only), inline errors tied to fields, error summary, `autocomplete` attributes, clear required indicators, accessible date/time inputs with typed alternative.
- Dynamic text, reduced motion, orientation not locked, no time-limited interactions.
- Language attributes set (`lang="tr"`), Turkish pluralization and number/date formatting via `Intl`.
- Process: axe checks in Playwright on key pages, RNTL role/label assertions, manual passes (VoiceOver, TalkBack, NVDA/keyboard-only) before the pilot — see TESTING §6.

## 9. Content and tone (Turkish)

Direct, friendly, second-person informal ("sen"), short sentences, no jargon, sports vocabulary natural to Turkish players ("maç", "saha", "kadro", "yedek"). Safety/legal copy is plain and specific. All strings live in `locales/tr` and `locales/en`; no concatenated sentences (use interpolation with ICU-style plurals).

## 10. Reconciliation checklist when design.md arrives

1. Map every design.md color/type/radius/shadow to a semantic token; list unmapped items.
2. Re-run the contrast table; adjust until AA passes (a11y overrides aesthetics, flag conflicts to the founder).
3. Confirm font licensing for app + web embedding and Turkish glyph coverage.
4. Confirm logo/name placement driven by `packages/config` (name is temporary). A raster `image.png` (three stylized figures in orange / green / blue, 1.2 MB) was found in the repo root on 2026-10-24 and is treated as a **logo candidate, not yet adopted**: if chosen, the palette in §3 must be re-derived from its hues (orange, green, blue), and a vector (SVG) master plus app-icon/adaptive-icon/favicon exports are needed — a raster file alone is not sufficient for store assets. The file also needs relocation (e.g. `docs/design/`) once its status is decided.
5. Confirm iconography and illustration sources/licenses.
6. Update this document's §3–§5 to "derived from design.md" and remove the PROVISIONAL banner.

## 11. As built in Phase 1 (provisional)

Tokens live in `apps/app/src/ui/tokens` (primitives → semantic), the theme in `src/ui/theme`, components in `src/ui/components` (Text, Button, TextField, Screen, Skeleton, Banner, EmptyState, Toast, SkipLink). A Jest test asserts all 19 required contrast pairs in **both** themes (`requiredContrast` in `semantic.ts`) — any palette change from `design.md` must keep it green. `design.md` has **not** been received; the provisional logo (`apps/app/assets/brand/logo-provisional-512.png`) is a raster with an opaque white background and its orange/green/blue palette is not used by the UI. Navigation: bottom bar < 768 px, left rail 184 px (medium) / 248 px (expanded), data-driven from `src/navigation/config.ts`.
