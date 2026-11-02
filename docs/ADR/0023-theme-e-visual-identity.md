# ADR-0023 — Theme E: court colors, a blue action, a floating dock and new fonts

**Status:** Accepted (2026-11-02), by the founder. Replaces the visual direction of `docs/design.md` version 1.0.

**Context.** Version 1.0 (charcoal and warm red, Inter, tab bar and left rail) was built in PRs #44–#54. The founder then explored five directions on a design canvas and chose E: https://claude.ai/artifact/RbEqLVCQx1pt7WYCNETM5Q. `design.md` decides visual identity, so it has to change before the code does. Phase 6 M4 waits for this work.

**Decision.**

1. **Identity.** Each sport has a court color and a line drawing of its playing area. They replace photos and the sport artwork: tiles on Discover, a time tile on event rows, a hero on the event page.
2. **Color.** One blue action (`#2F4FD0`) on a green-tinted ground. Tokens are in `design.md` §3.1. Status always has an icon and text, because some court colors match a status color.
3. **Theme.** Light and dark are equal, and the default follows the device. The stored preference (`system|light|dark`) and `user_settings.theme` already support this: no database change.
4. **Fonts.** Bricolage Grotesque (700, 800) and Figtree (400, 600, 700, 800), through `@expo-google-fonts/bricolage-grotesque` and `@expo-google-fonts/figtree` (MIT and OFL-1.1), loaded at runtime like Inter today. `@expo-google-fonts/inter` goes.
5. **Navigation.** A floating dock on every size, through React Navigation's `tabBar` option. It keeps the bottom-tabs navigator, the routes and the `tab` roles. The left rail goes. On a phone the dock hides on the event page and the join form.
6. **No participant avatars on cards.** Lists carry no participant data and guests must not see participants. Showing them would need a new RPC and a privacy decision.

**Measured on 2026-11-02.**

- Contrast: all 29 required token pairs pass in both themes. Lowest: control border on the light page, 3.22:1 (needs 3:1).
- Font files: six new weights total 343 kB against 1,027 kB for Inter's three, so the download shrinks by two thirds. These are not in the JavaScript ratchet.
- Turkish letters are present in all six files. Figtree lacks the ₺ sign, which falls back to the system font.
- JavaScript bundle: 884 of 885 kB before this work. Court drawings add code and the sport artwork they replace removes some; the net is not measured yet. Raising a ratchet needs its own recorded reason in `scripts/check-bundle-size.mjs`, as before.

**Alternatives.**

- Keep Inter until the end and measure, as Claude recommended: the founder chose the new fonts from the start, and the sizes above remove the cost argument.
- Keep the left rail on wide screens: this keeps two navigation components and leaves the desktop unlike the mockup.
- Keep the coral action: it would be hard to tell from the running court and from errors.

**Consequences.**

- Every screen changes appearance, in steps (`docs/THEME_E_PLAN.md`). Until the last step the app mixes old layouts with new colors, which is why M1 to M5 are expected to merge close together and no hosted web release is planned in between.
- No business rule, RPC or schema changes. The rules of `design.md` §5 on honest states stay.
- E2E that finds navigation by `tab` role keeps working. The responsive checks now also have to prove that the dock never covers content.
- The dark ground is green-black (`#0E1512`), not the former charcoal.
- Phone dock items have no visible text. This is a known recognition cost, accepted by following the mockup; accessible names stay.
- A native rebuild is not expected for the fonts, because they load at runtime; that is to be confirmed on a device in M6.
