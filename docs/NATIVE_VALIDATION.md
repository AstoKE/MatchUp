# Native Android validation

Status 2026-10-30 (Phase 3 device run added; the Phase 2 run below is from 2026-10-25). **Android only.** iOS is **pending** — it needs macOS or EAS cloud builds plus an Apple Developer account, none of which are available yet. Nothing in this document says anything about iOS.

Device: Android Studio emulator `matchup_api36` (Pixel 7 profile, Android 16 / API 36, x86_64, 1080×2400, 420 dpi), debug build produced in the Linux container (ADR-0015), JavaScript served by Metro, local Supabase through `adb reverse`. **An emulator is not a physical device**: no real keyboard/IME variety, no real network transitions, no OEM behaviour, and timing is not representative.

"Automated" = Maestro flow run by `scripts/android/native-validation.mjs` (results in `apps/app/e2e-mobile/results/`, git-ignored). "Manual" = the founder using the emulator by hand.

## Phase 2 run (2026-10-25) — 22 / 22 passed (exit code 0)

One earlier full run of the same build failed 6 steps in a cascade: the Maestro driver died before running a single step of N03, so everything depending on that state failed too. It was not an app result; the runner now retries once a flow that executed no step (and never retries one that ran a step), and the following full run was green without needing a retry.

| ID | What | How |
|---|---|---|
| N01 | Cold start, guest discovery, four tabs, protected-route redirect | Automated |
| N02 | Sign up → "check your email" screen | Automated |
| N02b | Verification email delivered (Mailpit); Supabase redirects to the app scheme with a PKCE code | Automated |
| N03 | Warm deep link completes verification → signed in; a brand-new (not onboarded) account is sent to onboarding when it opens Profile | Automated |
| N03b | Onboarding on the device: 18+/terms missing → blocked; empty name → blocked; no sport → blocked; valid submission returns to Profile | Automated |
| N03c | Server state equals what the UI did: `onboarded`, 18+ confirmed, name, **2** consent rows at the draft version, **0** marketing rows, football level 3.5 (queried from the database) | Automated |
| N03d | Profile on the device: edit bio, add a sport (Edit sports), make the profile visible to everyone (Settings), system back returns to the updated profile | Automated |
| N03e | Server state equals the edits: bio, visibility `EVERYONE`, football 3.5 + tennis 3.0 (queried from the database) | Automated |
| N04 | Session persists after the process is killed and relaunched | Automated |
| N05 | Sign out → guest home; still signed out after restart | Automated |
| N06 | Sign in returns to the page that required it | Automated |
| N07 | Wrong password → one generic error message | Automated |
| N08 | Server unreachable → clear, localized network error | Automated |
| N09 | Connectivity restored → same form succeeds without restart | Automated |
| N10 | Forged/expired link code rejected clearly (cold start, signed out) | Automated |
| N11 | Event deep link to a non-existent event → honest "not found" | Automated |
| N12 | Protected-route deep link as a guest → sign-in | Automated |
| N14L | In-app language selector switches the UI and persists across a restart | Automated |
| N13 | Per-app Android language = Turkish → Turkish UI (İ ı Ş Ğ ç ü ö) | Automated |
| N14 | No native crashes / fatal exceptions during the whole run | Automated (logcat crash buffer) |
| N15 | `ReactNativeJS:E` error log empty | Automated |
| N16 | Cold start time (debug build + Metro; **not** a performance claim) | Automated |

Earlier the founder confirmed by hand: sign-up, sign-in, staying signed in after leaving the app, wrong-password message.

**Not verified:** landscape / large-font / TalkBack on the real screen reader (only the accessibility *tree* was inspected, see below), physical devices, release (minified) builds, iOS, low-memory process death while a form is half-filled, push/deep links from other apps (e.g. a real mail client tapping the link — the link was opened with `adb`).

## What native testing found (and fixed)

1. **PKCE was silently weakened on native (security).** Hermes has no global `crypto`, so supabase-js generated the code verifier with `Math.random()` and fell back to the `plain` challenge method (it only logged a warning: *"WebCrypto API is not supported…"*). Unit tests and the web build could not show this. Fix: `src/lib/supabase/crypto-polyfill.ts` supplies `getRandomValues` and `subtle.digest` from `expo-crypto` (new native dependency, Expo-pinned `~58.0.7`; needs a native rebuild). Covered by a unit test against the RFC 7636 appendix-B vector. On the device the warning no longer appears (the Metro log count stayed unchanged across the whole 18-step run, which includes three PKCE sign-ups). *Not independently proven on the wire* — the check is the absence of the warning plus the unit-tested digest, not a capture of the request.
2. **Tab bar overlapped the system gesture bar** (`docs/native-validation/00-…png`). Fixed with bottom safe-area insets; confirmed on the device (`01-…png`).
3. **Duplicate TalkBack stops on every form field** (label and input both announced). Label hidden from assistive tech on native; unit-tested. *The tree was inspected before the fix; a post-fix dump on the sign-in screen was not recorded.*
4. Removed three unused optional native libraries (gesture-handler, reanimated, worklets).

## Product decisions confirmed by testing

- With a live session, opening a forged/expired callback link silently continues to the home screen (nothing to authenticate, nothing leaked). The test therefore clears app data first.
- The dev-only warning toast ("Open debugger to view warnings") covers the bottom tab bar in debug builds; it was how finding 1 surfaced. Release builds do not show it.

## Harness notes (not app defects)

**Open item — first tap after typed text.** On this emulator (hardware-keyboard mode: only Gboard's floating toolbar, no on-screen keys) the first tap on a button right after Maestro's `inputText` did not fire; the second did. The same tap sent with `adb input tap` after `adb input text` fired at once. It was not reproducible with real key presses because the emulator has no on-screen keyboard. It is therefore **not known** whether real users on a phone can hit this; flow 15 releases focus by tapping the heading first. Re-check on a physical device. Before this, `Screen` already uses `keyboardShouldPersistTaps="handled"`.

Metro's first bundle after JavaScript changes can take a minute; the runner now waits for the home screen once before the flows (a blank white screen in the first flow was this, not a defect). Maestro's `hideKeyboard` leaves the app when Android shows only Gboard's floating toolbar (hardware keyboard emulation), so the flows do not use it. Clearing app data also resets the per-app language, so N13 sets the language after the clear. Metro must not run with `CI=1` (no file watching → stale JS). Run from PowerShell via `scripts/android/dev.ps1` (plain `bash` there is WSL).

## Phase 3 on the device (2026-10-30) — 31 / 31 passed (exit code 0)

Full suite on the same emulator profile, this time driven from the **Linux** machine (ANDROID_SETUP.md §6): the 22 Phase 2 checks plus nine Phase 3 checks (flows 17–22, `phase3-fixtures.mjs`). The organizer account and the events are created through the real RPCs on the local stack; after each state change the runner reads the database back (N18b, N20b, N22b).

| Check | What it proves on the device |
|---|---|
| N17 | Discover opens on the profile's sports, the filters sit behind a button, the join action is on the first card |
| N18 / N18b | Request to join **with the on-screen keyboard open**; the server holds a `REQUESTED` row with the typed message |
| N19 | After the host approves: My Events → Approved, bell and inbox carry the notice, the event page shows "Going (1)" |
| N20 / N20b | An auto-approve event admits the player at once (deep link); `APPROVED` with no organizer action |
| N21 | Invite-only event opened without its token does not exist for the player |
| N22 / N22b | The same event with `?invite=<token>` is visible and requestable; `REQUESTED` row exists |

**Found and fixed by these checks:** on Android 15+ (edge-to-edge) the window no longer resizes for the keyboard, so the pinned join form was hidden under it (N18). `Screen` now wraps its content in a `KeyboardAvoidingView` when a footer is set. Flows 01, 05 and 13 still asserted the old Discover empty-state text and were updated.

**Run history, so the number is not read as "first try":** an earlier Linux run passed 30 of 31 (N19 asserted the roster without scrolling to it; the flow now scrolls). Another run was cut short when the memory cap below killed the emulator after 9 checks (N05–N07 then failed with "device not connected", which is not an app result). The 31 / 31 run is the one after both were fixed.

**Not covered by an automated check (still to do by hand):** creating an event through the form on the device; approving from the organizer's request queue in the UI (the host approves through the RPC in N19); the system share sheet for the invite link; TalkBack reading order of the event page, the filter button's expanded state, the roster and the inbox; dark mode and a font scale of 1.6 on Discover and the event page. Physical devices and iOS are not covered.

### Emulator memory on the Linux bench

Measured on a 15 GB laptop with two GPUs (AMD Radeon 680M + NVIDIA RTX 4060), no sudo:

- With `-gpu swiftshader_indirect` (software rendering) the emulator's `qemu` process grew past 5 GB within about four minutes (`-memory 2560` limits the guest, not this); earlier unattended sessions reached 9 GB and the kernel OOM killer took the session down twice.
- With `-gpu host` the emulator picked the NVIDIA Vulkan device and **segfaulted** right after boot. Exposing only the AMD driver (`VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/radeon_icd.json`) boots it and it stayed at **2.9–3.0 GB** for the whole 31-check run (34 samples, ~8.5 min; at least 3.5 GB of RAM stayed free, load average ≤ 3.6).
- The cause of the growth was only compared, not profiled: software rendering is the likely one, not proven.
- `dev-up.sh` on Linux now starts the emulator headless, with the AMD driver when present, `-cores 2 -memory 2560`, and inside a `systemd-run --user --scope -p MemoryMax=5G -p MemorySwapMax=0` cgroup (override with `EMULATOR_MEMORY_MAX`), so a regression kills only the emulator.
- Do not run `tsc`, jest, Docker image builds or a `expo start --web` next to the emulator, and run the suite alone.

## Next

1. Physical Android device pass; TalkBack walk-through on the real screen reader.
2. iOS validation once a macOS / EAS route and Apple account exist.
3. Re-run this suite against the hosted Supabase project before any public launch.
