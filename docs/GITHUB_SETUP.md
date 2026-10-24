# GitHub setup (private repository)

Status 2026-10-25: **not created.** The GitHub CLI is installed (portable, checksum-verified, `C:\dev\tools\gh`) but is **not authenticated**, and I will not assume or request credentials in chat. Everything below is ready to run once you have signed in. Nothing here pushes secrets: the full history was scanned with gitleaks (clean; four synthetic test fixtures are allow-listed by exact value in `.gitleaks.toml`), `.env*` files and `supabase/.temp` are git-ignored, and `settings.json` / `image.png` are excluded locally (`.git/info/exclude`).

## 1. What I need from you (one time)

1. A GitHub account or organization that will own the repo (`<owner>` below).
2. Sign in locally — this opens a browser and stores the token in your OS credential store; I never see it:

```powershell
. .\scripts\android\env.ps1          # puts C:\dev\tools\gh\bin on PATH for this session
gh auth login --hostname github.com --git-protocol https --web --scopes "repo,workflow"
gh auth status
```

3. Tell me the owner name (and whether it is a personal account or an organization — see §5), and say "create the repo". Repository creation and the first push are outward-facing, so I will wait for that explicit go-ahead.

## 2. Create and push (what the script does)

`scripts/github/setup-private-repo.ps1 -Owner <owner> [-Name matchup] [-Apply]` — without `-Apply` it only prints what it *would* do and runs the pre-flight checks.

Pre-flight (all must pass, else it stops): `gh auth status` OK · working tree clean · on `main` · no remote yet · `pnpm check` green · gitleaks over the full history clean (Docker) · no tracked file matches `.env*`, `*.pem`, `*.p12`, `*.keystore`, `google-services.json`, `GoogleService-Info.plist`.

Then:

```powershell
gh repo create <owner>/matchup --private --description "MatchUp (working name) - sports community app" --source . --remote origin
git push -u origin main
```

## 3. Repository settings to apply (also scripted behind `-Apply`)

| Setting | Value | Why |
|---|---|---|
| Visibility | **private** | pre-launch; legal text is draft |
| Default branch | `main` | |
| Branch protection on `main` | require PR + 1 review (self-review allowed while solo), required checks **`quality`, `secret-scan`, `database`, `e2e-web`**, linear history, block force-push and deletion, require conversation resolution | CI is the release gate (TESTING §4) |
| Actions → workflow permissions | read-only default token (`permissions: contents: read` is already in `ci.yml`) | least privilege |
| Actions → allowed actions | GitHub-owned + `pnpm/action-setup`, `gitleaks/gitleaks-action`, `actions/*` | supply-chain |
| Dependabot alerts + security updates | on (`.github/dependabot.yml` already groups Expo packages) | audit |
| Secret scanning + push protection | on **if available** (private repos need GitHub Advanced Security on personal plans) | defense in depth next to gitleaks in CI |
| Auto-delete head branches | on | hygiene |

## 4. Secrets and environments

CI needs **no secrets** today: it uses placeholder public values and a local Supabase stack inside the runner. Add secrets only when a milestone needs them, never before:

| Secret | Needed from | Notes |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID` | hosted staging (P2-M6) | for `supabase db push` in a *manually approved* deploy workflow, GitHub Environment `staging` with required reviewers |
| `SENTRY_AUTH_TOKEN` | when source maps are uploaded | build-time only |
| `EXPO_TOKEN` | EAS builds | never in client code |
| `GITLEAKS_LICENSE` | only if the owner is an **organization** | free for personal accounts |

## 5. First CI run — what to expect and what is unverified

`ci.yml` is actionlint-clean and every step has been executed locally (fresh clone), but **it has never run on GitHub**. Likely first-run friction, in order of probability: (1) `gitleaks-action` licensing if `<owner>` is an organization; (2) the `e2e-web` job downloading Playwright browsers with `--with-deps` (apt) — slower, not wrong; (3) `database`/`e2e-web` pulling Supabase images (several minutes, cached afterwards); (4) the pnpm `hoisted` linker (ADR-0015) — covered by the same lockfile. I will watch the first run with `gh run watch` and fix whatever it reveals; results go into the next report.

## 6. Android CI

Native builds are **not** in CI yet (Gradle + emulator on hosted runners is slow and flaky without KVM acceleration; GitHub's Linux runners do support KVM). Plan: a separate, manually triggered workflow that builds the debug APK and runs the Maestro suite on an `ubuntu-latest` emulator, added once the local suite is stable (see ANDROID_SETUP.md §8).
