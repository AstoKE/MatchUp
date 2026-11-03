# Theme E plan

**Status 2026-11-02: M0 to M5 merged, the web half of M6 built.** iOS and Android are still to do, on the founder's word. Phase 6 M4 starts after M6.

What and why: `docs/design.md` §3 and §13, ADR-0023. Mockup: https://claude.ai/artifact/RbEqLVCQx1pt7WYCNETM5Q.

Each milestone is one branch and one PR, and the next one starts after the merge. No database change in any of them. Every PR passes `pnpm check`, `pnpm db:test`, `pnpm test:integration` and `pnpm test:e2e`.

## Milestones

### M0: documents

`design.md`, ADR-0023, this plan, `UI_DESIGN_SYSTEM.md`.

### M1: tokens and fonts

- `ui/tokens`: new primitives and semantic colors, the dock and court tokens, `requiredContrast` extended with court labels and the dock. `SPORT_TINTS` moves out of `SportIcon` into tokens.
- Bricolage Grotesque and Figtree with `npx expo install`; Inter removed; the new type scale.
- **Layout does not change.** Copy and behavior do not change.
- **Tests:** `tokens.test.ts`, E2E axe at four sizes and both themes.

### M2: shared components

- Court drawings (ten SVGs) and `CourtTile`, `TimeTile`, `StatusChip` with icon and text.
- Button, field, card, chip and `ToggleChip` shapes from §3.3. `SportArtwork` draws the court in M2 and goes once rows use `TimeTile` (M4) and the event page has its hero (M5). The sport glyphs are gone: the mockup has none, a color dot sits beside the name, and it paid for the courts. The Discover picker already uses `CourtTile`.
- **Measure the bundle here.** There is 1 kB of margin: remove code first, and raise the ratchet only with a recorded reason.
- **Tests:** component tests per status, axe.

### M3: dock

- `Dock` through the `tabBar` option, replacing the tab bar and the left rail: icons on a phone, icons and labels on wider screens, the blue create button, `dockFocusRing`.
- Hidden on a phone on the event page and the join form; wider screens keep it, since nothing else navigates there. Other pinned actions sit above the dock. Bottom space on every screen so nothing is covered.
- Accessible names, `tab` roles, focus order and safe-area behavior stay.
- **Tests:** the shell E2E (keyboard, tabs), a check at four sizes that the last item of a scrolled page is not under the dock, 200 % zoom with labels.

### M4: Discover

The sport strip, time-tile rows, the display heading, the wide layout of the tiles. The mockup shows tiles and "Bu akşam Ankara'da" together, while FL-2 lists nothing before a choice. **FL-2 stays;** the founder was told and can change it.

### M5: remaining screens

**M5a:** event hero, facts and dots, organizer line, join summary. `SportArtwork` is gone.

**M5b:** My Events with `StatusChip`, profile (keeping level, reliability and badges), the court band on sign-in. The ₺ sign falls back to the system font and reads well (seen on the event page, light theme).

Create, manage, onboarding, player card, notifications and settings get no layout of their own: they carry the tokens and shapes from M1 and M2, and the mockup does not draw them. M6 looks at each one by eye.

### M6: validation

- E2E at four sizes in both themes, by eye as well, recorded at the end of this file.
- iOS and Android on devices: fonts, dock above the home indicator, keyboard, large text. Maestro flows updated and run. Android only when the founder says so.
- Bundle ratchets, an ESLint rule against color literals outside `ui/tokens`, and `docs/PERFORMANCE.md` updated.

## Risks

- **A half-themed app between milestones.** Keep the PRs close together, and do not release hosted web until M5 is merged.
- **Bundle.** See M2.
- **Icon-only dock on a phone.** Accepted (ADR-0023); look at it again after real use.
- **Long Turkish labels in the dock at large text sizes.** M3 tests this; the fallback is icons only.

## Validation record (2026-11-02, web)

**The screenshots below were taken before the default became light, with the device set to each theme; the themes themselves did not change.**

**Automated, every run:** the app starts light on a dark device and a choice in Settings survives a reload. `e2e/responsive.spec.ts` at 320, 390, 820 and 1280 px, each in light and dark (eight runs): no sideways scrolling and no serious or critical axe findings on Discover (picker and list), sign-in, event, manage, create, My Events, profile, settings, notifications and the player card. The last control of the picker and the profile clears the dock. 320 px is also what 200 % browser zoom gives a 640 px window. An ESLint rule now refuses color values outside `src/ui/tokens`.

**Seen by eye once, on contact sheets of 120 screenshots with real data:** 15 screens at those four sizes in both themes: Discover picker and list, sign-up, sign-in, onboarding (first step), event as organizer and as approved player, manage, create (first step), My Events, profile, settings, notifications, player card, request sent. The sheets are scaled down (0.3 to 0.62), so they show layout and color, not fine detail. They found one bug: on a small phone the list opened scrolled past its heading after a choice low on the picker. It is fixed and tested.

**Not verified:**

- iOS and Android devices: font loading, the dock above the home indicator and with the keyboard open, large text. Maestro flows 01, 13 and 17 were updated and not run.
- VoiceOver and TalkBack by hand; keyboard only through the shell tests.
- The join form and the later steps of create and onboarding at every size; attendance, reviews and the report sheet, beyond what `events.spec.ts` covers with axe at the default size.
- Native dynamic text at large sizes.

**Worth a look by the founder:** on a phone, Create shows its pinned "İleri" and the dock together, about 160 px of the screen.
