# DinkAndLadder Project Status

## Current State

Repository bootstrap and Liquibase foundation are in place. No domain/feature code exists yet.

No production implementation should be assumed complete beyond what this file states.

## Current Objective

Prepare the project and then implement MVP in strict order.

## First Implementation Sequence

1. Repository/bootstrap structure
2. Liquibase infrastructure
3. Core database foundation
4. Authentication
5. Player Profiles
6. Club Management
7. Match Submission
8. Match Verification
9. Rating Engine
10. Rankings

## Status Legend

- NOT STARTED
- IN PROGRESS
- BLOCKED
- COMPLETE

## Current Items

- Project bootstrap (P0-001): COMPLETE
- Liquibase setup (P0-002): COMPLETE
- Core tooling (P0-003 — lint/format/Vitest/Playwright config): COMPLETE
- CI skeleton (P0-004): COMPLETE (authored and locally validated; not yet run on GitHub Actions — needs a push)
- Core database (users, oauth_accounts, user_devices): COMPLETE (schema authored; not yet applied to a live database)
- MVP-001 Authentication: IN PROGRESS (code complete and locally verified; blocked on a real Supabase project for genuine end-to-end sign-up/login verification)
- MVP-002 Player Profiles: NOT STARTED
- MVP-003 Club Management: NOT STARTED
- MVP-004 Match Submission: NOT STARTED
- MVP-005 Match Verification: NOT STARTED
- MVP-006 Rating Engine: NOT STARTED
- MVP-007 Rankings: NOT STARTED

## Notes on Completed Work

### Project bootstrap (P0-001)
- `apps/web`: Nuxt 3.21.11 / Vue 3 / TypeScript app, `@nuxtjs/tailwindcss` module configured. Verified with a clean `npm install` and `npm run build`.
- `apps/mobile`: placeholder only (Flutter not yet initialized; deferred to Phase 6 per backlog).
- `apps/web/tests/{unit,integration,e2e}`: empty structure per `/docs/08-TESTING-STRATEGY.md`. Test runner configuration is P0-003, not done here.
- Root `package.json` (npm workspaces) and root `.gitignore` added.

### Liquibase setup (P0-002)
- `database/liquibase/db.changelog-master.xml` includes one changelog per domain, matching `/docs/05-DATABASE-BLUEPRINT.md`'s module structure (001-core through 008-security).
- Each domain changelog is currently empty — changesets are added when that domain's backlog item starts, not before.
- `database/liquibase/liquibase.properties` holds no credentials; connection details are supplied via `LIQUIBASE_COMMAND_URL`/`_USERNAME`/`_PASSWORD` env vars (see `database/.env.example` and `database/liquibase/README.md`).
- The Liquibase CLI itself is not installed in this environment (Java-based tool, not npm); README documents installation options. Running an actual `liquibase update` against a real database is deferred to the "Core database foundation" step next.

### Core tooling (P0-003)
- ESLint via the official `@nuxt/eslint` module (flat config, `eslint.config.mjs`), composed with `eslint-config-prettier` so lint and format rules don't conflict.
- Prettier configured (`.prettierrc.json`, `.prettierignore`) with `format` / `format:check` scripts.
- TypeScript typecheck script (`npm run typecheck`) calls `vue-tsc` directly against the generated `.nuxt/tsconfig.json` rather than `nuxt typecheck` — the `nuxt` package's own CLI dependency (`@nuxt/cli@^3.37.0`) has drifted ahead of the pinned Nuxt 3.21.11 framework and expects a newer (Nuxt 4-style) multi-tsconfig project layout that 3.21.11 doesn't generate, so `nuxt typecheck` fails on a version-skew bug upstream. Worth re-checking when Nuxt 3 gets a patch release, but not worth blocking on.
- Also had to fix `apps/web/tsconfig.json`: `nuxi init` originally scaffolded it for Nuxt 4's four-way project-reference split (`tsconfig.app/server/shared/node.json`), which Nuxt 3.21.11 never generates. Replaced with the standard Nuxt 3 form (`{ "extends": "./.nuxt/tsconfig.json" }`).
- Vitest (`vitest.config.ts`, `happy-dom` environment) with one smoke test at `tests/unit/smoke.spec.ts`. Deliberately not using `@nuxt/test-utils`'s `defineVitestConfig` helper — both its 4.x and Nuxt-3-targeted 3.23.0 releases hit the same tsconfig version-skew issue as above. Plain Vitest is sufficient for the service/validation/mapper-level unit tests the testing strategy prioritizes; revisit if a later test genuinely needs the Nuxt runtime (e.g. mounting components).
- Playwright (`playwright.config.ts`) with one smoke test at `tests/e2e/smoke.spec.ts`, `webServer` wired to `npm run preview`. Chromium browser binary installed and verified locally.
- All verified together from a single clean root-level `npm install`: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run build` + `npm run test:e2e` all pass with 0 vulnerabilities reported.
- Root/workspace note: only one `package-lock.json` now exists, at the repo root (npm workspaces). An earlier pass accidentally left a second lockfile inside `apps/web/`; that's been removed — don't recreate it by running `npm install` from inside `apps/web` for whole-repo dependency changes, run it from the repo root instead.

### Core database foundation
- `database/liquibase/001-core/001-core.changelog.xml`: `users`, `oauth_accounts`, `user_devices` tables per `/docs/05-DATABASE-BLUEPRINT.md` — UUID PKs (`gen_random_uuid()`, native in Postgres 13+, no extension needed), `timestamptz` audit columns, `users.email` unique, `oauth_accounts` unique on `(provider, provider_user_id)`, FK + index from both child tables to `users(id)`.
- `database/liquibase/008-security/008-security.changelog.xml`: RLS enabled on all three tables with owner-only policies keyed on `auth.uid()` (Supabase's session-identity function), per `/docs/07-SECURITY-ARCHITECTURE.md`'s RLS requirement. `users` gets SELECT/UPDATE-own only (no self-service DELETE); `oauth_accounts`/`user_devices` get full self-service (FOR ALL) since a player should be able to register/view/remove their own linked accounts and devices outright.
- Architectural decision (not one of the four OPEN ADRs, but worth recording): `users.id` is an independent UUID, **not** a hard FK to Supabase's internal `auth.users(id)`. A FK into the `auth` schema would tie the schema to Supabase specifically and break the RDS/Aurora portability goal in `/docs/09-DEVOPS-ARCHITECTURE.md`; the auth provider's identity is expected to line up with this `id` by application-level convention (set during profile provisioning in MVP-001), not by database constraint.
- Validation: XML well-formedness and changeSet/tag balance checked programmatically. **Not yet run against a live database** — no local Postgres/Docker in this environment, and RLS policies use `auth.uid()`, which only exists on a real Supabase-provisioned Postgres. Running `liquibase update` against an actual dev database (per `database/liquibase/README.md`) is the next real checkpoint, and worth doing before MVP-001 starts building on top of these tables.

### CI skeleton (P0-004)
- `.github/workflows/ci.yml`, two jobs, both on `ubuntu-latest`, triggered on push to `main` and on pull requests:
  - **web**: `npm ci` → lint → typecheck → unit tests → install Playwright's Chromium binary → build → e2e tests (uploads the Playwright HTML report as an artifact on failure). Matches the minimum CI checks in `/docs/09-DEVOPS-ARCHITECTURE.md` (install, lint, typecheck, unit, Playwright, build). Integration tests are omitted from CI for now since none exist yet ("where configured" — none are).
  - **database**: spins up an ephemeral `postgres:16` service container, stubs a minimal `auth.uid()` function via `psql` (plain Postgres has no `auth` schema — only real Supabase projects do — but the 008-security RLS policies reference `auth.uid()` since that's what runs in production; the stub is CI-only, lives in the workflow file, and is never part of the versioned Liquibase changesets, so it's never at risk of running against a real Supabase database), installs the Liquibase CLI via the official `liquibase/setup-liquibase@v3` action (pinned to Liquibase `4.32.0`/`community` — deliberately kept below 5.0, since Liquibase 5.0+ Community dropped bundled DB drivers and would need an extra Liquibase Package Manager step to add the PostgreSQL driver back), then runs `liquibase update` against it using the same `LIQUIBASE_COMMAND_URL`/`_USERNAME`/`_PASSWORD` env var convention documented in `database/liquibase/README.md`. This is the first thing that will actually execute the Core database foundation changesets end-to-end.
- Validated locally: YAML parses correctly (via `js-yaml`) and the job/step structure was inspected programmatically. **Not yet run on GitHub Actions** — that requires a push to the `origin` remote (`github.com/JeffJaspe/DinkAndLadder`), which wasn't done since pushing is a shared/visible action I don't take without being asked.

### MVP-001 Authentication
Per `/docs/15-AUTHENTICATION-SPECIFICATION.md`: Supabase Auth is the provider, "Authentication identity maps to an application `users` record," and sessions must not be duplicated in application tables. Scope for this pass matches `/docs/03-MVP-SCOPE.md`: email/password, OAuth-ready architecture, session-aware API, login/register UI.

- **Dependency added**: `@nuxtjs/supabase` (official Nuxt module) — handles the client/server Supabase clients, cookie-based session sync, and route-level auth redirects (`redirectOptions.login = '/login'`, `.callback = '/confirm'`, `.exclude = ['/', '/register']`). Chosen over hand-rolling JWT verification because it verifies tokens via Supabase's own `getClaims()` rather than a custom implementation, and is purpose-built for exactly this Nuxt+Supabase pairing (parallel to how `@nuxtjs/tailwindcss` was the natural choice earlier).
- **Identity domain** (`apps/web/server/domains/identity/`): `dto/user.dto.ts` (`UserRecord`/`UserDto`, snake_case fields matching the `/docs/06-API-CONTRACTS.md` convention), `repositories/user.repository.ts` (`findByAuthId`, `upsertFromAuthIdentity` — interface + Supabase-backed implementation, injectable for testing), `services/auth.service.ts` (`provisionSession`, `getCurrentUser` — pure, no direct Supabase dependency).
- **Controllers** (`apps/web/server/api/v1/auth/`): `session.post.ts` (authenticates via `serverSupabaseUser`, then provisions/updates the `users` row via the **service-role** client — necessary because `users` has no INSERT RLS policy, and provisioning a brand-new row must bypass RLS; only ever called from this trusted server context, never shipped to the client) and `me.get.ts` (reads via the **user-scoped** client instead, so the `users_select_own` RLS policy is a second, independent enforcement layer on top of the app-level check — not just the service-role bypass). `server/utils/api-error.ts` gives both a consistent `{code, message, details, trace_id}` error shape per the API contracts doc.
- **UI**: `pages/login.vue`, `pages/register.vue` (Supabase `signInWithPassword`/`signUp` directly from the client, which is what "delegated to the configured auth provider" means in practice), `pages/confirm.vue` (email-confirmation callback target — provisions the session once Supabase resolves the code, then redirects to `/dashboard`), `pages/dashboard.vue` (minimal authenticated placeholder reading `GET /api/v1/auth/me`). `pages/index.vue` got a "Log in" link.
- **Local/CI runtime config**: without *some* `NUXT_PUBLIC_SUPABASE_URL`/`_KEY` value, `@nuxtjs/supabase` throws on boot. Added `apps/web/.env` (gitignored, placeholder values only) for local runs and job-level env vars in `.github/workflows/ci.yml`'s `web` job for the same reason. Real values go in `apps/web/.env` locally (see `apps/web/.env.example`) once a Supabase project exists.
- **Tests**: `tests/unit/auth.service.spec.ts` — 4 tests against a fake in-memory repository (new-user provisioning, idempotent re-provisioning, not-yet-provisioned lookup, provisioned lookup). `tests/e2e/auth.spec.ts` — 4 Playwright tests: login/register page structure, and (genuinely meaningful, not just structural) confirmation that visiting `/dashboard` while signed out redirects to `/login` via the module's real redirect middleware.
- **Validated locally**: `typecheck`, `lint`, `format:check`, `test:unit` (9/9 passing including the pre-existing smoke tests), `build`, `test:e2e` (9/9 passing) — all green.
- **What's genuinely NOT verified — no live Supabase project exists**: actual `signUp`/`signInWithPassword` against Supabase Auth, the email-confirmation flow reaching `/confirm`, `session.post.ts`'s upsert actually hitting a real `users` table, and `me.get.ts`'s RLS-scoped read. All of the *code* for these paths is written and reviewed, but "reads correctly" is not the same claim as "runs correctly against a real backend." Creating a Supabase project (or running its local dev stack) and exercising signup → confirm → dashboard → logout by hand is the real acceptance test for this feature, and hasn't happened yet.

## Next Up

Before marking **MVP-001 Authentication** COMPLETE (not just IN PROGRESS):
1. Stand up a real Supabase project (or its local CLI/dev stack), apply the Core database foundation changesets to it, and set real values in `apps/web/.env`.
2. Manually walk the register → confirm-email → dashboard → logout path and fix whatever that first live run surfaces — nothing this environment could exercise end-to-end has actually been run end-to-end.
3. Push/commit so the CI workflow runs for real on GitHub Actions at least once — still only validated locally (YAML parse + structural check), never executed.

After that: **MVP-002 Player Profiles** is next (`player_profiles` maps from `users`, per `/docs/15-AUTHENTICATION-SPECIFICATION.md`'s "Application User" section).

Claude should update this file after completing a backlog item.
