# Theme E plan

**Status 2026-11-02: M0 to M3 merged, M4 (Discover) built.** The other screens keep their old layouts; `SportArtwork` draws the court on the event page until M5. Phase 6 M4 starts after M6.

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

Event hero and dots, join, status, My Events, profile (keeping level, reliability and badges), auth, onboarding, create, manage, player card, notifications, settings. Check ₺ wherever a cost is shown. Probably more than one PR.

### M6: validation

- E2E at four sizes in both themes, by eye as well, recorded at the end of this file.
- iOS and Android on devices: fonts, dock above the home indicator, keyboard, large text. Maestro flows updated and run. Android only when the founder says so.
- Bundle ratchets, an ESLint rule against color literals outside `ui/tokens`, and `docs/PERFORMANCE.md` updated.

## Risks

- **A half-themed app between milestones.** Keep the PRs close together, and do not release hosted web until M5 is merged.
- **Bundle.** See M2.
- **Icon-only dock on a phone.** Accepted (ADR-0023); look at it again after real use.
- **Long Turkish labels in the dock at large text sizes.** M3 tests this; the fallback is icons only.
