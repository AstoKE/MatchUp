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
  for port in 8081 4173; do
    pids="$(ss -ltnp "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)"
    # one kill argument per PID, so the variable must stay unquoted
    # shellcheck disable=SC2086
    if [ -n "$pids" ]; then kill $pids 2>/dev/null || true; fi
  done
  sleep 1
  # A Metro that survives keeps 1+ GB and file watchers (found after `expo start --web` hit ENOSPC): say so.
  for port in 8081 4173; do
    if ss -ltn "sport = :$port" 2>/dev/null | grep -q LISTEN; then echo "Warning: port $port is still in use."; fi
  done
fi
pnpm db:stop >/dev/null 2>&1 || true
echo "Stopped Metro, emulator and the local Supabase stack."
