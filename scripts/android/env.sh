#!/usr/bin/env bash
# Source this file:  source scripts/android/env.sh
# Points the current shell at the portable toolchain installed under C:\dev\tools (no system-wide
# changes were made: nothing is added to the machine or user PATH/environment permanently).
# Override TOOLS_DIR if you installed elsewhere (see docs/ANDROID_SETUP.md).
# Linux: SDK and Maestro under ~/dev/tools and the system JDK 21 (docs/ANDROID_SETUP.md section 6);
# Windows (Git Bash): C:\dev\tools with its own portable JDK.
if [ "$(uname -s)" = Linux ]; then
  TOOLS_DIR="${TOOLS_DIR:-$HOME/dev/tools}"
  export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
else
  TOOLS_DIR="${TOOLS_DIR:-/c/dev/tools}"
  export JAVA_HOME="$TOOLS_DIR/jdk-21"
fi
export ANDROID_HOME="$TOOLS_DIR/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$TOOLS_DIR/maestro/bin:$TOOLS_DIR/gh/bin:$PATH"
