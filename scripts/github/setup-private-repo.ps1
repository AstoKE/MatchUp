<#
.SYNOPSIS
  Prepares (and, with -Apply, creates) the PRIVATE GitHub repository for this project.

.DESCRIPTION
  Safe by default: without -Apply it only runs the pre-flight checks and prints the commands.
  It never reads, prints or stores credentials: authentication is done once by you with
  `gh auth login`. See docs/GITHUB_SETUP.md.

.EXAMPLE
  . .\scripts\android\env.ps1                 # puts the portable gh on PATH
  .\scripts\github\setup-private-repo.ps1 -Owner my-account            # dry run
  .\scripts\github\setup-private-repo.ps1 -Owner my-account -Apply     # create + push + settings
#>
param(
  [Parameter(Mandatory = $true)][string]$Owner,
  [string]$Name = 'matchup',
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

function Fail([string]$message) { Write-Host "STOP: $message" -ForegroundColor Red; exit 1 }
function Step([string]$message) { Write-Host "`n== $message" -ForegroundColor Cyan }

Step 'Pre-flight'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail 'gh not found. Run: . .\scripts\android\env.ps1' }
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { Fail 'GitHub CLI is not authenticated. Run: gh auth login --hostname github.com --git-protocol https --web --scopes "repo,workflow"' }
if ((git status --porcelain).Length -gt 0) { Fail 'Working tree is not clean.' }
if ((git branch --show-current) -ne 'main') { Fail 'Not on branch main.' }
if ((git remote).Length -gt 0) { Fail 'A remote already exists; refusing to continue.' }

$bad = git ls-files | Where-Object { $_ -match '(^|/)\.env($|\.)' -and $_ -notmatch '\.example$' -or $_ -match '\.(pem|p12|p8|jks|keystore)$' -or $_ -match '(google-services\.json|GoogleService-Info\.plist)$' }
if ($bad) { Fail "Tracked files that look like secrets: $($bad -join ', ')" }

Write-Host 'Running pnpm check ...'
pnpm check | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'pnpm check failed.' }

Write-Host 'Scanning full git history with gitleaks (Docker) ...'
docker run --rm -v "${repoRoot}:/repo" zricethezav/gitleaks:latest detect --source /repo --config /repo/.gitleaks.toml --log-opts="--all" --no-banner --redact | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'gitleaks found potential secrets in history.' }
Write-Host 'Pre-flight OK' -ForegroundColor Green

$full = "$Owner/$Name"
$commands = @(
  "gh repo create $full --private --description 'MatchUp (working name) - sports community app' --source . --remote origin",
  'git push -u origin main'
)
Step 'Planned commands'
$commands | ForEach-Object { Write-Host "  $_" }

if (-not $Apply) { Write-Host "`nDry run only. Re-run with -Apply to execute." -ForegroundColor Yellow; exit 0 }

Step 'Create repository and push'
gh repo create $full --private --description 'MatchUp (working name) - sports community app' --source . --remote origin
if ($LASTEXITCODE -ne 0) { Fail 'Repository creation failed (insufficient permissions or name taken). Nothing was pushed.' }
git push -u origin main
if ($LASTEXITCODE -ne 0) { Fail 'Push failed.' }

Step 'Repository settings'
gh api -X PATCH "repos/$full" -f delete_branch_on_merge=true -f allow_squash_merge=true -f allow_merge_commit=false -f allow_rebase_merge=true | Out-Null
gh api -X PUT "repos/$full/vulnerability-alerts" 2>$null
gh api -X PUT "repos/$full/automated-security-fixes" 2>$null
gh api -X PUT "repos/$full/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false | Out-Null

$protection = @{
  required_status_checks = @{ strict = $true; contexts = @('Typecheck, lint, unit tests, builds, audit', 'Secret scan', 'Database (migrations, pgTAP, API integration, type drift)', 'Web E2E (Playwright + axe, against the local Supabase stack)') }
  enforce_admins = $false
  required_pull_request_reviews = @{ required_approving_review_count = 0; dismiss_stale_reviews = $true }
  restrictions = $null
  required_linear_history = $true
  allow_force_pushes = $false
  allow_deletions = $false
  required_conversation_resolution = $true
} | ConvertTo-Json -Depth 6
$protection | gh api -X PUT "repos/$full/branches/main/protection" --input - | Out-Null
Write-Host "Done. Watch the first CI run with: gh run watch --repo $full" -ForegroundColor Green
