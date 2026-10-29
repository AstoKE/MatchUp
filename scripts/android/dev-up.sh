#!/usr/bin/env bash
# One command to bring up the whole local native test bench:
#   Docker (must already be running) -> local Supabase -> emulator -> adb tunnels -> APK installed -> Metro.
#   bash scripts/android/dev-up.sh          (stop everything again with: bash scripts/android/dev-down.sh)
#   MATCHUP_BACKEND=hosted bash scripts/android/dev-up.sh   the app talks to the linked HOSTED project
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=/dev/null
source scripts/android/env.sh
export MSYS_NO_PATHCONV=1
PKG=com.example.matchup.dev
APK=apps/app/.android-build/matchup-debug-x86_64.apk

BACKEND="${MATCHUP_BACKEND:-local}"
if [ "$BACKEND" = hosted ]; then
  echo "== Supabase (hosted, linked project)"
  pnpm env:hosted
else
  docker info >/dev/null 2>&1 || { echo "Docker Desktop is not running. Start it first."; exit 1; }
  echo "== Supabase (local)"
  pnpm db:start >/dev/null
  pnpm env:local
fi

echo "== Emulator"
# A stale adb server (e.g. left over from an earlier session) answers "error: closed"; restart it once.
if ! adb devices >/dev/null 2>&1; then
  adb kill-server >/dev/null 2>&1 || true
  adb start-server
fi
if ! adb devices | grep -q "emulator-.*device$"; then
  nohup emulator -avd matchup_api36 -no-boot-anim -no-audio -gpu auto -no-snapshot >/dev/null 2>&1 &
  adb wait-for-device
  until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 3; done
fi
adb reverse tcp:54321 tcp:54321
adb reverse tcp:8081 tcp:8081
adb shell settings put secure show_ime_with_hard_keyboard 1

echo "== App"
# Reinstall whenever the APK changed, not only when the app is missing: new JS on an old APK crashes
# as soon as it needs a native module that APK does not contain.
[ -f "$APK" ] || { echo "APK missing: build it with: bash scripts/android/build-apk.sh debug x86_64"; exit 1; }
APK_SUM="$(sha256sum "$APK" | cut -d' ' -f1)"
STAMP=apps/app/.android-build/installed-apk.sha256
if ! adb shell pm list packages | grep -q "$PKG" || [ "$(cat "$STAMP" 2>/dev/null)" != "$APK_SUM" ]; then
  adb install -r "$APK"
  echo "$APK_SUM" >"$STAMP"
fi

echo "== Metro"
# A Metro started before a dependency change does not see packages added since (pnpm links on Windows):
# the bundle then fails with "Unable to resolve". EXPO_PUBLIC_* values are inlined at bundle time, so a
# switch between local and hosted needs a fresh bundle too. Restart with --clear when either changed.
LOCK_SUM="$(cat pnpm-lock.yaml apps/app/.env.local | sha256sum | cut -d' ' -f1)"
METRO_STAMP=apps/app/.android-build/metro-lock.sha256
# Not `curl | grep -q`: under pipefail grep's early exit can fail curl (SIGPIPE) and flip the answer.
metro_running() { [[ "$(curl -s localhost:8081/status 2>/dev/null || true)" == *running* ]]; }
if metro_running && [ "$(cat "$METRO_STAMP" 2>/dev/null)" != "$LOCK_SUM" ]; then
  echo "Dependencies or backend changed since Metro started: restarting it with a clean cache"
  if command -v taskkill >/dev/null 2>&1; then
    for pid in $(netstat -ano | grep -E ':8081 .*LISTENING' | awk '{print $NF}' | sort -u); do
      taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
    done
  else
    fuser -k 8081/tcp >/dev/null 2>&1 || true
  fi
  sleep 2
fi
if ! metro_running; then
  mkdir -p apps/app/.android-build
  # NOT CI=1: CI mode disables file watching (stale JS). Output goes to a log so JS warnings can be read.
  (cd apps/app && nohup pnpm exec expo start --port 8081 --clear >.android-build/metro.log 2>&1 &)
  until metro_running; do sleep 2; done
  echo "$LOCK_SUM" >"$METRO_STAMP"
  # A running app keeps the old bundle in memory: restart it so it loads the new one.
  adb shell am force-stop "$PKG"
  adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
fi
if [ "$BACKEND" = hosted ]; then
  echo "Ready (HOSTED backend). Open the MatchUp app on the emulator. Records: Supabase dashboard."
else
  echo "Ready. Open the MatchUp app on the emulator. Mailpit (emails): http://127.0.0.1:54324"
fi
