#!/usr/bin/env bash
# Builds the Android APK inside the pinned Linux container and drops it in apps/app/.android-build/.
#   scripts/android/build-apk.sh [debug|release] [abis]      e.g.  scripts/android/build-apk.sh debug x86_64
# Requires Docker. First run builds the image (downloads the Android SDK/NDK into it) and primes
# Gradle/pnpm caches in named volumes; later runs are incremental.
set -euo pipefail
VARIANT="${1:-debug}"
ABIS="${2:-x86_64}"
IMAGE="matchup-android-build:1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/apps/app/.android-build"
mkdir -p "$OUT"

# Git Bash on Windows rewrites /paths in arguments; disable that for docker.
export MSYS_NO_PATHCONV=1
if command -v cygpath >/dev/null 2>&1; then
  ROOT_HOST="$(cygpath -w "$ROOT")"
  OUT_HOST="$(cygpath -w "$OUT")"
else
  ROOT_HOST="$ROOT"; OUT_HOST="$OUT"
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE (one time, several GB)…"
  docker build -t "$IMAGE" "$ROOT_HOST/docker/android"
fi

docker run --rm \
  -e VARIANT="$VARIANT" -e ABIS="$ABIS" \
  -v "$ROOT_HOST:/src:ro" \
  -v "$OUT_HOST:/out" \
  -v matchup-android-work:/work \
  -v matchup-android-gradle:/cache/gradle \
  -v matchup-android-pnpm:/cache/pnpm-store \
  "$IMAGE" /usr/local/bin/build-apk.sh

ls -l "$OUT"/*.apk
