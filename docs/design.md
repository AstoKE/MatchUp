MatchUp — Product Design System & UI/UX Specification
Status: Approved visual direction; detailed values are implementation targets, subject to platform/accessibility validation.
Version: 2.0 (Theme E) · 2026-11-02, replacing the charcoal and red of version 1.0 (ADR-0023; decisions and deviations in §13)
Owner: MatchUp
Applies to: Expo / React Native / Expo Web, iOS, Android, and responsive web.
Primary audience: Adults in Turkey; Turkish-first interface, English-ready.
1. Design mission and hierarchy
MatchUp helps people discover sports activities, find players, and join events with minimal friction. Design for a fast, premium, quiet, sports-oriented experience. Prioritize legibility, clarity, trust, and swift navigation over decorative complexity.

This document is the authoritative VISUAL AND INTERACTION design direction. The existing PRD, architecture, domain rules, security requirements and accessibility standards remain authoritative for product behavior, data and implementation. When there is a conflict, never override business logic or security merely to match a screenshot. Document significant design tradeoffs.

The four supplied references are inspiration, not assets to reproduce or screens to trace. Do not copy the GoodRec name, logo, distinctive illustrations, photo content, wording, or pixel-perfect proprietary layouts. Build an original MatchUp interface using comparable patterns: dark surfaces, compact sport listings, big venue imagery, clear hierarchy, minimal booking steps, and confident calls to action.
Provided image references
- [`references/discover.png`](references/discover.png): browse/list with compact rows, sport filters and bottom navigation.
- [`references/event-detail.png`](references/event-detail.png): immersive venue hero, information overlay, bottom action.
- [`references/join-confirm.png`](references/join-confirm.png): distraction-free review/confirmation with sticky bottom button.
- [`references/join-success.png`](references/join-success.png): restrained success state and concise event recap.
These are illustrative screen examples, not a complete page inventory. Extend the same system coherently to onboarding, profile, create event, organizer approvals, notifications, settings and responsive web.
2. Core principles
1. Content first: Show available activities and actionable details immediately; avoid marketing-heavy chrome.
2. Fast comprehension: A user should identify sport, date/time, place, format, availability and participation state at a glance.
3. Single dominant action: Each screen has one primary CTA. Secondary actions should be visibly subordinate.
4. Minimal but not sparse: Dense event lists can be compact; forms and detail screens need breathing room.
5. Trustworthy states: Pending approval, confirmed participation, full capacity, waitlist, cancellation, location disclosure and booking status must be explicit.
6. Mobile-first, platform-aware: Respect iOS/Android behavior, safe areas, keyboard handling, and native back navigation; create deliberate desktop layouts.
7. Accessible by default: Text scaling, focus states, contrast, 44x44pt minimum practical tap areas, screen-reader announcements, clear form errors and reduced-motion support.
8. Original branding: Preserve the visual mood while making MatchUp recognizably its own product.
3. Visual language
3.1 Color palette
Theme E: every sport has its own court color and line drawing, on a quiet green-tinted ground, with one blue for actions. The app starts in the light theme; dark and "follow the device" are choices in Settings, remembered on the device. The logo may be revisited separately; do not force a multicolor logo to dictate the entire product palette.

Tokens. All pairs were measured with the WCAG formula on 2026-11-02 and tokens.test.ts enforces them. Lowest result: control border on the light page, 3.22:1 against a required 3:1.
Token	Light	Dark	Usage
bgApp	#F2F5F1	#0E1512	Page
surfaceRaised	#FFFFFF	#17211C	Cards, fields
surfaceSunken	#E7ECE7	#121A16	Sunken areas
surfaceOverlay	#FFFFFF	#1F2B25	Sheets and modals
textPrimary	#11231D	#F2F5F1	Titles and body copy
textSecondary	#4B5C55	#A9B7B0	Metadata
textTertiary	#5C6C65	#8FA098	Secondary details
actionPrimary	#2F4FD0	#2F4FD0	Main action, white label
actionPrimaryPressed	#2540AE	#2540AE	Pressed action
link	#2F4FD0	#AEBBFF	Links and active text
danger	#B3261E	#FF8A80	Errors, destructive actions
warning	#7A5600	#E3B64F	Warning text
success	#1F6B4F	#5FC79B	Success text
borderStrong	#7C8C84	#6F8078	Inputs and controls
borderSubtle	#D9E0DA	#2B3832	Decorative card borders
focusRing	#2F4FD0	#AEBBFF	Focus on page and cards
dock	#11231D	#1F2B25	Dock background (dark in both themes)
onDock	#F2F5F1	#F2F5F1	Dock icons and labels
dockFocusRing	#AEBBFF	#AEBBFF	Focus inside the dock (the blue ring is 2.46:1 on it)

Court colors are the same in both themes. The label is white except on volleyball, which uses #11231D; lowest 5.35:1.
Sport	Court color
football	#1F6B4F
futsal	#2F4FD0
basketball	#A4561A
volleyball	#E3B64F
tennis	#17707F
padel	#4A3FB0
badminton	#7A2E8E
table-tennis	#0F5C8A
running	#B23A2E
walking	#5B6B2E

Status chips: approved #1F6B4F with white text and a check; pending #E3B64F with #11231D text and a clock; waitlist outlined in textPrimary with a list icon.

Use semantic tokens, not hardcoded color literals across screens; court colors are tokens too. Some court colors equal a meaning elsewhere (futsal and action blue, volleyball and pending, football and approved), so a court color never carries a status: status always has its icon and text. Color must never be the sole carrier of status.
3.2 Typography
Bricolage Grotesque for headings and time tiles, Figtree for everything else. Both contain ğ, ü, ş, ı, ö, ç and İ (checked in the font files, 2026-11-02). Figtree has no ₺ glyph, so the sign falls back to the system font; check how it looks wherever a cost is shown. Weights loaded: Bricolage 700 and 800, Figtree 400, 600, 700 and 800. Avoid copying an external brand's signature typography.

Base styles, responsive to dynamic text settings:
Style	Starting size	Font and weight	Usage
Display	34–38 (up to 60 on desktop Discover)	Bricolage 800	Page heading
Section title	21 (30 on desktop)	Bricolage 700	Day headers / grouped listings
Time tile	18–21	Bricolage 800	Time on an event row
Card title	16–19	Figtree 700	Event name
Body	14–16	Figtree 400	Event details and descriptions
Metadata	12–14	Figtree 400–600	Time, sport, distance
Micro label	12	Figtree 800	Chips and status
Button	15–17	Figtree 700–800	CTA


Do not shrink essential information to reproduce the reference image's pixel density. Support 200% text scaling as far as practical; layouts must reflow gracefully.
3.3 Shape, spacing and motion
- 4pt spacing foundation; recommended scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- Cards: ~22px radius; court tiles: 18–20px; fields: 16px; primary buttons: 18px, 54px tall; chips and dock: fully rounded.
- Cards should mostly use subtle borders and contrasting surfaces, not heavy drop shadows. Only the dock floats with a shadow.
- Primary mobile padding: 16px, adapted for tablet/desktop.
- List row: a court-colored time tile (64px on a phone, 80px on desktop) instead of a thumbnail.
- Animations: restrained 140–220ms transitions; no distracting bounce loops. Respect reduced motion.
- Loading: skeleton placeholders for lists/details, clear retry/empty/error states.
4. Core components
Build reusable and accessible components rather than one-off styling:
- Screen, ScreenHeader, PageContainer, BottomTabBar, StickyActionBar
- EventListRow, EventCard, EventHero, EventStatusBadge, CapacityIndicator
- SportFilterChip, DateFilterChip, FilterSheet, EmptyState, SkeletonRow
- PrimaryButton, SecondaryButton, TextButton, IconButton
- Avatar, SportLevelPill, ReliabilityPill, BadgePill
- InfoRow, KeyValuePanel, FormField, Select, DateTimeField, InlineError
- LocationPreview, VenuePhoto, RequestStateTimeline, ConfirmationState
Every interactive component should define: default, pressed, focused, disabled, loading, error (where applicable), and selected states, plus accessibility role/label. Avoid excessive nested containers and redundant shadows.
5. Screen specifications
5.1 Discover / Explore — reference: discover.png
Goal: Quickly browse upcoming local activities, with sport/date filters and obvious availability.

Layout:
- City at top, with the notification bell.
- First visit: a large question and one court tile per sport, plus "all sports" (USER_FLOWS FL-2). After that: the sport strip, then one-line or horizontally scrollable filter chips: date, time of day, available spots; show active-filter indicator and reset option.
- Group events under localized day headings: Bugün, Yarın, 4 Kasım Çarşamba.
- Use compact rounded rows/cards with a court-colored time tile, sport/format, event name, place, availability/status chip.
- Offer list/map toggle when a map screen exists; map is not required to block the list experience.
- Floating dock on every screen size: Keşfet, Etkinliklerim, Oluştur, Profil for MVP; the center create action is a blue circle. Icons only on a phone, icons and labels on wider screens; every item keeps its accessible name.
- Avoid unnecessary progress bars on every compact list row; display clear 3 yer kaldı or 12/14 kişi text. Capacity bar may be used in event detail or expanded cards.
Interaction: Tapping a row opens detail; filters remain discoverable; sign-in is not required for public event discovery. Do not expose private participants, hidden location details, or sensitive user data to guests.
5.2 Event detail — reference: event-detail.png
Goal: Make a user confident enough to request a spot.

Layout:
- Edge-to-edge hero in the sport's court color with its court line drawing, holding the sport/format chip and the event title. No photo is needed.
- Date, time, duration, approximate location and spots directly below; the roster as filled and open dots where capacity allows.
- Further details: skill requirements, organizer summary, remaining capacity, attendance expectations, venue/booking information and any disclosed participation costs.
- Sticky CTA area at bottom with safe-area padding. On a phone the dock is hidden on this screen and the join form, so one action stays dominant; other pinned actions sit above it.
CTA states:
- Guest: Giriş yap ve katılım iste.
- Eligible authenticated user: Katılım isteği gönder.
- Already requested: Onay bekleniyor (non-duplicate action; allow cancellation).
- Approved: Katılım onaylandı.
- Full with waiting list available: Yedek listeye başvur.
- Organizer: Etkinliği yönet.
- Canceled/past/unavailable: clear disabled or contextual state.
Business rule: Event participation requires organizer approval. Never claim the user is accepted immediately after submitting a request.
5.3 Join request confirmation — reference: join-confirm.png
Goal: Review the event and submit a request with minimal friction.

Layout:
- Minimal title: Katılım isteğini onayla.
- Compact event-summary panel with the time tile, sport/format, date/time, approximate location and any price/cost disclosures.
- Present essential participation conditions without adding redundant mandatory consent checkboxes each time.
- Distinguish mandatory platform legal consent (captured at onboarding) from event-specific rules requiring an explicit acknowledgment, if applicable.
- Sticky full-width CTA: İstek gönder.
- Prevent repeated taps/double requests with a loading state and server-side idempotency.
Do not add a Confirm & pay step until actual payments exist and are properly authorized. External venue costs must be labeled as informational and not a MatchUp charge.
5.4 Request-submitted state — reference: join-success.png
Goal: Communicate the result accurately and reassure the user.

Layout:
- Calm, centered status icon and short title.
- For a new request, show İsteğin gönderildi with amber/pending icon, not a green check that implies a confirmed slot.
- Supportive copy: Organizatör onayladığında sana bildireceğiz.
- Compact key/value summary: sport, event, date, time, location visibility and current status.
- Actions: Etkinliklerime git or Etkinliği görüntüle.
Create a separate green Katılımın onaylandı success state only when server-verified approval exists. Preserve consistent pending, rejected, waitlisted, canceled and approved designs.
5.5 Create event
Use a readable step-based form, not an excessively long one-page wall of inputs:
1. Sport and format.
2. Date/time and participant count.
3. Location/venue and externally arranged booking status.
4. Title, description, skill range and event rules.
5. Review and publish.
Give persistent save/error feedback; show form-level and field-level errors. Make clear that organizers must approve join requests. Display participation cost information accurately; MVP does not collect payment.
5.6 My Events
Tabs/filters: Yaklaşan, Başvurularım, Düzenlediklerim, Geçmiş. Distinguish pending requests, confirmed events and waitlist status with both text and subtle color.
5.7 Organizer management
Emphasize pending requests and remaining capacity. Show candidate's sport-specific level, reliability indicator (when meaningful sample exists), and essential profile info. Actions: approve, reject, remove with safeguards and confirmation for destructive actions. Do not show unnecessary personal data.
5.8 Profile and onboarding
Use the same surfaces and restrained cards, in both themes. Showcase identity, selected sports, sport-specific skill, reliability, XP and achievements as distinct metrics. Do not conflate skill and experience. Provide profile privacy choices, 18+ gate and clear consent copy. Avoid gamification clutter.
5.9 Notifications / settings / empty states
Use consistent list rows, section dividers, explicit status labels, and obvious empty state actions. Create useful empty states such as Henüz katıldığın etkinlik yok with Etkinlikleri keşfet action.
6. Responsive web behavior
- Mobile: single column; floating dock and sticky CTAs; platform safe areas. Content keeps enough bottom space that the dock never covers it.
- Tablet: wider gutters, potentially two-column list/detail patterns; the dock with labels, centered.
- Desktop: max-width content container (1280px on Discover); the same centered dock with labels, never stretched; filters in an accessible horizontal toolbar or panel; list/map split view if useful.
- Avoid giant full-bleed mobile heroes on desktop; constrain the court hero and text widths.
- Support keyboard, hover, focus-visible and accessible dialogs on web.
7. Photos, icons and content
- The court drawings are the imagery: our own line art of each sport's playing area, drawn as SVG in the app. There are no photos in the MVP.
- If venue photos arrive later, they need their own design decision and properly licensed content.
- Do not use screenshots or photos from the supplied GoodRec references as production assets.
- A sport beside its name is a small dot in its court color; there are no sport glyphs. Use a coherent icon set, consistent stroke width; don't mix emoji as primary UI icons with line icons.
- All microcopy must be natural Turkish, concise and accurate. Use internationalization keys; do not hardcode UX copy into domain logic.
8. Accessibility and trust requirements
- WCAG 2.2 AA target for web, with platform-specific mobile accessibility best practices.
- Validate colors in both dark/light contexts and across every component state. Do not assume sample token colors automatically pass contrast.
- Navigation and CTAs must be reachable with screen readers and keyboard; preserve visible focus indicators.
- Make dates/time explicit and localized (Europe/Istanbul), show cost currency (TRY), and distinguish estimated venue payments from in-app payments.
- Do not hide critical event limitations in microtext or color-coded badges alone.
- For public events, protect location privacy by revealing only allowed approximate details until approval.
- Never show false You're in confirmation, booked venue, player verified badge or payment success state.
9. Implementation and acceptance rules for Claude Code
1. Read this file together with docs/PRD.md, docs/ARCHITECTURE.md, and relevant domain/security documents before making UI changes.
2. Audit the existing UI and inventory reusable components before replacing anything.
3. Add tokens in shared theme/config; avoid hardcoded component colors and one-off spacing.
4. Build/refine one vertical UI slice at a time. Start with Discover → Event Detail → Join Request → Pending Confirmation, while respecting the actual current feature implementation phase.
5. Do not implement non-existent backend functionality just to make screenshots look complete. Use clearly isolated preview fixtures or existing test seeds only for visual previews.
6. Preserve organizer approval, auth boundaries, real event states and localization.
7. Test on small Android screens, iPhone-sized layouts, web desktop/tablet, high-text-scale mode, and keyboard/screen-reader where available; clearly identify environments not actually tested.
8. Add screenshot/visual regression tests where practical and behavioral tests for status-specific CTAs.
9. Avoid pixel-perfect copying. Similar information hierarchy and minimalist feel are desired; brand identity must be original.
10. Document deliberate deviations and verify contrast/performance before accepting a design change.
Definition of done for UI implementation
- Looks coherent with this style in every implemented screen.
- No placeholder or dead-end buttons in production flows.
- Correct loading, error, empty, pending, approved, waitlisted and canceled states.
- Primary CTA never conflicts with authoritative server state.
- Guest and signed-in flows behave correctly.
- Design tokens, localization and accessibility checks are covered.
- Actual mobile/web validation is recorded; build success alone is not treated as runtime verification.
10. Suggested first UI redesign task
Do not execute this task solely because this document exists; wait for an explicit implementation instruction.

When requested:
1. Review the existing MatchUp screens and shared tokens.
2. Produce a visual gap analysis relative to this specification and the four reference images.
3. Propose a minimal component/theme refactor plan.
4. Implement the Discover screen first, preserving existing functionality and passing tests.
5. Then style Event Detail and participation states once those features exist.
6. Report changed files, screenshot comparisons, test results and any remaining issues.

11. Recorded decisions and deviations (2026-11-01)
The founder's decisions after the audit, and where measurement moved a value. Older code comments citing "design.md §n" refer to docs/design-v0.2-archive.md. The choices of theme and font and the measured table below were replaced by Theme E (§13), and stay in git history; the rest still holds.

Decisions:
- Discover rows keep a small "paid" label; the amount and note are on the event page.
- Discover asks for a sport on the first visit, then keeps a sport strip above the list and one sport or all of them selected (founder's decision, 2026-11-02; USER_FLOWS FL-2). The sport left the filter chips and the filter count, and "clear filters" leaves it alone.
- The sport strip is a line of small court tiles (about 116 px wide; it scrolls on a phone and wraps on wider screens, the chosen one ringed in the text color with a check), not chips. The Filters sheet repeats the same choice as a grid of tiles at its top. It is still outside the filter count (founder's decision, 2026-11-07; PHASE8_PLAN M1).
- Term: "yedek liste" (waitlist) everywhere.
- Badges are round icons and XP is a progress bar (founder's notes of 2026-10-31, see below), inside a calm profile section, which is how "avoid gamification clutter" is honored.
- Auto-approve events stay. "Participation requires organizer approval" holds for all others; the green approved state appears only when the server answers APPROVED.
- docs/references/ is git-ignored: third-party screenshots, never production assets. Local copies only.

- Declining a request asks for confirmation like removing a player: it is final for that event (§5.7).

Destructive buttons are outlined, and a negative state always carries an icon or text as well as color.

Founder's notes from testing Phase 5 (applied 2026-11-01, on the profile and the event screens):
- Badges are round icons, not text cards.
- XP and level are a progress bar, as in games: current level, filled share toward the next. Numbers stay available to screen readers.
- Negative states stand out with a warning icon or a red or orange color: an expired window, being marked absent and similar. A neutral state (not marked, under review) is not presented as a penalty.

12. Validation record (2026-11-01)
Definition of done, §9 rule 7. What was actually run, and what was not. This records version 1.0; Theme E gets its own record at the end of docs/THEME_E_PLAN.md.

Verified on web, Chromium (`e2e/responsive.spec.ts`, every run): discover, sign-in, event, manage, create, My Events, profile, settings and notifications at 320 px dark, 390 px light, 820 px light and 1280 px dark: no sideways scrolling, no serious or critical axe findings. 320 px is also what 200 % browser zoom gives a 640 px window. The join, status, attendance and review screens are covered by `events.spec.ts` at the default size, dark or as the runner chooses, with axe.
Seen by eye once, at 320, 390, 820 and 1280 px: those screens plus sign-up, reviews and onboarding (not the join and status screens at every size).

Not verified:
- iOS and Android devices with this redesign, including Inter loading, the pinned buttons above the keyboard, and the Maestro flows updated in the redesign PRs.
- Native dynamic text at large sizes (`maxFontSizeMultiplier` 1.6); the web zoom check does not cover it.
- VoiceOver and TalkBack by hand; keyboard only through the existing shell tests.

Deviation: no stored screenshot comparison (§9 rule 8 "where practical"). Font rendering differs between machines, so baselines would fail for the wrong reasons; the layout and accessibility checks above run instead.

13. Theme E (2026-11-02)
The founder chose mockup direction E: https://claude.ai/artifact/RbEqLVCQx1pt7WYCNETM5Q (Discover on desktop and phone; sign-in, event detail, join, My Events and profile on a phone; light and dark). §3, §5.1 to §5.3, §6 and §7 now describe it. Screens the mockup does not draw follow the same system. Reasons and consequences: ADR-0023. Work in steps: docs/THEME_E_PLAN.md.

Founder's decisions:
- Action color: blue #2F4FD0, replacing red and coral.
- Fonts: Bricolage Grotesque and Figtree from the start, replacing Inter.
- Navigation: floating dock on every screen size, replacing the left rail.
- Default theme: light (changed the same day from "follow the device"). Dark and "follow the device" stay in Settings; dark is no longer primary.

Where the app deliberately differs from the mockup. These hold until the founder changes them:
Mockup	App	Why
Participant avatars on event cards	None	List data has no participants, and guests must not see them (§5.1)
Tiles and a "Bu akşam Ankara'da" list together on Discover	Tiles first, list after a choice	The founder's decision of the same day (§11, FL-2); confirm at the Discover milestone
Six tiles and a "show all" link on a phone	All ten tiles and an "all sports" link	The link in the app selects every sport (FL-2)
"Ankara" as a button	Plain text	The pilot has one city, and a control with one choice is a dead end (§9)
Avatar at the top, no bell	Notification bell, no avatar	Notifications exist and need a way in; Profile is in the dock
Profile without level, reliability or badges	They stay	Built features, §5.8 and §11
Dock inside the screen drawing	Also respects safe areas and text scaling	§2 rule 6 and 7

Accessibility additions the mockup needed:
- A separate focus color inside the dock, since the action blue measures 2.46:1 on it.
- On a dark page the action blue measures 2.78:1 and court tiles as low as 2.05:1 against their surroundings. WCAG 1.4.11 does not require more, because the label inside identifies each control, and the focus ring is what must stand out. Volleyball on the light page is 1.73:1 for the same reason.
- Court drawings are decorative for screen readers; the sport name is the label.

