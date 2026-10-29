#!/usr/bin/env bash
# Stops what dev-up.sh started: Metro, the emulator, the local Supabase stack. Docker Desktop itself is left alone.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=/dev/null
source scripts/android/env.sh
export MSYS_NO_PATHCONV=1
adb emu kill >/dev/null 2>&1 || true
if command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8081,4173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }" 2>/dev/null || true
else
  fuser -k 8081/tcp 4173/tcp >/dev/null 2>&1 || true
fi
pnpm db:stop >/dev/null 2>&1 || true
echo "Stopped Metro, emulator and the local Supabase stack."
