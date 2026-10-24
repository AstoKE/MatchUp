# Dot-source this file:  . .\scripts\android\env.ps1
# Points the current PowerShell session at the portable toolchain under C:\dev\tools.
# Nothing is written to the machine or user environment.
param([string]$ToolsDir = 'C:\dev\tools')
$env:JAVA_HOME = Join-Path $ToolsDir 'jdk-21'
$env:ANDROID_HOME = Join-Path $ToolsDir 'android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:MAESTRO_CLI_NO_ANALYTICS = '1'
$env:MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = 'true'
$env:Path = @(
  "$env:JAVA_HOME\bin",
  "$env:ANDROID_HOME\platform-tools",
  "$env:ANDROID_HOME\emulator",
  "$env:ANDROID_HOME\cmdline-tools\latest\bin",
  (Join-Path $ToolsDir 'maestro\bin'),
  (Join-Path $ToolsDir 'gh\bin'),
  $env:Path
) -join ';'
