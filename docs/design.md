MatchUp — Product Design System & UI/UX Specification
Status: Approved visual direction; detailed values are implementation targets, subject to platform/accessibility validation.
Version: 1.0 · 2026-10-31
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
Adopt charcoal/black + warm red/coral as the main direction inspired by the provided screenshots. The previous bright-lime visual language should not remain randomly mixed into the UI. Treat lime as a legacy/provisional palette until a deliberate brand decision. The logo may be revisited separately; do not force a multicolor logo to dictate the entire product palette.

Recommended starting design tokens (verify AA contrast, especially small text and disabled states):
Token	Hex	Usage
color.bg.canvas	#0B0B0C	Main dark background
color.bg.surface	#18191B	Event cards, fields, panels
color.bg.surfaceRaised	#222326	Active layers and modal surfaces
color.border.subtle	#323438	Delicate card/input boundaries
color.text.primary	#F5F5F6	Titles and body copy
color.text.secondary	#AAAEB5	Metadata
color.text.tertiary	#8D929A	Secondary details, with contrast checks
color.brand.primary	#E13C47	Main CTA, active states
color.brand.pressed	#BF2936	Pressed button
color.success	#32996F	Confirmed participation
color.warning	#E6AB4A	Pending approval / warning
color.danger	#EC6262	Error/destructive actions


Use semantic tokens, not hardcoded color literals across screens. Introduce accessible light-mode tokens if light mode is supported; do not auto-invert brand colors. Color must never be the sole carrier of status.
3.2 Typography
Use a legible sans-serif font with strong Turkish support (including ğ, ü, ş, ı, ö, ç, İ). Prefer a well-supported font such as Inter, or a compatible system font when platform footprint/performance warrants it. Avoid copying an external brand's signature typography.

Base styles, responsive to dynamic text settings:
Style	Starting size	Weight	Usage
Screen title	24–28	700	Page heading
Section title	19–22	700	Day headers / grouped listings
Card title	16–17	650–700	Event name
Body	14–16	400–500	Event details and descriptions
Metadata	12–13	400–500	Time, sport, distance
Micro label	11–12	600	Chips and status
Button	15–16	650–700	CTA


Do not shrink essential information to reproduce the reference image's pixel density. Support 200% text scaling as far as practical; layouts must reflow gracefully.
3.3 Shape, spacing and motion
- 4pt spacing foundation; recommended scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- Cards: ~16–20px radius; chips: fully rounded; buttons: ~12–16px or pill where appropriate.
- Cards should mostly use subtle borders and contrasting surfaces, not heavy drop shadows.
- Primary mobile padding: 16px, adapted for tablet/desktop.
- List row image: rounded thumbnail (~52–64px) if the screen uses compact listing.
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
- Dark background, clear app title / city selector at top.
- One-line or horizontally scrollable filter chips: sport, date, time of day, available spots; show active-filter indicator and reset option.
- Group events under localized day headings: Bugün, Yarın, 4 Kasım Çarşamba.
- Use compact rounded rectangular rows/cards with a small venue image, event name or venue, sport/format, time, availability/status chip.
- Offer list/map toggle when a map screen exists; map is not required to block the list experience.
- Sticky bottom navigation: Keşfet, Etkinliklerim, Oluştur, Profil for MVP; center create action may be visually emphasized, but not at the expense of hierarchy.
- Avoid unnecessary progress bars on every compact list row; display clear 3 yer kaldı or 12/14 kişi text. Capacity bar may be used in event detail or expanded cards.
Interaction: Tapping a row opens detail; filters remain discoverable; sign-in is not required for public event discovery. Do not expose private participants, hidden location details, or sensitive user data to guests.
5.2 Event detail — reference: event-detail.png
Goal: Make a user confident enough to request a spot.

Layout:
- Tall, edge-to-edge venue/event hero image (responsive height and graceful fallback if no photo).
- Dark lower overlay/gradient for readable title and concise badges; no text over poorly contrasted image regions.
- Sport/format, event title, approximate location, date, time, duration and spots near the top.
- Further details: skill requirements, organizer summary, remaining capacity, attendance expectations, venue/booking information and any disclosed participation costs.
- Sticky CTA area at bottom with safe-area padding.
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
- Compact event-summary panel with venue thumbnail, sport/format, date/time, approximate location and any price/cost disclosures.
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
Use the same dark surfaces and restrained cards. Showcase identity, selected sports, sport-specific skill, reliability, XP and achievements as distinct metrics. Do not conflate skill and experience. Provide profile privacy choices, 18+ gate and clear consent copy. Avoid gamification clutter.
5.9 Notifications / settings / empty states
Use consistent list rows, section dividers, explicit status labels, and obvious empty state actions. Create useful empty states such as Henüz katıldığın etkinlik yok with Etkinlikleri keşfet action.
6. Responsive web behavior
- Mobile: single column; sticky bottom tabs and CTAs; platform safe areas.
- Tablet: wider gutters, potentially two-column list/detail patterns.
- Desktop: max-width content container, top/side navigation instead of stretched bottom mobile bar; filters in an accessible horizontal toolbar or panel; list/map split view if useful.
- Avoid giant full-bleed mobile hero images on desktop; constrain image aspect ratio and text widths.
- Support keyboard, hover, focus-visible and accessible dialogs on web.
7. Photos, icons and content
- Images should feature authentic sports spaces and situations; prefer supplied or properly licensed content.
- Use venue thumbnails in lists and larger images in details. Provide dependable gradient/illustrated fallbacks when images are unavailable.
- Keep image treatments consistent: predictable crop, gentle corner radius, lightweight dark gradient for white text overlays.
- Do not use screenshots or photos from the supplied GoodRec references as production assets.
- Use a coherent icon set, consistent stroke width; don't mix emoji as primary UI icons with line icons.
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
The founder's decisions after the audit, and where measurement moved a value. The spec above is otherwise unchanged. Older code comments citing "design.md §n" refer to docs/design-v0.2-archive.md.

Decisions:
- Light theme stays (it is a setting today); dark is primary, light is derived with its own tokens.
- Font: Inter, weights 400, 600 and 700. Weights 500 and 650 from §3.2 map to the nearest loaded one. Package @expo-google-fonts/inter, about 340 kB per weight, loaded at runtime on web and native.
- Discover rows keep a small "paid" label; the amount and note are on the event page.
- Term: "yedek liste" (waitlist) everywhere.
- Badges are round icons and XP is a progress bar (founder's notes of 2026-10-31, see below), inside a calm profile section, which is how "avoid gamification clutter" is honored.
- Auto-approve events stay. "Participation requires organizer approval" holds for all others; the green approved state appears only when the server answers APPROVED.
- docs/references/ is git-ignored: third-party screenshots, never production assets. Local copies only.

Measured deviations from the §3.1 sample tokens (AA, enforced by tokens.test.ts):
Token	Spec	Used	Why
action primary	#E13C47	#D73641	White label was 4.25:1; now 4.67:1
action pressed	#BF2936	#B82633	Stays clearly darker than the new primary
link / active text	#E13C47	#FF8A8F	Red text was 4.14 on surface and 3.70 on raised; now 7.78 and 6.95
success	#32996F	#45B58A	Was 4.43 on raised; now 6.16
control border	#323438	#7A7F87	Inputs need 3:1 (WCAG 1.4.11); #323438 stays for decorative card borders

Primary red and danger are close, so: destructive buttons are outlined, and a negative state always carries an icon or text as well as color.

Founder's notes from testing Phase 5:
- Badges are round icons, not text cards.
- XP and level are a progress bar, as in games: current level, filled share toward the next. Numbers stay available to screen readers.
- Negative states stand out with a warning icon or a red or orange color: an expired window, being marked absent and similar. A neutral state (not marked, under review) is not presented as a penalty.

