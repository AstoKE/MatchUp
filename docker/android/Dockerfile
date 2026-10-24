# Reproducible Android build environment (Linux).
#
# Why this exists: on Windows, CMake/ninja object paths for React Native's codegen targets reach
# 260-330 characters and hit MAX_PATH; shortening strategies leave a margin of 0-2 characters and
# long-path support needs an administrator registry change plus a newer ninja (ADR-0015,
# docs/ANDROID_SETUP.md §6). A Linux container has no such limit. The resulting APK runs on the
# Windows/macOS/Linux x86_64 emulator, and the same image can be reused in CI.
#
# Every download is pinned and checksum-verified. Build:  docker build -t matchup-android-build:1 docker/android
FROM eclipse-temurin:21-jdk-jammy

ARG NODE_VERSION=24.11.1
ARG NODE_SHA256=60e3b0a8500819514aca603487c254298cd776de0698d3cd08f11dba5b8289a8
ARG PNPM_VERSION=10.33.0
ARG CMDLINE_TOOLS_ZIP=commandlinetools-linux-16111833_latest.zip
ARG CMDLINE_TOOLS_SHA1=e025545c62a8e64c7559119566a569fb1dec5f60
# Versions required by react-native 0.88 (node_modules/react-native/gradle/libs.versions.toml)
ARG ANDROID_PACKAGES="platform-tools platforms;android-37.0 platforms;android-36 build-tools;37.0.0 ndk;27.1.12297006 cmake;3.22.1"

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    GRADLE_USER_HOME=/cache/gradle \
    CI=1 \
    EXPO_NO_TELEMETRY=1 \
    PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:$PATH

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl unzip xz-utils git rsync ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Node (official tarball, checksum verified) + pnpm
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
 && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
 && rm /tmp/node.tar.xz \
 && npm install -g "pnpm@${PNPM_VERSION}" \
 && node --version && pnpm --version

# Android command-line tools (sha1 from Google's repository manifest), licenses, SDK components
RUN mkdir -p "${ANDROID_HOME}/cmdline-tools" \
 && curl -fsSL "https://dl.google.com/android/repository/${CMDLINE_TOOLS_ZIP}" -o /tmp/cmdline-tools.zip \
 && echo "${CMDLINE_TOOLS_SHA1}  /tmp/cmdline-tools.zip" | sha1sum -c - \
 && unzip -q /tmp/cmdline-tools.zip -d "${ANDROID_HOME}/cmdline-tools" \
 && mv "${ANDROID_HOME}/cmdline-tools/cmdline-tools" "${ANDROID_HOME}/cmdline-tools/latest" \
 && rm /tmp/cmdline-tools.zip \
 && (yes | sdkmanager --sdk_root="${ANDROID_HOME}" --licenses > /dev/null || true) \
 && sdkmanager --sdk_root="${ANDROID_HOME}" ${ANDROID_PACKAGES} \
 && sdkmanager --sdk_root="${ANDROID_HOME}" --list_installed

COPY build-apk.sh /usr/local/bin/build-apk.sh
RUN chmod +x /usr/local/bin/build-apk.sh
WORKDIR /work
