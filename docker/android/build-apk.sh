#!/usr/bin/env bash
# Runs INSIDE the matchup-android-build container.
#   /src  = the repository working tree (bind-mounted read-only)
#   /work = a persistent Linux volume with the build copy (fast ext4; avoids Windows file-system I/O)
#   /out  = bind-mounted output directory for the APK
# Env: VARIANT=debug|release (default debug), ABIS (default x86_64 = the emulator)
set -euo pipefail
VARIANT="${VARIANT:-debug}"
ABIS="${ABIS:-x86_64}"
SRC=/src
DEST=/work/matchup

echo "== sync working tree -> $DEST (node_modules, build output and VCS metadata excluded)"
mkdir -p "$DEST"
rsync -a --delete \
  --exclude node_modules --exclude .git --exclude 'dist*' --exclude .expo --exclude android --exclude ios \
  --exclude coverage --exclude test-results --exclude playwright-report --exclude .android-build \
  --exclude '.temp' \
  "$SRC"/ "$DEST"/

cd "$DEST"
echo "== pnpm install (frozen lockfile, Linux)"
pnpm config set store-dir /cache/pnpm-store
pnpm install --frozen-lockfile

cd apps/app
echo "== expo prebuild (android)"
pnpm exec expo prebuild --platform android --no-install --clean

cd android
# Give Gradle room; the default 2 GB heap is too small for the New-Architecture C++ + Kotlin steps.
export GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8"
if [ "$VARIANT" = "release" ]; then TASK=assembleRelease; else TASK=assembleDebug; fi
echo "== gradle $TASK (ABIs: $ABIS)"
./gradlew "$TASK" -x lint -x test --no-daemon --build-cache -PreactNativeArchitectures="$ABIS"

APK=$(find app/build/outputs/apk -name '*.apk' | head -1)
mkdir -p /out
cp "$APK" "/out/matchup-$VARIANT-$ABIS.apk"
echo "== done: /out/matchup-$VARIANT-$ABIS.apk ($(du -h "/out/matchup-$VARIANT-$ABIS.apk" | cut -f1))"
