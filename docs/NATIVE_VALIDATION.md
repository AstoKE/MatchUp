# Native Android validation

Status 2026-10-25. **Android only.** iOS is **pending** — it needs macOS or EAS cloud builds plus an Apple Developer account, none of which are available yet. Nothing in this document says anything about iOS.

Device: Android Studio emulator `matchup_api36` (Pixel 7 profile, Android 16 / API 36, x86_64, 1080×2400, 420 dpi), debug build produced in the Linux container (ADR-0015), JS served by Metro, local Supabase through `adb reverse`.

How each result was obtained is stated explicitly. "Automated" = Maestro flow, run by `scripts/android/native-validation.mjs`, result recorded in `apps/app/e2e-mobile/results/` (git-ignored). "Manual" = the founder using the emulator by hand. "Not verified" means exactly that.

## Results

| Area | Result | Evidence |
|---|---|---|
| Cold start, guest discovery, four tabs, protected-route redirect (N01) | **PASS** | Automated |
| Forged / expired auth-callback deep link rejected clearly (N10) | **PASS** | Automated |
| Deep link to a non-existent event → "not found" state (N11) | **PASS** | Automated |
| Deep link to a protected route as a guest → sign-in (N12) | **PASS** | Automated |
| Further deep-link / network-error cases N14–N16 | **PASS** | Automated (earlier run, see `results.json` of the first runs) |
| Sign-up, then sign-in with the new account | **PASS** | Manual (founder) |
| Session still signed in after leaving the app / reopening | **PASS** | Manual (founder). The exact restart condition (swipe-away vs. force-stop vs. device reboot) was not specified, so cold-restart persistence is not yet established beyond this. |
| Wrong password → one generic error message | **PASS** | Manual (founder) |
| Sign-up / sign-in / wrong-password / offline-recovery as *automated* flows (N02–N09) | **Not verified** | The automated runs of these failed. Cause analysis below — all harness/environment, none confirmed as app defects — but they have **not** been re-run green yet. |
| Turkish localization (N13) | **Not verified** | Not run successfully. Not tested manually either. |
| Landscape / large font | **Not verified** | |
| Verification-email link → app (N02b–N05) | **Not verified** | Depends on N02 passing in automation. |
| iOS | **Pending** | Not started. |

## Defects found on the device and fixed

1. **Tab bar collided with the system gesture bar** (first launch screenshot `docs/native-validation/00-first-launch-defect-tabbar-overlap.png`). Fix: the tab bar height and bottom padding add the bottom safe-area inset. Confirmed on the device after the fix (`01-discover-after-fix.png`: the bar sits above the gesture handle).
2. **Every form label was announced twice by TalkBack** (the visible label and the input both carried the name). Fix: the label is hidden from assistive technology on native (the input keeps the accessible name) and linked with `htmlFor` on web. Covered by a unit test. *Not yet re-verified with a fresh accessibility-tree dump on the device.*
3. **Three unused optional native libraries removed** (gesture-handler, reanimated, worklets): smaller bundle and fewer native build targets.

## Why N02–N09 failed (harness, not shown to be app defects)

- Metro was started with `CI=1`, which disables file watching, so the device was running JavaScript from *before* the fixes. Fixed in `dev-up.sh`; confirmed by inspecting the served bundle.
- With a hardware keyboard enabled Android shows no soft keyboard, and Maestro's `hideKeyboard` then sends *Back*, which leaves the app. `dev-up.sh` now sets `show_ime_with_hard_keyboard=1`; the flows still need one more pass (remove the `index: 1` selectors) and a rerun.
- Maestro on Windows needs `JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8` for Turkish text, `-e` flags before the flow path, and flow names free of Windows-illegal characters. All handled in the orchestrator.

## Next

1. Fix the flow selectors, rerun the full suite with Metro in normal mode, and record the real result per flow here.
2. Turkish localization run (per-app locale), then the in-app language selector (requested by the founder; it also makes this test independent of device settings).
3. Cold-restart session persistence test with an explicit force-stop.
4. iOS validation once a macOS / EAS route and Apple account exist.
