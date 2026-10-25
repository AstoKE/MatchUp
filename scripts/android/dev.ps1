# PowerShell entry point for the native test bench. In PowerShell, plain `bash` resolves to WSL
# (C:\Windows\system32\bash.exe), which cannot run our scripts; this calls Git Bash explicitly.
#   .\scripts\android\dev.ps1 up          start Supabase, emulator, tunnels, Metro
#   .\scripts\android\dev.ps1 up hosted   same, but the app talks to the linked HOSTED Supabase project
#   .\scripts\android\dev.ps1 down        stop them again
#   .\scripts\android\dev.ps1 validate    automated device run (after "up", local backend only)
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('up', 'down', 'validate')]
  [string]$Action,
  [Parameter(Position = 1)]
  [ValidateSet('local', 'hosted')]
  [string]$Backend = 'local'
)

# Native tools (supabase CLI) write warnings to stderr; that must not abort the script in Windows PowerShell 5.1.
$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$gitBash = 'C:\Program Files\Git\bin\bash.exe'
if (-not (Test-Path $gitBash)) { throw "Git Bash not found at $gitBash" }

Set-Location $root
switch ($Action) {
  'up' {
    $env:MATCHUP_BACKEND = $Backend
    & $gitBash scripts/android/dev-up.sh
  }
  'down' { & $gitBash scripts/android/dev-down.sh }
  'validate' {
    . (Join-Path $PSScriptRoot 'env.ps1')
    node scripts/android/native-validation.mjs --skip-install
  }
}
exit $LASTEXITCODE
