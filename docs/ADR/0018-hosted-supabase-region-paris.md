# ADR-0018 — Hosted Supabase project in eu-west-3 (Paris)

**Status:** Accepted (2026-10-25, founder). Amends decision D-04 (eu-central-1, Frankfurt) in DEPLOYMENT §1.

**Context.** The first hosted project was created in eu-west-1 (Ireland) by mistake and deleted while still empty. The replacement was requested in Frankfurt but was provisioned in **eu-west-3 (Paris)** (project ref `wmgeugsqblwnhnqnczab`, Postgres 17, free plan). A project's region cannot be changed later; the project already holds the schema (no user data).

**Decision.** Keep Paris. It is an EU region like Frankfurt, so the data-residency and KVKK cross-border-transfer questions are identical (SECURITY §8, counsel ⚖); latency from Ankara is in the same range (to be measured, not assumed). Frankfurt stays the preference for any future separate production project.

**Consequences.** + No re-creation churn; the schema is already applied and verified. − Latency is not measured yet (ROADMAP risk list: "measure"). − If a separate production project is created later, staging and production would sit in different regions unless this one is replaced.
