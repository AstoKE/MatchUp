#!/usr/bin/env bash
# One command to bring up the whole local native test bench:
#   Docker (must already be running) -> local Supabase -> emulator -> adb tunnels -> APK installed -> Metro.
#   bash scripts/android/dev-up.sh          (stop everything again with: bash scripts/android/dev-down.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=/dev/null
source scripts/android/env.sh
export MSYS_NO_PATHCONV=1
PKG=com.example.matchup.dev
APK=apps/app/.android-build/matchup-debug-x86_64.apk

docker info >/dev/null 2>&1 || { echo "Docker Desktop is not running. Start it first."; exit 1; }

echo "== Supabase (local)"
pnpm db:start >/dev/null
pnpm env:local

echo "== Emulator"
if ! adb devices | grep -q "emulator-.*device$"; then
  nohup emulator -avd matchup_api36 -no-boot-anim -no-audio -gpu auto -no-snapshot >/dev/null 2>&1 &
  adb wait-for-device
  until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 3; done
fi
adb reverse tcp:54321 tcp:54321
adb reverse tcp:8081 tcp:8081
adb shell settings put secure show_ime_with_hard_keyboard 1

echo "== App"
if ! adb shell pm list packages | grep -q "$PKG"; then
  [ -f "$APK" ] || { echo "APK missing: build it with: bash scripts/android/build-apk.sh debug x86_64"; exit 1; }
  adb install -r "$APK"
fi

echo "== Metro"
if ! curl -s localhost:8081/status | grep -q running; then
  mkdir -p apps/app/.android-build
  # NOT CI=1: CI mode disables file watching (stale JS). Output goes to a log so JS warnings can be read.
  (cd apps/app && nohup pnpm exec expo start --port 8081 >.android-build/metro.log 2>&1 &)
  until curl -s localhost:8081/status | grep -q running; do sleep 2; done
fi
echo "Ready. Open the MatchUp app on the emulator. Mailpit (emails): http://127.0.0.1:54324"
