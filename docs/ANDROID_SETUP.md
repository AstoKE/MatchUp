# Android development environment

Status 2026-10-25. Everything here is a **portable, per-user install under `C:\dev\tools`**; nothing was added to the machine or user PATH/environment, no admin rights were used, nothing was uninstalled. Shell sessions opt in with `source scripts/android/env.sh` (Git Bash) or `. .\scripts\android\env.ps1` (PowerShell).

## 1. What was inspected first (Windows 11 Pro 10.0.26200, not elevated)

| Item | Finding |
|---|---|
| CPU / RAM / disk | Ryzen 7 9700X (8c/16t), 31 GB RAM, ~97 GB free |
| Virtualization | enabled in firmware; hypervisor present (WSL2/Docker); **WHPX usable** (`emulator -accel-check`) |
| Java | system JDK 24 (left untouched); RN 0.88 / AGP 9.2 need 17–21 → portable **Temurin 21** |
| Android SDK / Studio | none installed |
| `adb`, `gh`, `winget` | not installed |
| Admin rights | **no** |

## 2. Installed (all checksum-verified against the publisher's metadata)

| Component | Version | Location |
|---|---|---|
| Temurin JDK | 21.0.12.1 (sha256 matched) | `C:\dev\tools\jdk-21` |
| Android command-line tools | 16111833 (sha1 matched) | `C:\dev\tools\android-sdk\cmdline-tools\latest` |
| SDK packages | platform-tools 37.0.1, emulator 37.2.12, platforms 36 + 37.0, build-tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1, system image `android-36;google_apis;x86_64` | `C:\dev\tools\android-sdk` (8.1 GB) |
| AVD | `matchup_api36` (Pixel 7, Android 16 / API 36, 4 GB RAM, x86_64) | `%USERPROFILE%\.android\avd` |
| Maestro | 2.11.0 (sha256 matched; **analytics disabled** in our env scripts) | `C:\dev\tools\maestro` |
| GitHub CLI | 2.103.2 (sha256 matched), **not authenticated** | `C:\dev\tools\gh` |

The versions come from `node_modules/react-native/gradle/libs.versions.toml` (RN 0.88: compileSdk 37, targetSdk 36, buildTools 37.0.0, NDK 27.1.12297006, AGP 9.2.1, minSdk 24). **Licence note:** installing the SDK required accepting the Android SDK licences; I accepted them on your behalf as part of the authorised setup.

## 3. Daily use

```bash
bash scripts/android/dev-up.sh      # Docker must be running; starts Supabase, emulator, tunnels, installs the APK, starts Metro
bash scripts/android/dev-down.sh    # stops Metro, emulator, Supabase
bash scripts/android/build-apk.sh debug x86_64   # (re)build the APK in the Linux container, ~7 min cold, faster warm
node scripts/android/native-validation.mjs --skip-install   # automated device run
node scripts/android/ui-dump.mjs    # print what TalkBack/automation "see" on the current screen
```

In PowerShell, plain `bash` is WSL's `bash.exe` and cannot run these scripts; use the wrapper instead: `.\scripts\android\dev.ps1 up | down | validate` (it calls Git Bash explicitly).

The app is a debug (development) build: native code is in the APK, JavaScript is served live by Metro through `adb reverse tcp:8081`. The local Supabase API is reached through `adb reverse tcp:54321` (so `.env.local`'s `http://127.0.0.1:54321` is correct on the device and cleartext is allowed only in debug variants).

## 4. Findings that shaped the setup

1. **Windows cannot build the native code here (MAX_PATH).** ninja fails creating CMake object directories: the 67 object paths reach **326 characters** (limit 259). With pnpm's isolated layout the Sentry module alone failed; the `hoisted` linker fixed that but the app's own codegen targets (`react-native-gesture-handler`: 263 relative chars; `safe-area-context`: 248) still failed. `scripts/android/measure-cmake-paths.mjs` computes the outcome of every shortening strategy: even a substituted drive + relocated staging directory leaves **0–2 characters** of margin, and an AGP-mandated `Debug\<hash>\x86_64` suffix defeats it once the worst target is removed. The real fix (Windows long paths = admin registry change, **plus** a newer ninja than CMake 3.22.1 ships) is out of reach without admin.
2. **Decision (ADR-0015): build in a pinned Linux container, run on the Windows emulator.** `docker/android/Dockerfile` pins JDK, Node, pnpm, command-line tools and the SDK/NDK/CMake versions (checksum-verified). The APK it produces installs on the emulator unchanged. The same image is reusable in CI. The `hoisted` experiment was reverted.
3. **Three unused native libraries were removed** (`react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`): all are *optional* peers of `expo-router` and nothing we use imports them. Effect: −196 kB gzip of web JS, shorter native builds, one fewer MAX_PATH offender.
4. Emulator pitfalls: with a hardware keyboard enabled Android shows no soft keyboard and Maestro's `hideKeyboard` sends *Back* (exits the app) → `dev-up.sh` sets `show_ime_with_hard_keyboard=1`; Maestro needs `JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8` for Turkish text on Windows; flow names must not contain Windows-illegal path characters.

## 5. Not done / not possible here

iOS (needs macOS or EAS cloud + an Apple Developer account); physical-device tests; release (R8-minified) builds on a device; Play Store signing.
