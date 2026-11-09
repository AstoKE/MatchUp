# GitHub setup (private repository)

Status 2026-10-25: **connected.** The private repo is `AstoKE/MatchUp` (personal account; it was created on 2026-10-24 with the Phase 1 history, and `main` was fast-forwarded to the Phase 2 history on 2026-10-25). `gh` is signed in by the founder (token in the Windows credential store); git uses it through a **repo-local** credential helper (`credential.https://github.com.helper` in `.git/config`, which resets the global Git Credential Manager for github.com only). Nothing here pushes secrets: the full history was scanned with gitleaks (clean; four synthetic test fixtures are allow-listed by exact value in `.gitleaks.toml`), `.env*` files and `supabase/.temp` are git-ignored, and `settings.json` / `image.png` are excluded locally (`.git/info/exclude`).

Applied settings: squash + rebase merges only, head branches deleted on merge, read-only default workflow token, Dependabot alerts and security updates on. **Branch protection is not available**: GitHub requires Pro (or a public repo) for protection rules and rulesets on private repos (API answers 403). Decision (founder, 2026-10-25): stay on the free plan and keep the discipline by convention: every change goes through a branch + PR and is merged only when the four CI checks are green. If the plan changes, the protection block at the end of the setup script applies the rules below.

Sections 1–2 describe the original one-time setup and are kept for re-creating the repo elsewhere.

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
| Actions → allowed actions | GitHub-owned + `pnpm/action-setup`, `actions/*` (gitleaks runs as a pinned, checksum-verified CLI, not an action) | supply-chain |
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

First runs on GitHub (2026-10-24, Phase 1 history): `quality`, `database` and `e2e-web` **passed** on `ubuntu-latest`. `secret-scan` failed without finding anything: `gitleaks/gitleaks-action@v2` scans `<first pushed commit>^..HEAD`, and the first push contained the root commit, which has no parent ("no leaks found in partial scan", then exit 1). Fix: the job now downloads a pinned gitleaks release, verifies its SHA-256 and scans the full history itself. Dependabot's npm job also reports failure: it cannot move Expo-pinned packages (`react`, `react-native-gesture-handler`, …), which is expected; those are upgraded with `npx expo install --fix` during an SDK upgrade, not by Dependabot.

## 5b. Local CI, while GitHub Actions minutes are exhausted

Decision (founder, 2026-11-09): stay on the free plan without paying for extra minutes. The free plan includes about 2,000 Linux minutes a month; November's were used up on 2026-11-08, and the quota resets on the 1st. While the quota is used up, Actions does not start the jobs at all ("recent account payments have failed or your spending limit needs to be increased"), and nothing is charged.

**The rule then:** a PR is merged when **`pnpm ci:local` passes on its last commit** and its report is posted on the PR (`pnpm ci:local --comment <PR>`), instead of the four GitHub checks. Once the quota is back, GitHub's checks are the rule again.

What `scripts/ci/local-ci.mjs` does, and why it is not the same as running the gates in the working copy:
- It checks out the **committed HEAD** into a temporary git worktree and installs with `--frozen-lockfile`. A file that was never committed fails there, as in CI. Uncommitted changes are not part of the run.
- It runs the **quality job** step by step, the same commands as `ci.yml`:
  - typecheck, lint, format, brand, script tests, unit and component tests;
  - web export, bundle secrets and size;
  - the native compile (`--skip-native` leaves it out);
  - expo-doctor, audit.
- It runs the **secret scan** with the same gitleaks version, as a container, over the full history.
- The **database** job stops the local stack **without a backup** and starts it empty, so every migration and seed runs as in CI. Then it runs pgTAP, integration, and the type-drift check. Local development data is lost; hosted is never touched.
- It runs **E2E** with a local env written inside the worktree only.
- Steps run one at a time (this laptop's memory), so the whole run takes about 20 minutes.
- The exit code is 0 only if every step exited 0. Logs and the report are kept in a temp folder, whose path is printed.

What it cannot replace: a second machine. A result that depends on this laptop (an installed tool, a cache) would not show. The pinned versions (`.nvmrc`, `packageManager`, gitleaks) keep that small.

To use fewer minutes once they are back:
- Dependabot opens its PRs monthly and grouped (`.github/dependabot.yml`);
- `ci.yml` already cancels a run when the same branch is pushed again.

## 6. Android CI

Native builds are **not** in CI yet (Gradle + emulator on hosted runners is slow and flaky without KVM acceleration; GitHub's Linux runners do support KVM). Plan: a separate, manually triggered workflow that builds the debug APK and runs the Maestro suite on an `ubuntu-latest` emulator, added once the local suite is stable (see ANDROID_SETUP.md §8).
