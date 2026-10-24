# ADR-0010 — Store identifiers and temporary branding

**Status:** Accepted 2026-10-24 (D-05 confirmed): Phase 1 uses a **clearly temporary development identifier**, not a production one. See "Temporary identifiers" below.

**Context.** "MatchUp" is a working name and a common one (trademark conflicts and domain availability unknown). Some identifiers are effectively permanent once published: iOS bundle identifier, Android application id, URL scheme/associated domains, Expo/EAS project slug and owner, Supabase project name/ref (renamable but embedded in URLs), the public web domain used in deep links and emails.

**Decision.**
1. Keep **all display branding** (name, tagline, logo, colors, contact, URLs, social metadata) in `packages/config` and i18n resources. No other source file contains the product name (CI grep). Domain logic, database schema and table names never contain the brand name.
2. Use stable technical identifiers (`matchup` workspace/package names are internal and renamable by search/replace).
3. Before creating the Expo app: **choose and own a domain**, derive the reverse-DNS application id from it (e.g. `com.<owned-domain>.<slug>`), run a basic trademark/App Store/Play name availability search. If that is not possible yet, use a clearly temporary development-only id (e.g. `dev.local.matchup`), and treat it as **non-publishable**: the first store submission requires final identifiers, which means a new store listing if they differ.
4. Public URLs in emails/deep links come from config (`PUBLIC_WEB_URL`), never literals.

**Consequences.** Renaming the product before launch is a config + asset change; renaming after publication requires new store listings, deep-link domain migration and user communication. This ADR makes that cost explicit so the decision is deliberate.

## Temporary identifiers (Phase 1, confirmed D-05)

| Item | Temporary value | Why |
|---|---|---|
| iOS bundle identifier / Android application id | `com.example.matchup.dev` | `example.com` is a reserved documentation domain: nobody owns it, Google Play rejects `com.example.*`, so the id **cannot be accidentally published** |
| URL scheme | `matchup-dev` | dev-only deep links |
| Expo `slug` / package names | `matchup` (internal only) | renamable |
| Web URL | `http://localhost:8081` (dev) | from `PUBLIC_WEB_URL` config |

All of them are read from `packages/config` / `app.config.ts`; changing them to final values is a configuration change plus new native builds (and new store listings if anything was ever published). **Before the first store submission or TestFlight/Play internal release, final identifiers must be chosen and this ADR superseded.** The provisional logo (`image.png`) is stored as a placeholder asset; its palette is **not** final.
