# DinkAndLadder Project Status

## Current State

All seven MVP items (Authentication through Rankings) are COMPLETE and live-verified against the real Supabase database. The full MVP feature set from `/docs/03-MVP-SCOPE.md` is implemented.

No production implementation should be assumed complete beyond what this file states.

## Current Objective

Address post-MVP gaps identified in the documentation audit (see bottom of this file), then proceed to Phase 2 backlog items per `/docs/10-IMPLEMENTATION-BACKLOG.md`.

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
- MVP-001 Authentication: COMPLETE — verified live twice: once by an automated real-browser walkthrough, once by the user manually registering with a real email through the actual confirmation-email flow.
- MVP-002 Player Profiles: COMPLETE for the in-scope fields (several spec bullets explicitly deferred — see below) — verified live via the same walkthrough.
- MVP-003 Club Management: COMPLETE — verified live: create/join/approve/leave all actually ran against the real database, and a real bug (RLS recursion) was found and fixed in the process.
- MVP-004 Match Submission: COMPLETE — verified live (singles match submitted and read back by both participants against the real database), first try, no bugs — see below for why.
- MVP-005 Match Verification: COMPLETE — verified live: confirm/reject/dispute paths and all guard rails (re-decision after finalization, submitter can't act as their own verifier) ran against the real database. A real bug was found and fixed in the process (see below).
- MVP-006 Rating Engine: COMPLETE for the interim algorithm scope (initial-rating questionnaire still BLOCKED, see below) — verified live: a real singles match was submitted, verified, and correctly triggered a rating recalculation for both players against the real database.
- MVP-007 Rankings: COMPLETE for the interim eligibility scope (see below) — verified live: `GET /api/v1/rankings` correctly ordered/ranked the two seeded test-account ratings against the real database.

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
- **Verified live** (see "The real end-to-end walkthrough" section below): `signUp`/`signInWithPassword` against real Supabase Auth, `session.post.ts`'s upsert against the real `users` table, `me.get.ts`'s RLS-scoped read — all confirmed by an automated real-browser walkthrough. The real signup + email-confirmation flow (`/register` → real email → click link → `/confirm`) was additionally confirmed by the user testing it by hand with a real inbox.

### MVP-002 Player Profiles
Per `/docs/14-PLAYER-PROFILE-SPECIFICATION.md` and `/docs/03-MVP-SCOPE.md`. This pass deliberately covers a real, coherent subset rather than every bullet — each omission below is blocked on something concrete, not just skipped:

- **Delivered**: `player_profiles` table (`display_name` required, `first_name`/`last_name`/`bio`/`dominant_hand`/`preferred_position` optional, `province`/`city`, `profile_visibility` — `public`/`private`, defaults to `public`), one profile per user (`user_id` unique FK to `users`). Repository/service/controllers/UI for viewing (`GET /api/v1/players/{playerId}`, `GET /api/v1/players/me`) and editing (`PATCH /api/v1/players/me`, upserts on first save). Pages: `pages/profile/edit.vue` (protected) and `pages/players/[playerId].vue` (public).
- **Deferred — Location as normalized lookup tables**: the blueprint's `province_id`/`city_id` reference the `provinces`/`cities` supporting tables, which don't exist and have no seed data (real Philippine geographic reference data, not something to fabricate here). Used plain `province`/`city` text columns instead. Revisit if/when location-based search or filtering becomes a real requirement — that's what would actually need normalization.
- **Deferred — Profile photo**: needs Supabase Storage (buckets, upload flow) and, per the blueprint, a shared `media_files` table (also referenced by the *club logo* field in MVP-003's `clubs` table — worth building once, when the first of those two features actually needs it, not speculatively now).
- **Deferred — Notification preferences**: the spec's Profile Management section lists this, but the Notification domain itself is Phase 2 (`/docs/10-IMPLEMENTATION-BACKLOG.md`) — no tables, no domain exist yet. Building preferences for a domain that doesn't exist would be exactly the kind of half-finished implementation to avoid.
- **Deferred — Club membership visibility**: depends on MVP-003 Club Management, which hasn't started.
- **Privacy**: `profile_visibility` is real row-level enforcement (RLS: owner can always manage their own row; `FOR SELECT USING (profile_visibility = 'public')` covers everyone else), not just a cosmetic field. Nothing sensitive (email, phone, auth status) ever entered `player_profiles` in the first place — that stays in `users` — so there was no need for field-level DTO splitting between "public" and "private" views, only a row-visibility check.
- **Note on client scoping**: unlike Identity's `session.post.ts`, nothing here needed the service-role client — every write is the caller managing their own row, and the `player_profiles_manage_own` self-service RLS policy (mirroring `oauth_accounts`/`user_devices`'s pattern) covers it. Least-privilege by construction, not by extra application code.
- **Tests**: `tests/unit/player-profile.service.spec.ts` — 5 tests (not-yet-created lookup, create-on-first-save, update-in-place on second save, lookup-by-profile-id, unknown-id lookup). `tests/e2e/player-profile.spec.ts` — 2 Playwright tests: the editor redirects to `/login` when signed out, and the public profile route is reachable without signing in (route-exclusion check, not a real render — see below).
- **Validated locally**: `typecheck`, `lint`, `format:check`, `test:unit` (10/10), `build`, `test:e2e` (7/7) — all green.
- **Verified live**: real `player_profiles` rows were created and read back for real during the walkthrough below (both test accounts set a display name that round-tripped correctly).

### MVP-003 Club Management
Per `/docs/13-CLUB-MANAGEMENT-SPECIFICATION.md` and `/docs/03-MVP-SCOPE.md`.

- **Delivered**: `clubs` (name/slug-unique/description/province/city text/visibility/status, creator FK) and `club_memberships` (role: `OWNER`/`ADMIN`/`MODERATOR`/`MEMBER`; status: `pending`/`active`/`rejected`/`left`; a partial unique index enforces at most one *live* — pending or active — membership per club/player pair, while still allowing historical rows from past stints). Create club (creator becomes `OWNER`/`active` immediately), view club, request to join (self-service, always starts `pending`), leave (self-service, blocked for the `OWNER`), list roster (active members only), and the full admin action set (approve/reject/role-change/remove) behind an **explicit, written-out permission matrix** (spec: "Exact permission matrix must be implemented explicitly") — see the doc comment at the top of `club.service.ts`. `MODERATOR` is recognized as a role but granted no additional permissions; the spec never defines what one can do, so nothing here invented it. "My Clubs" listing added (`GET /api/v1/clubs/mine`) to power that UI screen, distinct from Phase-2 club discovery/search (not built).
- **Deferred, same rationale as MVP-002**: normalized location (free-text `province`/`city` again, no geo reference tables), club logo (needs the same Storage + shared `media_files` work as profile photos — worth doing once for both), club deletion (spec explicitly wants "a safe lifecycle rather than destructive cascading" and doesn't define what that lifecycle is — inventing one wasn't in scope).
- **RLS design choice, worth flagging**: unlike Identity/Player, this domain's authorization is genuinely relational (does *this* caller have authority over *that other* row?), not just row ownership. Rather than write correlated-subquery RLS policies for the approve/reject/role-change/remove/list-roster paths — high risk of a subtle bug with no live database in this environment to catch it against — those all go through the **service-role** client from the server, with `ClubService` checking the caller's own membership role first. RLS still fully covers the safe self-service paths (create-as-owner, request-to-join-as-pending, self-leave, see-your-own-row). See the comment block above the club policies in `008-security`.
- **Cross-domain dependency, by design**: creating a club or requesting to join requires an existing `player_profiles` row — the controllers resolve `auth user → player profile id` via the Player domain's own repository (a defined interface, not a raw reach into `player_profiles`), and return a clear `PLAYER_PROFILE_REQUIRED` error if none exists yet. This is the Club→Player domain boundary the architecture doc asks for, not a shortcut around it.
- **UI**: `pages/create-club.vue`, `pages/clubs/[clubId].vue` (view, join, roster, inline admin actions), `pages/my-clubs.vue`. Same route-exclusion pattern as `/players/[playerId]`: the dynamic club page needed a different top-level prefix than the protected create/mine pages so a single wildcard `exclude` pattern wouldn't have to choose between protecting or exposing both.
- **Tests**: `tests/unit/club.service.spec.ts` — 19 tests covering the full permission matrix (owner approves/rejects/promotes, admin can't touch other admins or grant admin, plain members can't manage anyone, owner can't be targeted or leave, self-targeting rejected, roster visibility, club-edit authorization, "my clubs" listing). `tests/e2e/club.spec.ts` — 3 tests (create/my-clubs redirect-when-signed-out, club detail page reachable signed-out).
- **Validated locally**: `typecheck`, `lint`, `format:check`, `test:unit` (29/29 across all domains), `build`, `test:e2e` (10/10) — all green. Also manually confirmed against the built server that `POST /api/v1/clubs` returns the expected `401 AUTH_REQUIRED` with the documented `{code, message, details, trace_id}` shape.
- **Verified live**: see "The real end-to-end walkthrough" section below — real create/join/approve/leave, plus a real RLS recursion bug found and fixed.

## Real Supabase project now exists

A live Supabase project's URL and publishable/anon key were provided and wired into `apps/web/.env` under the existing `@nuxtjs/supabase` convention (`NUXT_PUBLIC_SUPABASE_URL`/`NUXT_PUBLIC_SUPABASE_KEY`) — confirmed reachable (`/auth/v1/health` responded with GoTrue v2.195.0). This is a different setup than Supabase's own generic "connect" snippet suggests (raw `@supabase/supabase-js` + manual `runtimeConfig` + an `app.vue` todo-list demo) — that snippet was adapted to fit what's already built here, not pasted verbatim; no `todos` table or demo code was added.

Update: the service-role key has since been added (`NUXT_SUPABASE_SECRET_KEY`), both keys confirmed valid with a read-only REST introspection call, and **migrations have now been applied for real**.

### Migrations applied to the live database

Ran via the actual Liquibase CLI (4.32.0, downloaded fresh — not installed in this environment beforehand) against the real Postgres instance, not the earlier SQL-Editor fallback that was drafted but not used. Two connection details were needed beyond what Supabase's dashboard shows by default:
- **Direct connection** (`db.<ref>.supabase.co:5432`) resolves to an **IPv6-only** address; this environment has no IPv6 route, so that connection failed outright (`UnknownHostException`).
- The fix was Supabase's **session-mode pooler** connection string instead (`aws-0-ap-northeast-1.pooler.supabase.com:5432`, username `postgres.<project-ref>`) — IPv4, and explicitly the one Supabase's own dashboard labels "used for migrations." The transaction-mode pooler (port 6543, `pgbouncer=true`) was deliberately avoided — that mode can misbehave with DDL/prepared statements.
- The DB password contained `&`, which breaks Windows batch-script argument parsing if passed as a `--password=` CLI flag (cmd.exe treats `&` as a command separator). Passed purely via the `LIQUIBASE_COMMAND_PASSWORD` environment variable instead — Liquibase reads it directly, no shell parsing involved.

`liquibase status` first confirmed it saw exactly the 23 expected changesets across `001-core`/`002-player`/`003-club`/`008-security`, then `liquibase update` ran all 23 with zero errors. Confirmed independently via REST schema introspection: `users`, `oauth_accounts`, `user_devices`, `player_profiles`, `clubs`, `club_memberships` all exist, alongside Liquibase's own `databasechangelog`/`databasechangeloglock` tracking tables. This is the first time any of this session's schema has run against a real Postgres with real `auth.uid()` — no CI stub, no assumptions.

## The real end-to-end walkthrough happened, and found a real bug

Drove the actual app (dev server + a real headless browser, two isolated sessions) against the live database: two pre-confirmed test accounts (`claude-test-owner@example.com`, `claude-test-member@example.com`, created via Supabase's Admin API to skip email delivery) walked through register→login → player profile → create club → request to join → approve → confirm active membership → leave. **This is the first genuine confirmation that MVP-001/002/003 work end-to-end**, not just "the code reads correctly."

It also surfaced a real bug on the first attempt: creating a club returned `500 INTERNAL_ERROR`. The actual cause (only visible after fixing a separate gap — the club controllers' catch-alls were swallowing unexpected errors without logging them server-side, now fixed across all five club controllers) was Postgres `42P17`: **infinite recursion detected in policy for relation "club_memberships"**. `clubs_select_visible` (0008) and `club_memberships_insert_own` (0009) each contained a subquery against the *other* table, and a plain subquery re-triggers the target table's RLS — forming a cycle Postgres can't resolve. This is exactly the risk flagged in this session's own comments as "can't verify without a live database," and it was real.

**Fix** (`008-security` changesets 0010–0013, applied live, not editing the already-applied 0008/0009 — that would break Liquibase's checksums): two `SECURITY DEFINER` helper functions (`fn_is_club_creator`, `fn_is_active_club_member`) whose internal queries run outside the caller's row-security context, breaking the cycle without changing the actual authorization logic. Hit one more real issue getting there: Liquibase's default statement-splitter isn't dollar-quote-aware and cut each function body off at its first internal `;` ("Unterminated dollar quote") — fixed by isolating each `CREATE FUNCTION` into its own changeset with `<sql splitStatements="false">` (that attribute lives on `<sql>`, not `<changeSet>` — also learned the hard way). Re-ran the full walkthrough after the fix: complete success, including the departed member correctly losing roster access (403) after leaving — an intentional authorization check working as designed, not a bug.

**Net effect**: MVP-001, MVP-002, and MVP-003 have now each been verified against a real database with a real browser, for the first time. The permission matrix, the RLS self-service paths, the service-role admin paths, all of it — actually ran, not just typechecked.

### MVP-004 Match Submission
Per `/docs/12-MATCH-VERIFICATION-SPECIFICATION.md` (covers both submission and verification; this pass is submission only) and `/docs/03-MVP-SCOPE.md`.

- **Delivered**: `matches` (`match_type` singles/doubles, `status` covering the full suggested lifecycle `draft`/`submitted`/`pending_verification`/`verified`/`rejected`/`disputed` even though this pass only ever produces `submitted`, `venue` free text, `played_at`), `match_participants` (`team_number` 1/2, `result_status` pending/won/lost, unique per match+player), `match_scores` (per-set scores, unique per match+set). `POST /api/v1/matches` (submit) and `GET /api/v1/matches/{matchId}` (view). Service-layer validation of the one thing that's genuinely business logic here: singles needs exactly 2 participants (1 per team), doubles needs exactly 4 (2 per team), no duplicate players, the submitter must be one of the participants, at least one set score, no duplicate set numbers.
- **Deliberately not validated**: whether a submitted score is a *legal* pickleball result (e.g., games to 11, win by 2) — that's a real product rule nobody has decided yet, not something to invent.
- **Deferred**: `match_verifications` table and all verification/decision logic — that's MVP-005, and nothing in this pass reads or writes it, so it doesn't belong in this pass's schema.
- **Applied the clubs/club_memberships recursion lesson proactively**: rather than writing inline cross-table subqueries in the matches/match_participants/match_scores RLS policies (which is exactly what caused the MVP-003 bug), all three share one `SECURITY DEFINER` helper (`fn_is_match_participant`) from the start. Verified live on the first attempt — no recursion bug this time.
- **Writes go through service-role**, same reasoning as club admin actions: submitting a match inherently creates `match_participants` rows for *other* players, which no "manage your own row" RLS policy can express. `MatchService.submitMatch` checks the caller is actually one of the listed participants before the service-role bypass is used.
- **Known UX gap, not a bug**: there's no player-search feature yet (Phase 2), so the submission form asks the submitter to paste other players' profile IDs directly rather than searching by name. Functionally complete, genuinely clunky — worth revisiting once Phase 2 lands.
- **Tests**: `tests/unit/match.service.spec.ts` — 11 tests covering the validation rules above. `tests/e2e/match.spec.ts` — 2 redirect-guard tests.
- **Validated locally**: `typecheck`, `lint`, `format:check`, `test:unit` (40/40 across all domains), `test:e2e` (12/12, reusing the already-running dev server — a fresh `npm run build` wasn't re-run this pass since the dev server was left up intentionally for manual testing, see below).
- **Verified live**: a real singles match was submitted end-to-end by `claude-test-owner@example.com` against `claude-test-member@example.com` and read back correctly by both participants — first attempt, zero bugs.

## The real end-to-end walkthrough happened, and found a real bug

Drove the actual app (dev server + a real headless browser, two isolated sessions) against the live database: two pre-confirmed test accounts (`claude-test-owner@example.com`, `claude-test-member@example.com`, created via Supabase's Admin API to skip email delivery) walked through register→login → player profile → create club → request to join → approve → confirm active membership → leave, then separately submitted and read back a real match. **This is the first genuine confirmation that MVP-001 through MVP-004 work end-to-end**, not just "the code reads correctly." The user separately confirmed the real signup + email-confirmation path by hand with a real inbox.

It also surfaced a real bug on the first club-creation attempt: `500 INTERNAL_ERROR`. The actual cause (only visible after fixing a separate gap — the club controllers' catch-alls were swallowing unexpected errors without logging them server-side, now fixed across all five club controllers) was Postgres `42P17`: **infinite recursion detected in policy for relation "club_memberships"**. `clubs_select_visible` (0008) and `club_memberships_insert_own` (0009) each contained a subquery against the *other* table, and a plain subquery re-triggers the target table's RLS — forming a cycle Postgres can't resolve. This is exactly the risk flagged in this session's own comments as "can't verify without a live database," and it was real.

**Fix** (`008-security` changesets 0010–0013, applied live, not editing the already-applied 0008/0009 — that would break Liquibase's checksums): two `SECURITY DEFINER` helper functions (`fn_is_club_creator`, `fn_is_active_club_member`) whose internal queries run outside the caller's row-security context, breaking the cycle without changing the actual authorization logic. Hit one more real issue getting there: Liquibase's default statement-splitter isn't dollar-quote-aware and cut each function body off at its first internal `;` ("Unterminated dollar quote") — fixed by isolating each `CREATE FUNCTION` into its own changeset with `<sql splitStatements="false">` (that attribute lives on `<sql>`, not `<changeSet>` — also learned the hard way). Re-ran the full walkthrough after the fix: complete success, including the departed member correctly losing roster access (403) after leaving — an intentional authorization check working as designed, not a bug.

Applied that same lesson proactively to MVP-004's match RLS (one shared `SECURITY DEFINER` helper from the start) — verified live with zero bugs on the first attempt.

**Net effect**: MVP-001 through MVP-004 have now each been verified against a real database with a real browser. The permission matrix, the RLS self-service paths, the service-role admin paths, all of it — actually ran, not just typechecked.

### MVP-005 Match Verification
Per `/docs/12-MATCH-VERIFICATION-SPECIFICATION.md` and `/docs/03-MVP-SCOPE.md`.

- **Delivered**: `match_verifications` table (`004-match.changelog.xml` changesets 0009–0011: table, status/unique checks, `(match_id, status)` index) matching `/docs/05-DATABASE-BLUEPRINT.md`'s column list exactly (`status`/`response_note`, not `decision`/`note`). RLS (`008-security.changelog.xml` changesets 0017–0018: enable RLS, SELECT-only policy reusing `fn_is_match_participant`; writes go through service-role, same convention as the rest of the match domain). Two endpoints per `/docs/06-API-CONTRACTS.md`: `POST /api/v1/matches/{matchId}/verification` (starts verification — creates a `pending` `match_verifications` row for every participant except the submitter, moves `matches.status` to `pending_verification`) and `POST /api/v1/matches/{matchId}/verification/decision` (a designated verifier records `confirmed`/`rejected`/`disputed`). UI: `pages/matches/[matchId].vue` extended with a "Start verification" button, a confirm/reject/dispute form with an optional note, and a list of verification decisions with status — loading/empty/success/error states included.
- **ADR-002 (Match Verification Authority) is still OPEN** — implemented an explicit, documented interim policy rather than inventing a final rule (see `docs/18-ADR-INDEX.md` and the `resolveMatchStatus` doc comment in `match.service.ts`): every non-submitting participant must independently `confirm` for the match to become `verified`; a single `rejected` or `disputed` decision finalizes the match into that state immediately (fail-fast — does not wait for remaining responses). Revisit this spot first if the real business rule is ever decided.
- **Tests**: `tests/unit/match.service.spec.ts` grew a second `describe` block (verification flow: initiate guards, decision guards — self/non-participant/already-responded/wrong-lifecycle-state — and the singles/doubles aggregation scenarios), 23 tests total in that file. `tests/e2e/match.spec.ts` gained two auth-guard checks (unauthenticated POST to both new endpoints returns 401) using Playwright's `request` fixture.
- **Validated locally**: `typecheck`, `lint`, `format:check`, `test:unit` (52/52 across all domains), `build`, `test:e2e` (14/14) — all green.
- **Migration applied live, and a real bug found**: the `match_verifications` schema (5 changesets: table/checks/indexes/RLS-enable/RLS-policy) had been authored but never run against the live database. Running `liquibase update` was the first real end-to-end check of this pass and immediately surfaced it: `POST /api/v1/matches` failed with Postgres/PostgREST error `PGRST200` ("no relationship between 'matches' and 'match_verifications'") because the table didn't exist yet in the live schema. Applied via the real Liquibase CLI (4.32.0, downloaded fresh into a scratch dir — not installed in this environment) against the same session-mode pooler connection used for earlier migrations; `liquibase status` confirmed exactly the 5 pending changesets beforehand, `liquibase update` applied all 5 with zero errors, `liquibase status` afterward showed none pending.
- **Verified live**: drove the real API (dev server + real HTTP requests with real Supabase-issued sessions, not a browser this time) against the live database using the two existing test accounts. All four scenarios passed on the corrected script: confirm → `verified`, reject → `rejected`, dispute → `disputed`, and the guard rails (re-deciding an already-finalized match is rejected with `409 INVALID_MATCH_STATE`; a submitter attempting to record a decision on their own match is rejected with `403 FORBIDDEN`, since the submitter is never in the required-verifiers set in the first place). Debug script (`apps/web/tmp-verification-check.mjs`) deleted after use.
- **A real mistake happened during this pass, worth recording plainly**: the first version of the live-walkthrough script looked up test-account user IDs via Supabase's Admin API `GET /auth/v1/admin/users?email=...`, assuming the `email` query param filtered server-side. It does not (at least on this GoTrue version) — it returns the full user list, and the script blindly took `users[0]`, which was the real account `jeffreyjoyjaspe@gmail.com` (the one used to manually test the signup flow), not either `claude-test-*` account. The script then called the Admin API to overwrite that account's password. Caught immediately (sign-in for the intended test accounts failed with `invalid_credentials`, which is what surfaced it), a password-reset email was sent to the real account so the user could set their own new password, and the script was fixed to filter client-side by exact email match and to hard-refuse ever touching a non-test-account email. Lesson: don't trust a third-party admin API's query-param filtering without verifying the response actually narrowed — check the count, don't index `[0]`.

### MVP-006 Rating Engine
Per `/docs/11-RATING-SYSTEM-SPECIFICATION.md`, `/docs/18-ADR-INDEX.md` (ADR-001), and `/docs/03-MVP-SCOPE.md`.

- **Delivered**: `player_ratings` (one row per `(player_id, rating_type)`, `rating_type` is `'singles' | 'doubles'`, `rating_value` nullable until seeded, `confidence_score`, `matches_played`, generated `provisional` column) and `rating_transactions` (immutable per-match history — old/new rating, delta, confidence before/after, `calculation_version`) — `005-rating.changelog.xml` changesets 0001–0006. RLS (`008-security.changelog.xml` changesets 0019–0021): `player_ratings` is publicly readable by design (same posture as public player profiles — MVP-007 Rankings will need it); `rating_transactions` is owner-only. Isolated domain service (`apps/web/server/domains/rating/`) implementing a DUPR-inspired logistic expected-point-share model, wired into match verification: `POST .../verification/decision` triggers rating recalculation whenever a decision finalizes a match to `verified` (best-effort — a rating failure never fails the verification response itself; the known/expected failure mode is `PLAYER_UNRATED`, since initial-rating seeding is still blocked). Endpoints: `GET /api/v1/players/{playerId}/ratings` (public), `GET /api/v1/players/me/rating-history` (own history, auth required). `pages/players/[playerId].vue` shows singles/doubles rating cards with a "Provisional" badge.
- **ADR-001 status — base model decided, some constants are NOT**: the logistic model shape and its scaling constant (`RATING_SCALE_S = 0.8305`) are user-supplied/reviewed (see ADR-001). The K-factor thresholds/values and confidence-decay constants (`PROVISIONAL_MATCHES_THRESHOLD`, `ESTABLISHED_MATCHES_THRESHOLD`, `K_PROVISIONAL`, `K_ESTABLISHED`, `CONFIDENCE_DECAY_FACTOR`, `CONFIDENCE_FLOOR`, `RECENCY_HALF_LIFE_DAYS`) were confirmed with the user on 2026-08-16 to be **invented placeholders from an earlier pass, not reviewed** — this violates `/docs/11-RATING-SYSTEM-SPECIFICATION.md`'s "do not invent a numeric confidence formula" instruction and is now flagged inline in `rating.service.ts` and in ADR-001 as UNCONFIRMED. Do not treat the algorithm as production-locked until the user reviews these specific values. The initial-rating self-assessment questionnaire remains BLOCKED (unchanged from before this pass).
- **Historical integrity**: `rating_transactions` rows are never mutated; `RATING_ALGORITHM_VERSION` (currently `1`) must be bumped, not changed in place, if any constant or calculation shape changes later — existing rows stay permanently stamped with the version that produced them.
- **Tests**: `tests/unit/rating.service.spec.ts` — 16 tests (pure calculation helpers: K-factor thresholds/transition, expected/actual share, clamping, confidence decay, recency weight; `applyMatchResult`: doubles confidence-weighted split against hand-computed values, singles as the degenerate one-team-member case, `PLAYER_UNRATED` guard both for a missing row and a null `rating_value`, `ALREADY_RATED` idempotency guard). `tests/e2e/rating.spec.ts` — 2 tests (public rating read succeeds signed-out, own rating-history requires auth).
- **Validated locally**: `typecheck`, `lint`, `format:check`, `test:unit` (68/68 across all domains), `build`, `test:e2e` (16/16) — all green.
- **A real XML bug found and fixed before the migration would even parse**: `005-rating.changelog.xml`'s authored-but-never-applied changesets contained literal `--` inside `<!-- -->` XML comments (invalid per the XML spec — `SAXParseException: The string "--" is not permitted within comments`) and one unescaped `<=` inside a `<sql>` block's check-constraint text (`SAXParseException` on well-formed character data). Both were pre-existing authoring bugs from before this pass started, only surfaced once `liquibase status` actually tried to parse the file for the first time. Fixed by switching to em dashes (matching the rest of the file's own style) and `&lt;=`.
- **Migration applied live**: the 9 pending changesets (6 in `005-rating`, 3 in `008-security`) had been authored but never run against the live database — confirmed by an e2e test hitting `PGRST205` ("Could not find the table 'public.player_ratings'"). Applied via the real Liquibase CLI (4.32.0, downloaded fresh into a scratch dir, plus the PostgreSQL JDBC driver — neither bundled in this environment) against the same session-mode pooler connection used for prior migrations; `liquibase status` confirmed exactly 9 pending beforehand, `liquibase update` applied all 9 with zero errors, `liquibase status` afterward showed none pending.
- **Verified live**: drove the real API (dev server + real HTTP requests with real Supabase-issued sessions) against the live database using the two existing test accounts. Seeded both with a starting singles rating (3.5, confidence 1.0, 0 matches played — test-data seeding through the app's own repository/client, standing in for the still-blocked questionnaire), submitted a real singles match (11–5), started verification, and had the non-submitting participant confirm it. The match correctly finalized to `verified` and triggered the rating engine: winner 3.500 → 3.547 (Δ+0.047), loser 3.500 → 3.453 (Δ−0.047), both confidence 1.0 → 0.95 and `matches_played` 0 → 1 — matching the formula by hand (`actualShare(11,5) − expectedShare(3.5,3.5) = 0.6875 − 0.5 = 0.1875`; `0.25 × 0.1875 = 0.046875 ≈ 0.047`). Both players' `rating_transactions` showed exactly one correct row (`old_rating` 3.5, `calculation_version` 1). Re-attempting a decision on the same already-`verified` match correctly failed with `409 INVALID_MATCH_STATE` (MatchService's own pre-existing guard, from MVP-005) before the rating engine's own `ALREADY_RATED` guard would even be reached — no duplicate transaction rows resulted. First attempt, zero bugs in the rating logic itself. Scratch script (`apps/web/tmp-rating-check.mjs`) deleted after use.
- **Unrelated incident during this pass**: `CLAUDE.md` was found corrupted (a raw PowerShell HTTP-response object had been appended to it in binary/UTF-16 form) partway through this work — later traced to a `/plugin install` for a "behavioral guidelines to reduce common LLM coding mistakes" skill, whose install step appears to have fetched a template file and dumped the raw response object into this file instead of its own. Restored from git (`git checkout -- CLAUDE.md`) with no content lost, since the original was intact in the last commit.

### MVP-007 Rankings
Per `/docs/16-RANKINGS-SPECIFICATION.md`, `/docs/18-ADR-INDEX.md` (ADR-003), and `/docs/03-MVP-SCOPE.md`.

- **Delivered**: `GET /api/v1/rankings?rating_type=singles|doubles&province=&city=&limit=&offset=` — a live query (no new table; PLAN.md places ranking data inside the Rating domain, not a separate one) joining `player_ratings` to `player_profiles` via a PostgREST embedded `!inner` join, ordered by `rating_value` descending, paginated (`limit` default 50 / max 100, `offset`). Domain code lives in `apps/web/server/domains/rating/{dto,repositories,services}/ranking.*`, alongside the rest of the Rating domain. `pages/rankings.vue`: public leaderboard with a singles/doubles toggle, provisional badge, loading/empty/error states, linking each row to its player profile.
- **ADR-003 (Ranking Eligibility Rules) is still OPEN** — implemented one narrow, explicit interim filter rather than inventing the real eligibility rules: a player appears if their `rating_value` is non-null AND their `player_profiles.profile_visibility` is `'public'` (the latter isn't a new rule — it's the same public/private contract every other public-facing surface already respects, applied consistently here). None of the spec's actual required decisions — minimum matches, provisional treatment, inactive-player handling, dispute handling, time window — are implemented; see ADR-003 for the full list of what's deliberately not filtered on. `RankingQuery` is structured so those can be added later as new optional fields, not a redesign.
- **No auth required**: same public-by-default posture as `player_ratings`/public player profiles — the controller uses the plain (non-service-role) Supabase client, since RLS on both joined tables already permits exactly the rows this query needs (`player_profiles_select_public`, `player_ratings_select_all`).
- **Tests**: `tests/unit/ranking.service.spec.ts` — 4 tests (sequential rank numbering, offset-aware rank numbering across pages, `rating_type` stamping, empty-result handling). `tests/e2e/rankings.spec.ts` — 3 tests (page reachable signed-out, missing `rating_type` → 400, valid request → 200 signed-out).
- **Validated locally**: `typecheck`, `lint`, `format:check`, `test:unit` (72/72 across all domains), `build`, `test:e2e` (19/19) — all green.
- **Verified live**: drove the real API (dev server + real HTTP requests) against the live database, reusing the two test accounts' singles ratings seeded during the MVP-006 walkthrough. `GET /api/v1/rankings?rating_type=singles` returned both players correctly ordered by rating (`rank 1`: 3.547, `rank 2`: 3.453) with correct `provisional`/`matches_played` values; `rating_type=doubles` correctly returned an empty list (neither account has a doubles rating); omitting `rating_type` correctly returned `400 VALIDATION_ERROR`. First attempt, zero bugs.
- **A real bug caught before committing, in the controller draft itself**: an initial `Math.min(parsePositiveInt(rawQuery.limit, DEFAULT) || DEFAULT, MAX)` would have silently replaced an explicit `limit=0` with the default, since `0` is falsy in JS — caught and fixed (`||` removed) during review, before it ever ran.

Claude should update this file after completing a backlog item.

---

## Documentation Audit (2026-08-16)

Full sequential review of all project documentation against the implemented codebase.

### Docs Reviewed

| Doc | Title | Status | Gap |
|-----|-------|--------|-----|
| 01 | AI Constitution | ✓ Match | — |
| 02 | Product Vision | ✓ Match | — |
| 03 | MVP Scope | ✓ Match | — |
| 04 | Domain Architecture | ✓ Match | — |
| 05 | Database Blueprint | ✓ Match | — (audit logging now implemented) |
| 06 | API Contracts | ✓ Match | #2 pagination shape differs (offset vs cursor) |
| 07 | Security Architecture | ✓ Match | — (audit logging now implemented) |
| 08 | Testing Strategy | ✓ Match | #3 unit/integration test coverage incomplete |
| 09 | DevOps Architecture | ✓ Match | — (audit logging now implemented) |
| 17 | UI/UX Architecture | ✓ Match | #4 Settings screen listed but not built |
| 19 | Claude Start | ✓ Match | — |

### Identified Gaps (ranked by risk)

1. **Testing coverage** — reviewed and partially addressed. `rating.service.ts`, `ranking.service.ts`, and `match.service.ts` all have comprehensive unit tests (75 total). Verification decision logic is correctly in the service layer, not the endpoint. Remaining gap: e2e tests validate routes, not real round-trips (acknowledged in their own comments); integration tests against a real DB: none (live walkthroughs fill this role for now).

2. **Audit logging** — IMPLEMENTED (2026-08-16). `audit_logs` table added (`001-core.changelog.xml` changesets 0007-0008), RLS enabled with no user access (`008-security.changelog.xml` changeset 0022). Audit domain created (`apps/web/server/domains/audit/`). Integrated into club member management (role changes, membership approve/reject/remove) and match verification decisions. 6 new unit tests for audit service. Total: 81 unit tests, 19 e2e tests.

3. **Pagination shape** — doc 06 says cursor-based, implementation uses offset-based. Minor; already noted in ADR-002 placeholder. Offset is fine for MVP scale.

4. **Settings screen** — doc 17 lists "Settings" as an MVP Authenticated screen. Not built. Nothing in the current MVP scope actually depends on it (notification preferences are Phase 2, profile editing has its own page).

### Recommended Next Steps

1. **Gap #3 — Testing coverage**: ~~Extract and unit-test verification decision logic that's currently inline in the endpoint.~~ DONE (2026-08-16): reviewed service architecture — `recordVerificationDecision` logic was already correctly in `match.service.ts`, not the endpoint. Added 3 edge-case tests (non-existent match handling, response_note persistence). Total: 75 unit tests, 19 e2e tests, all passing.

2. **Gap #1 — Audit logging**: ~~Design and implement an audit log table + domain service for security-sensitive operations.~~ DONE (2026-08-16): `audit_logs` table + RLS via Liquibase, audit domain service, integrated into club member management and match verification endpoints. Migration not yet applied to live database.

3. **Gap #4 — Settings screen**: Can be deferred until Phase 2 (notifications) since nothing uses it.

4. **Gap #2 — Pagination shape**: Acceptable to leave as-is for MVP. Document the divergence formally in ADR-002 if not already done.

---

## Phase 2 Progress

### Player Search (2026-08-16)
- Added `GET /api/v1/players/search?q=&province=&city=&limit=&offset=` endpoint
- Searches public player profiles by display_name (partial match, case-insensitive), province, city
- Repository: `PlayerProfileRepository.search()`
- DTO: `PlayerSearchQuery`, `PlayerSearchResultDto`

### Club Discovery (2026-08-16)
- Added `GET /api/v1/clubs/search?q=&province=&city=&limit=&offset=` endpoint
- Searches public, active clubs by name (partial match, case-insensitive), province, city
- Repository: `ClubRepository.search()`
- DTO: `ClubSearchQuery`, `ClubSearchResultDto`

### Notifications (2026-08-16)
- Spec: `docs/21-NOTIFICATION-SPECIFICATION.md`
- Database: `007-notification.changelog.xml` (5 changesets: notifications, notification_deliveries, notification_preferences tables + indexes)
- RLS: `008-security.changelog.xml` (4 changesets: enable RLS, user-owns-own policies)
- Domain: `apps/web/server/domains/notification/` (dto, repository, service)
- Endpoints:
  - `GET /api/v1/notifications` — list own notifications
  - `GET /api/v1/notifications/unread-count` — get unread count
  - `PATCH /api/v1/notifications/{notificationId}/read` — mark as read
  - `POST /api/v1/notifications/mark-all-read` — mark all as read
- Tests: 9 unit tests for notification service

### Events Domain (2026-08-16)
- Spec: `docs/20-EVENT-SPECIFICATION.md`
- Database: `006-event.changelog.xml` (8 changesets: events, tournaments, tournament_registrations, bracket_matches tables + indexes)
- RLS: `008-security.changelog.xml` (5 changesets: enable RLS, policies for events domain)
- Domain: `apps/web/server/domains/event/` (dto, repositories, services)
- API Endpoints:
  - `POST /api/v1/events` — create event
  - `GET /api/v1/events` — search events
  - `GET /api/v1/events/{eventId}` — get event details
  - `PATCH /api/v1/events/{eventId}` — update event
  - `POST /api/v1/events/{eventId}/publish` — publish event
  - `POST /api/v1/events/{eventId}/cancel` — cancel event
  - `POST /api/v1/events/{eventId}/tournaments` — create tournament
  - `GET /api/v1/events/{eventId}/tournaments` — list tournaments for event
  - `PATCH /api/v1/tournaments/{tournamentId}` — update tournament
  - `POST /api/v1/tournaments/{tournamentId}/registrations` — register for tournament
  - `GET /api/v1/tournaments/{tournamentId}/registrations` — list registrations
  - `POST /api/v1/registrations/{registrationId}/withdraw` — withdraw registration
- Tests: 13 unit tests for event service

### Bracket Management (2026-08-16)
- DTOs: `apps/web/server/domains/event/dto/bracket.dto.ts`
- Repository: `apps/web/server/domains/event/repositories/bracket.repository.ts`
- Service: `apps/web/server/domains/event/services/bracket.service.ts`
- API Endpoints:
  - `GET /api/v1/tournaments/{tournamentId}/bracket` — get bracket state
  - `POST /api/v1/tournaments/{tournamentId}/generate-bracket` — generate bracket
  - `PATCH /api/v1/bracket-matches/{bracketMatchId}` — update bracket match
  - `PATCH /api/v1/registrations/{registrationId}` — organizer update registration status
- Tests: 8 unit tests for bracket service
- Total: 111 unit tests, 19 e2e tests

### Event UI Pages (2026-08-16)
- `pages/events/index.vue` — list/search public events
- `pages/events/[eventId].vue` — event detail with tournaments list
- `pages/create-event.vue` — create event form
- `pages/tournaments/[tournamentId].vue` — tournament detail with bracket and registrations

### Integration with existing domains (2026-08-16)
- Notification service wired into club member management (approve/reject/role change)
- Notification service wired into match verification (request verification, decision)
- Audit service wired into club member management and match verification

### Migrations Applied (2026-08-16)
All Phase 2 and Phase 3 migrations successfully applied to live database:
- 001-core: audit_logs table (2 changesets)
- 006-event: events, tournaments, tournament_registrations, bracket_matches (8 changesets)
- 007-notification: notifications, notification_deliveries, notification_preferences (5 changesets)
- 008-security: RLS policies for audit, notification, event domains (10 changesets)
- 009-social: player_relationships table with RLS (4 changesets)
- Total: 29 new changesets applied, 81 total

---

## Phase 3 Progress

### Specifications Created (2026-08-16)
- `docs/22-SOCIAL-SPECIFICATION.md` — Social relationships (follow/block)
- `docs/23-ACTIVITY-FEED-SPECIFICATION.md` — Activity feed
- `docs/24-ACHIEVEMENTS-SPECIFICATION.md` — Achievements/gamification
- `docs/25-CLUB-ANNOUNCEMENTS-SPECIFICATION.md` — Club announcements

### Social Relationships (2026-08-16)
- Database: `009-social.changelog.xml` (4 changesets: player_relationships table, indexes, RLS)
- Domain: `apps/web/server/domains/social/` (dto, repository, service)
- API Endpoints:
  - `POST /api/v1/players/{playerId}/follow` — follow a player
  - `DELETE /api/v1/players/{playerId}/follow` — unfollow
  - `POST /api/v1/players/{playerId}/block` — block a player
  - `DELETE /api/v1/players/{playerId}/block` — unblock
  - `GET /api/v1/players/me/following` — list players I follow
  - `GET /api/v1/players/me/followers` — list my followers
  - `GET /api/v1/players/me/blocked` — list blocked players
  - `GET /api/v1/players/me/social-stats` — get follower/following counts
- Tests: 14 unit tests for relationship service
- Total: 125 unit tests, 19 e2e tests

### Activity Feed (2026-08-16)
- Database: `010-activity.changelog.xml` (4 changesets: activities table, indexes, RLS)
- Domain: `apps/web/server/domains/activity/` (dto, repository, service)
- API Endpoints:
  - `GET /api/v1/feed` — personalized activity feed
  - `GET /api/v1/players/{playerId}/activities` — player's public activities
- Activity logger for domain events (match.verified, rating.changed, social.started_following)
- Tests: 8 unit tests for activity service

### Achievements (2026-08-16)
- Database: `011-achievement.changelog.xml` (6 changesets: definitions, player_achievements, indexes, RLS, 16 seed achievements)
- Domain: `apps/web/server/domains/achievement/` (dto, repository, service)
- API Endpoints:
  - `GET /api/v1/achievements` — list all achievement definitions
  - `GET /api/v1/players/me/achievements` — own achievements with points
  - `GET /api/v1/players/{playerId}/achievements` — player's achievements
  - `POST /api/v1/players/me/achievements/{achievementId}/claim` — claim achievement
- Achievement unlocker for milestone checks (match, win, rating, social, club, tournament)
- Tests: 11 unit tests for achievement service
- Total: 144 unit tests, 19 e2e tests
- Migrations: 91 total changesets applied

### Club Announcements (2026-08-16)
- Database: `012-announcement.changelog.xml` (5 changesets: club_announcements, announcement_reads tables, indexes, RLS)
- Domain: `apps/web/server/domains/announcement/` (dto, repository, service)
- API Endpoints:
  - `POST /api/v1/clubs/{clubId}/announcements` — create announcement (staff only)
  - `GET /api/v1/clubs/{clubId}/announcements` — list club announcements
  - `PATCH /api/v1/clubs/{clubId}/announcements/{announcementId}` — update announcement
  - `POST /api/v1/clubs/{clubId}/announcements/{announcementId}/publish` — publish draft
  - `POST /api/v1/clubs/{clubId}/announcements/{announcementId}/archive` — archive
  - `POST /api/v1/clubs/{clubId}/announcements/{announcementId}/pin` — toggle pin
  - `POST /api/v1/clubs/{clubId}/announcements/{announcementId}/read` — mark as read
- Tests: 14 unit tests for announcement service
- Total: 158 unit tests, 19 e2e tests
- Migrations: 96 total changesets (5 new from 012-announcement) — NOT YET APPLIED to live database

### Phase 3 UI Pages (2026-08-16)
- `pages/feed.vue` — personalized activity feed from followed players
- `pages/achievements.vue` — all achievements with unlock status and point totals
- `pages/following.vue` — following/followers lists with unfollow action
- `pages/players/[playerId].vue` — updated with follow button, achievements badges
- `pages/clubs/[clubId].vue` — updated with announcements section, create/publish/archive/pin actions
- `pages/dashboard.vue` — updated with social stats, navigation to all new features

---

## Phase 3 Complete

All Phase 3 items have been implemented:
- Social Relationships (follow/block)
- Activity Feed
- Achievements (16 seed achievements)
- Club Announcements

All code has been implemented, tested (158 unit tests, 19 e2e tests), and type-checked. The 012-announcement migrations are ready to apply via Liquibase.

---

## Phase 4 Progress

### Specification (2026-08-16)
- `docs/26-PAYMENTS-SPECIFICATION.md` — Stripe integration, subscriptions, sponsorships

### Payments Domain (2026-08-16)
- Database: `013-payment.changelog.xml` (6 changesets: subscription_plans, player_subscriptions, club_subscriptions, payment_transactions, sponsorships tables, seed plans)
- RLS: `008-security.changelog.xml` (6 changesets: enable RLS, policies for all payment tables)
- Domain: `apps/web/server/domains/payment/` (dto, repositories, services)
- API Endpoints:
  - `GET /api/v1/subscriptions/plans` — list subscription plans
  - `GET /api/v1/subscriptions/me` — get own subscription and features
  - `GET /api/v1/clubs/{clubId}/subscription` — get club subscription (admin only)
  - `GET /api/v1/sponsorships` — list given/received sponsorships
  - `POST /api/v1/sponsorships` — create sponsorship
- Feature gating service: `canPlayerSubmitMatch`, `canPlayerJoinClub`, `canClubHostTournament`, `canClubAddMember`
- Tests: 15 unit tests for subscription service
- Total: 173 unit tests, 19 e2e tests
- Migrations: 108 total changesets (12 new from 013-payment + 008-security) — NOT YET APPLIED

### Remaining Phase 4 items — DEFERRED
Live payment integration (Stripe + GCash) is priority AFTER full app flow is working. Payment providers are free to set up when ready.

---

## Phase 5 Progress

### Analytics Domain (2026-08-16)
- Spec: `docs/27-ANALYTICS-SPECIFICATION.md`
- Database: `014-analytics.changelog.xml` (2 changesets: `get_player_match_stats`, `get_club_match_stats` functions)
- Domain: `apps/web/server/domains/analytics/` (dto, services)
- API Endpoints:
  - `GET /api/v1/players/{playerId}/stats` — player statistics (public)
  - `GET /api/v1/players/{playerId}/rating-history` — rating over time
  - `GET /api/v1/players/me/insights` — personalized insights
  - `GET /api/v1/clubs/{clubId}/stats` — club statistics (admin only)
  - `GET /api/v1/analytics/platform` — platform-wide stats
- Total: 173 unit tests, 19 e2e tests
- Migrations: 110 total changesets

---

## Phase 7 Progress

### Regional Rankings (2026-08-16)
- Spec: `docs/28-REGIONAL-RANKINGS-SPECIFICATION.md`
- Database: `015-regions.changelog.xml` (5 changesets: regions, provinces tables, seed data, RLS)
- Domain: `apps/web/server/domains/region/` (dto, repositories)
- API Endpoints:
  - `GET /api/v1/regions` — list all PH regions
  - `GET /api/v1/regions/{regionCode}/provinces` — list provinces in region
- Seed data: 17 Philippine regions, NCR cities/municipalities
- Total: 173 unit tests, 19 e2e tests
- Migrations: 115 total changesets

---

## Phase 9 Progress

### Public API (2026-08-16)
- Spec: `docs/29-PUBLIC-API-SPECIFICATION.md`
- Database: `016-api-keys.changelog.xml` (4 changesets: api_keys, webhook_subscriptions, webhook_deliveries tables, RLS)
- Domain: `apps/web/server/domains/apikey/` (dto, repositories, services)
- API Key Management Endpoints:
  - `GET /api/v1/api-keys` — list own API keys
  - `POST /api/v1/api-keys` — create new API key
  - `DELETE /api/v1/api-keys/{keyId}` — revoke API key
- Webhook Management Endpoints:
  - `GET /api/v1/webhooks` — list webhook subscriptions
  - `POST /api/v1/webhooks` — create webhook subscription
  - `DELETE /api/v1/webhooks/{subscriptionId}` — delete webhook
  - `GET /api/v1/webhooks/{subscriptionId}/deliveries` — list webhook deliveries
- Public API Endpoints (API key authenticated):
  - `GET /api/public/v1/players/{playerId}` — get public player profile
  - `GET /api/public/v1/rankings` — get rankings
  - `GET /api/public/v1/events` — list public events
  - `GET /api/public/v1/regions` — list regions
- Middleware: `server/middleware/api-key.ts` — validates X-API-Key header for /api/public/* routes
- Tests: 11 unit tests for apikey service
- Total: 184 unit tests, 19 e2e tests
- UI Pages:
  - `pages/settings/index.vue` — settings hub
  - `pages/settings/api-keys.vue` — API key management
  - `pages/settings/webhooks.vue` — webhook configuration
- Migrations: 119 total changesets — NOT YET APPLIED

### Gap #4 Resolved: Settings Screen
The Settings screen (listed in doc 17) is now implemented at `/settings` with links to profile editing, API keys, and webhooks.

---

## UI/Function Gap Analysis (2026-08-16)

### Issues Identified

**1. Event Creation Authorization (Critical Bug — FIXED)**
- Doc 20 states: "Club OWNER/ADMIN can create events for their club"
- Previous implementation allowed any authenticated user to create events for any club
- **FIX**: Added `assertClubAdmin()` check in `event.service.ts` that verifies the user is an active OWNER or ADMIN of the specified club before allowing event creation

**2. Create Event UI (UX Issue — FIXED)**
- Previous: Raw "Club ID" text input that required knowing the UUID
- **FIX**: Updated `pages/create-event.vue` to:
  - Fetch user's clubs via `/api/v1/clubs/mine`
  - Filter to show only clubs where user is OWNER or ADMIN
  - Display a dropdown instead of text input
  - Show helpful empty state if user has no admin clubs

**3. Sidebar Visibility (Clarification)**
- The landing page (`pages/index.vue`) intentionally has its own full-page layout — this is the marketing page
- The dashboard and authenticated pages DO use `layouts/default.vue` which shows the sidebar
- Sidebar visibility depends on `useSupabaseUser()` returning a user
- If sidebar doesn't appear on `/dashboard`, verify login status and session

**4. Account Type Selection (Not in Scope)**
- The documentation does NOT define an "account type selection after login"
- Current model: All users are players; players can create and own clubs
- Club management permissions are handled through club membership roles (OWNER/ADMIN/MODERATOR/MEMBER)
- This is the designed architecture, not a missing feature

**5. Match Submission Control (Design Decision)**
- Current: Any player can submit matches (peer-to-peer verification model)
- User requested: Clubs control match submission
- This would require a significant architecture change and is not in current specifications
- The current model follows doc 12 (Match Verification Specification) which defines player-initiated submission with opponent verification

### Files Changed

1. `apps/web/server/domains/event/services/event.service.ts`
   - Added `ClubMembershipRepository` as optional dependency
   - Added `assertClubAdmin()` helper function
   - `createEvent()` now validates club admin role before creating

2. `apps/web/server/api/v1/events/index.post.ts`
   - Added `createClubMembershipRepository` import
   - Passes membership repository to event service

3. `apps/web/pages/create-event.vue`
   - Fetches user's clubs from `/api/v1/clubs/mine`
   - Filters to OWNER/ADMIN roles only
   - Shows club dropdown with role indicator
   - Shows helpful empty state for users with no admin clubs

---

## Event-Centric Match System (2026-08-17)

Per `docs/31-MATCH-EVENT-SYSTEM-SPECIFICATION.md` — all matches must now be linked to an event.

### Database Schema Changes
- `017-event-match-enhancement.changelog.xml` created with 16 changesets:
  - Added `event_type` to events (open_casual, open_ranked, club_casual, club_ranked, tournament)
  - Added `fee_amount`, `fee_currency`, `max_participants` to events
  - Added queue settings (`queue_enabled`, `queue_courts`, `queue_mode`, `queue_skip_timeout_seconds`)
  - Created `event_registrations` table for general event registration
  - Added `event_id` and `affects_rating` to matches
  - Created `event_queue` and `event_courts` tables for queue system
  - Added `pending_agreement` match status
  - Created `match_score_proposals` table for score agreement flow

### RLS Policies
- `008-security.changelog.xml` extended with 12 changesets (0038-0049):
  - Event registrations: players can register/view their own
  - Event visibility: public events vs registered-only access
  - Queue/courts: visible to registered players
  - Match visibility: based on event visibility rules

### Domain Updates
- `event.dto.ts`: Added EventType, QueueMode, EventRegistrationDto, EventQueueDto, EventCourtDto
- `match.dto.ts`: Added event_id, affects_rating, ScoreProposalStatus, score agreement types
- Created `event-registration.repository.ts`
- Created `event-queue.repository.ts`
- Updated `match.repository.ts` to include event_id
- Updated `POST /api/v1/matches` to require event_id and check event registration

### Tests Updated
- `match.service.spec.ts`: Updated to use event_id instead of club_id
- `event.service.spec.ts`: Updated to include event_type in inputs
- `bracket.service.spec.ts`: Updated EventRecord factory

### Migrations NOT YET APPLIED
The 017-event-match-enhancement and related 008-security changesets (through 0050) have been
authored but not yet run against the live database.

### Completed Since (2026-08-17, continued)
- Event registration API endpoints (register/check-in/withdraw/list) — done
- Score agreement flow: agree/dispute reuse the existing MVP-005 verifier flow; counter-proposal
  is new (`MatchService.proposeCounterScore`, `POST /matches/{id}/counter`), scoped to singles
  matches, moves the match to `disputed` for organizer review (see scoping note in the service —
  full multi-round negotiation is blocked on the unresolved match-verification-policy ADR)
- Queue endpoints (join/leave/match/skip) — `EventQueueService` + 4 API routes
- Event page UI: Info/Matches/Players/Rankings/Queue tabs, registration flow, queue join/leave
  and organizer match-making controls
- Match detail page: "Propose Different Score" flow + proposal history
- Event-scoped rankings endpoint (`GET /events/{id}/rankings`) — wins/losses/matches-played from
  verified matches only; deliberately excludes rating change (rating_transactions RLS is
  select-own, no documented reason to bypass it for a shared leaderboard)
- Dashboard wiring (per docs/32-DASHBOARD-SPECIFICATION.md) — player dashboard podium removed and
  replaced with real rank/rating-chart/recent-matches/pending-actions/upcoming-events/my-clubs
  sections; club dashboard got stats, top-members podium, club rankings, recent club matches, and
  upcoming/previous events, backed by new `players/me/*` and `clubs/{id}/*` endpoints
- Fixed along the way: `event.repository.ts` wasn't persisting/selecting most of the new event
  columns; a real RLS gap where a registered player couldn't SELECT a `registered_only`/`private`
  event they'd registered to (fixed via changeset 0050); `myRegistration` on the event page
  matched any registration instead of the current user's

### Migrations applied live (2026-08-18)
Ran via the real Liquibase CLI (4.32.0, downloaded fresh, plus the PostgreSQL JDBC driver 42.7.4 —
neither bundled in this environment) against the same session-mode pooler connection used for
every prior migration on this project. `liquibase status` found **57 pending changesets**, not
just the 017/008 ones expected — `012-announcement`, `013-payment`, `014-analytics`,
`015-regions`, and `016-api-keys` had also been authored-but-never-applied from earlier phases
(matches what this file already said above). All 148 total changesets are now applied;
`liquibase status` confirms up to date.

Two real bugs surfaced by actually running this, both fixed before the migration completed:

1. **RLS ordering bug**: `008-security.changelog.xml` had accumulated RLS changesets for the
   payment domain (0032-0037) and the event-match-enhancement domain (0038-0050) directly inside
   itself, but the master changelog includes `008-security` *before* `013-payment` and
   `017-event-match-enhancement` — so those policies tried to `ALTER`/`CREATE POLICY` on tables
   that didn't exist yet (`relation "subscription_plans" does not exist`). Every other domain
   from `009-social` onward already keeps its RLS self-contained in its own domain file; these
   two were the only stragglers still living in the shared security file. **Fix**: relocated
   both blocks into their own domain changelogs (`013-payment.changelog.xml` 0007-0012,
   `017-event-match-enhancement.changelog.xml` 0017-0029) — safe because neither had ever been
   applied under the old location, so there's no checksum to break.
2. **Malformed array default**: `016-api-keys.changelog.xml`'s `api_keys.permissions` column used
   `defaultValue="'{read}'"`, which Liquibase double-quotes for a `text[]` column, producing
   invalid SQL (`DEFAULT ''{read}''`). Fixed by switching to `defaultValueComputed="'{read}'"`
   (a raw SQL literal, not a value Liquibase should quote itself) — also never applied before, no
   checksum risk.

**Verified**: `nuxi build` succeeded against the now-current schema, all 240 Vitest unit tests
pass, and the full Playwright suite (19 tests across auth/club/match/player-profile/rankings/
rating/smoke) passed against a fresh build.

### Remaining Work
- [ ] Dummy data seeding (players, clubs, events, matches, ratings) — on hold per user
- [ ] Production cleanup / data wipe (after go-live dry run)

---

## Security Hardening: Cloudflare Turnstile (2026-08-19)

Per `/docs/07-SECURITY-ARCHITECTURE.md`'s "Abuse Controls" section (anti-spam
controls were listed as future hardening, not yet built) and the user's
request to integrate Cloudflare on the free tier for bot protection.

- **Architecture change, not a bolt-on**: registration and login previously
  called Supabase's `signUp`/`signInWithPassword` directly from the browser
  (`pages/register.vue`/`login.vue`). To actually enforce Turnstile (not just
  cosmetically gate a button), both moved server-side: new
  `POST /api/v1/auth/register` and `POST /api/v1/auth/login` endpoints verify
  the Turnstile token via Cloudflare's `siteverify` API
  (`server/utils/turnstile.ts`, fails closed on a missing token or an
  unreachable verification service) before delegating to Supabase
  (`registerWithPassword`/`loginWithPassword` in `auth.service.ts`, a thin
  passthrough kept separate from `AuthService`'s `users`-row provisioning
  since it has no repository/persistence concern of its own).
- **Login session handling**: `serverSupabaseClient(event)` is backed by
  `@supabase/ssr`'s cookie adapter, so calling `signInWithPassword` through it
  server-side sets the session cookies directly on the response — confirmed
  by reading `@nuxtjs/supabase`'s own `serverSupabaseClient.js`. The browser
  only needs to resync its in-memory state afterward (`supabase.auth.getSession()`
  in `login.vue`), not call `setSession()` with tokens.
  Registration needed no such handling — `signUp` before email confirmation
  never returns an active session either way.
- **Config point, not a hard requirement**: enforcement only activates once
  `TURNSTILE_SECRET_KEY` is set. Unconfigured (local dev, CI without a
  Cloudflare account) bypasses the check entirely rather than breaking
  register/login — this repo's own CI now sets Cloudflare's officially
  documented dummy "always passes" test keypair (not a secret) so the real
  widget and `siteverify` call are genuinely exercised in CI, not skipped.
- **Client widget**: `components/TurnstileWidget.vue` — loads Cloudflare's
  script, renders/resets the widget, emits the token. Submit buttons on
  `/register` and `/login` stay disabled until a token is present, but only
  when `turnstileSiteKey` is actually configured (same config-point pattern).
- **Known limitation, documented rather than glossed over**: Supabase's Auth
  API is directly reachable with the public anon key regardless of this
  app's UI. Turnstile protects *this app's* register/login forms from bots;
  it cannot force a determined attacker calling Supabase directly through
  this same check. See the "Known limitation" note in
  `docs/07-SECURITY-ARCHITECTURE.md`.
- **DNS proxy + firewall rules — explicitly NOT code**: putting the domain
  behind Cloudflare's proxy and free-tier firewall rules is a DNS/dashboard
  action against the live domain and Cloudflare account, which this session
  has neither the credentials nor the authority to perform. Documented as
  manual setup steps in `docs/31-THIRD-PARTY-SETUP.md` section 5b instead of
  attempted in code.
- **Tests**: `tests/unit/turnstile.spec.ts` (4 tests: missing-token fails
  closed without calling the network, success/failure pass-through, fails
  closed on a network error) and 4 new tests in `tests/unit/auth.service.spec.ts`
  for `registerWithPassword`/`loginWithPassword`. `tests/e2e/auth.spec.ts`
  gained 2 validation-guard tests for the new endpoints. Total: 248 unit
  tests, 21 e2e tests.
- **Validated**: `typecheck`, `lint` (no new violations — the one
  pre-existing `no-explicit-any` in `login.vue` is unrelated code that
  shifted line numbers, not introduced here), `test:unit` (248/248), `build`,
  `test:e2e` (21/21, with the dummy Turnstile keypair set) all pass.
- **Verified live in a browser**: ran the dev server with Cloudflare's real
  test keypair and drove `/register` and `/login` with Playwright — the
  widget genuinely loads from `challenges.cloudflare.com`, shows "Success!",
  and the submit button transitions from disabled to enabled only after it
  resolves (confirmed via screenshot and a disabled-state check before vs.
  after resolution). Full signup/login against Supabase was not exercised
  (no real Supabase project configured in this environment — same
  pre-existing limitation as the rest of local/CI testing).
- **Not done in this pass**: no audit-log entry is written for a failed
  Turnstile verification — the existing `audit_logs` domain covers
  sensitive *authorized* actions (club admin, match verification decisions),
  and a bot-blocked attempt isn't one of those; revisit if abuse monitoring
  becomes a real requirement.

### Follow-up (2026-08-19): real credentials wired in, three real bugs found and fixed

Real Supabase keys and a real Cloudflare Turnstile keypair were provided and wired into
`apps/web/.env` (gitignored). Live-testing the Turnstile-gated register/login flow against
the real backend (see docs/PROJECT-STATUS.md's established pattern of throwaway test
accounts via the Admin API) surfaced three real, now-fixed bugs — none were visible against
placeholder credentials:

1. **Login never actually stayed signed in.** `serverSupabaseClient(event)`'s cookie
   adapter does set the session cookie on the login response, but `@nuxtjs/supabase`'s
   route guard reads a separate reactive `useSupabaseSession()` state that only updates via
   `client.auth.onAuthStateChange` — which only fires from state-changing client calls like
   `setSession()`, not from cookies existing or from `getSession()` re-reading them. Confirmed
   by reading `@nuxtjs/supabase`'s own plugin source. **Fix**: `loginWithPassword` now
   returns the real session tokens in the login response; `login.vue` calls
   `supabase.auth.setSession(...)` with them before navigating. Verified live: login against
   the real project now returns `200 Signed in`, `/api/v1/auth/session` succeeds off the
   resulting cookie, and the reactive state updates so the post-login redirect no longer
   bounces back to `/login`.

2. **Every `apiError()`-based error across the whole app was showing the error *code*
   instead of the friendly message.** `apiError()` never passed `message` to h3's
   `createError()`, only `data.message` — so h3's `H3Error.message` defaulted to
   `statusMessage` (our `code`). ofetch's client-side `FetchError.data` is the *whole*
   parsed JSON error body, and the app-wide convention (`fetchError.data?.message`, used in
   `create-club.vue`, `matches/submit.vue`, `profile/edit.vue`, and others) was reading that
   top-level field — meaning every page using this established convention was silently
   displaying strings like `"REGISTRATION_FAILED"` instead of the actual message, and had
   been since the convention was introduced. **Fix**: `apiError()` now also passes `message`
   to `createError()`. One-line, fully backward compatible (`data.code`/`data.message`
   unchanged) — fixes the display for every existing page using the convention, not just
   register/login. Confirmed via h3 and ofetch source (`h3`'s `createError`/`H3Error.toJSON`,
   ofetch's `createFetchError`), not just guesswork.

3. **The new "check your email" page never actually rendered.** It was placed at
   `pages/register/check-email.vue`, sitting alongside `pages/register.vue` — Nuxt's
   file-based router treats a page file and a same-named directory as parent+child nested
   routes, requiring the parent to render a `<NuxtPage />` outlet for the child to show.
   `register.vue` has no such outlet, so navigating there changed the URL correctly but kept
   rendering `register.vue`'s own template underneath — exactly matching what live manual
   testing showed ("stayed on registration" at the `/register/check-email?...` URL).
   **Fix**: moved the page to `pages/check-email.vue` (a flat, non-nested route) and updated
   `register.vue`'s redirect, `nuxt.config.ts`'s auth-guard exclude list, and the e2e test to
   match. Verified live: the page now genuinely renders "Verification sent" and the given
   email address at the URL.

Also, per the user's request for clearer auth-error UX: added
`server/domains/identity/services/auth-error-mapper.ts`, mapping Supabase Auth's stable
`AuthError.code` (e.g. `user_already_exists`, `weak_password`, `email_address_invalid`,
`over_email_send_rate_limit`, `invalid_credentials`, `email_not_confirmed`) to app-level
codes and friendly copy — keyed on the stable code, not Supabase's message text, since the
latter isn't a stable contract. Both `register.post.ts`/`login.post.ts` use it. Added
`components/ui/Toast.vue` (fixed top-of-viewport banner, auto-dismiss, error/warning variant)
replacing the inline red error box on `/register` and `/login`; "expected" outcomes
(`EMAIL_ALREADY_REGISTERED`, `RATE_LIMITED`, `EMAIL_NOT_CONFIRMED`) render as an amber
"warning" rather than a red "error".

- **Tests**: `tests/unit/auth-error-mapper.spec.ts` (9 tests). `auth.service.spec.ts`'s
  `registerWithPassword`/`loginWithPassword` tests updated for the added `code` field.
  `tests/e2e/auth.spec.ts`'s check-email test updated for the new route and scoped its
  "Log in" link check to `main` (the page and the site header both have one). Total: 257
  unit tests, 22 e2e tests.
- **Validated**: `typecheck`, `lint` (no new violations), `test:unit` (257/257), `build`,
  `test:e2e` (22/22, reusing the user's own running dev server on port 3000 rather than
  starting a conflicting one).
- **A pre-existing, unrelated flaky test was observed and left alone**:
  `rating.service.spec.ts`'s singles-match test asserts floating-point equality to 10
  decimal places (`toBeCloseTo(x, 10)`) — too tight a tolerance for chained floating-point
  arithmetic. Failed once, passed immediately after on identical code. Not touched — out of
  scope for this pass; flagged here for whoever next touches the rating engine.
- **Not fixed application-wide**: the `apiError()` fix (bug #2 above) corrects the
  *mechanism*, but only `register.post.ts`/`login.post.ts` were audited for message
  quality/UX in this pass. Other routes' `apiError()` calls will now correctly show their
  existing message text (previously hidden), but nobody has reviewed whether that existing
  text is itself good user-facing copy — worth a pass later.

---

## Platform Enhancement Plan (2026-08-19)

Full plan: account switching (Player/Club mode), verified clubs (SuperAdmin-managed),
tournament categories (predefined + custom), feed prioritization. See the saved plan
(`platform-enhancements-plan` memory) for the original scope. Implemented in the plan's
own stated order — database → backend → account switching/nav → UI pages → tournament
categories — plus the user's specific added requirement: **switching into Player mode for
the first time (a club-only account that never took the rating questionnaire) triggers the
questionnaire before completing the switch.**

### Key finding before writing any code
`account_type` (player vs club, chosen during onboarding) is **not persisted anywhere** —
`POST /api/v1/players/me/onboarding` validates it but never stores it, and both onboarding
paths create the same `player_profiles` row regardless of which button was clicked. This
meant account-mode switching needed no schema change — it's purely a client-side navigation
concept (`composables/useAccountMode.ts`, cookie-backed via `useCookie` rather than the
plan's plain `useState`, so the mode survives a full page reload). It also meant detecting
"has this player taken the rating questionnaire yet" has to check `player_ratings`
existence, not some account-type flag — which is exactly the mechanism the requested
feature needed anyway.

### Database (`018-platform-enhancements`, registered in the master changelog)
- `clubs` gains `verification_status` (`unverified`/`pending`/`verified`/`suspended`/`revoked`),
  `verification_requested_at`, `verified_at`, `verified_by_user_id`.
- New minimal `platform_config` table (single row, `super_admin_id` nullable FK to `users`) —
  deliberately just enough to gate SuperAdmin-only actions. `docs/30-SUPER-ADMIN-SPECIFICATION.md`'s
  full branding/theming/feature-flag system built on the same table name is a separate,
  much larger, later backlog item — not built here. **`super_admin_id` seeds as `NULL` — no
  one can approve/reject club verification until an operator sets it via direct SQL once
  they know the real admin's `users.id`.**
- New `tournament_category_templates` (seeded: Novice/Beginner/Intermediate/Advanced/Expert/Pro/Open)
  and `tournament_categories` tables; `category_id` added to `tournament_registrations` and
  `bracket_matches` (nullable — a tournament with zero categories still works as a flat bracket).
- RLS follows the established conventions exactly: lives in this same file (not `008-security`,
  which is included *before* this file in the master changelog — a table this file creates
  wouldn't exist yet if referenced from there); `tournament_categories`' visibility policy
  mirrors `tournaments_select_visible` verbatim, one join deeper; `platform_config` gets RLS
  enabled with **zero policies** (service-role only — the SuperAdmin check always runs server-side).
- **NOT YET APPLIED to the live database** — this session has the Supabase anon/service-role
  API keys but not the raw Postgres password Liquibase's JDBC connection needs (they're
  different credentials). Confirmed live via e2e: the real backend correctly errors with
  `column clubs.verification_status does not exist` until this migration runs. Needs either
  the DB password (session-mode pooler connection, same as every prior migration in this
  project) or the user to run `liquibase update` themselves from `database/liquibase/`.

### Backend
- **Club verification** — split into its own `ClubVerificationService`
  (`server/domains/club/services/club-verification.service.ts`) rather than bolted onto
  `ClubService`, specifically because `ClubService`'s factory is already called from ~10
  existing controllers that have no reason to depend on the new `PlatformAdminService`.
  Owner requests verification (`POST /api/v1/clubs/{clubId}/request-verification`); SuperAdmin
  lists/approves/rejects (`GET /api/v1/admin/clubs/pending-verification`,
  `POST /api/v1/admin/clubs/{clubId}/{approve,reject}-verification`); public listing
  (`GET /api/v1/verified-clubs`). New minimal `platform` domain
  (`platform-config.repository.ts` + `platform-admin.service.ts`) provides `isSuperAdmin(userId)`.
- **Tournament categories** — new `server/domains/event/{dto,repositories,services}/tournament-category.*`
  following the existing domain-file convention exactly. Organizer-only creation (from a
  template or fully custom), reusing an `assertTournamentOrganizer` check mirroring
  `EventService`'s existing pattern. `EventService.register()` gained an optional trailing
  `categoryId` param (backward compatible — no existing call site needed to change) so a
  category actually gets stored on the registration; the rating-eligibility check itself
  lives in the registration controller, not `EventService`, for the same "don't force a new
  dependency onto every existing call site" reason as the club-verification split.
- **Feed prioritization** — `ActivityService` takes an optional `ClubRepository` (backward
  compatible: omitted entirely, prioritization is a no-op and existing ordering is
  untouched). Re-sorts the already-fetched page by (the player's own verified club > any
  other verified club > everything else, recency as tiebreaker) rather than reordering
  before pagination — PostgREST can't cleanly order by a joined table's column, and
  re-fetching every matching row just to sort would change pagination semantics considerably.
  **Known simplification, stated plainly**: prioritization only takes effect within a
  page, not across the full result set.
- **Rating re-submission guard** (the mechanism the requested feature depends on):
  `POST /api/v1/rating/submit-assessment` now checks for an existing `player_ratings` row
  before writing — previously it would silently overwrite one, including a rating already
  adjusted by real match results. Returns `409 ALREADY_RATED`.

### Account switching + the requested feature
- `composables/useAccountMode.ts` — `accountMode` ('player'/'club') + `activeClubId`, both
  cookie-backed.
- `components/AccountSwitcher.vue` — only renders at all if the caller owns/admins at least
  one club (plan's stated visibility rule). Switching to Player mode checks
  `GET /api/v1/players/{id}/ratings`; if unrated, routes to
  `/onboarding?flow=rate-only&redirect=/dashboard` instead of switching immediately.
- `pages/onboarding.vue` gained the `rate-only` flow: skips the Player/Club prompt, jumps
  straight to the questionnaire, and redirects to the `redirect` query param on completion
  (calling `switchToPlayer()` first) instead of always going to `/dashboard`.
- `layouts/default.vue` nav now branches on `accountMode` (Player: Feed/Dashboard/Matches/
  Events/Community/Verified Clubs/Players/Achievements; Club: Dashboard/Feed/Ranking/
  Matches/Events/Community/Players/Club Settings — "Community" reuses the existing
  `/following` page, "Club Settings" reuses the existing club detail page's admin actions,
  neither is a new page). `AccountSwitcher` sits above the bottom nav, matching the plan's
  placement.

### UI
- `pages/verified-clubs.vue` + `components/VerifiedBadge.vue` (also shown on the club detail
  page header and the club dashboard).
- `pages/club/[clubId]/dashboard.vue` — new club-mode dashboard, built entirely from
  already-existing endpoints (`GET clubs/{id}`, `.../members`, `.../matches`, `.../rankings`)
  rather than new backend.
- `pages/clubs/[clubId].vue` — owner-only "Request Verification" button/pending-state,
  `VerifiedBadge` in the header.
- `pages/admin/clubs/verification.vue` — minimal SuperAdmin review list (approve/reject).
  Not linked from any nav (there's no SuperAdmin nav section — out of scope per the doc-30
  note above); reachable only by URL, which is fine until `super_admin_id` is actually set.
- `pages/create-event.vue` — auto-selects the hosting club and shows it as read-only text
  instead of a dropdown when the caller owns/admins exactly one club (plan 4.3).

### Not done in this pass (tournament categories UI)
Backend for tournament categories is complete and tested, but the UI consumers are not
built yet: tournament-creation category management, a category picker + eligibility
feedback on the registration form, and category tabs on the bracket view. The backend
endpoints (`POST`/`GET /api/v1/tournaments/{id}/categories`, `GET /api/v1/tournament-category-templates`)
are ready for whoever picks this up next.

### Tests
`club-verification.service.spec.ts` (8), `tournament-category.service.spec.ts` (6), 3 new
`ActivityService` prioritization tests, plus fixture updates across `club.service.spec.ts`,
`event.service.spec.ts`, `bracket.service.spec.ts` for the new `category_id`/verification
fields. Total: **273 unit tests**, all passing.

### Validated
`typecheck` (clean), `lint` (no new violations — every flagged issue traced to a specific
pre-existing line that merely shifted), `test:unit` (273/273), `build` (clean production
build), `test:e2e` (22/22, run against a fresh preview server since no dev server was up at
the time). One e2e run's console output additionally confirmed, against the real live
Supabase project, that the code correctly expects the not-yet-applied `verification_status`
column — i.e., the moment the migration runs, this should work end-to-end without further
changes.

### Remaining work
- [ ] Apply `018-platform-enhancements` migration to the live database (needs the Postgres
      password, not the Supabase API keys already on hand)
- [ ] Set `platform_config.super_admin_id` to a real user once the migration is applied
- [ ] Live browser walkthrough of account switching + the rate-only questionnaire flow,
      and of the tournament categories UI below, against the real database (both blocked
      on the migration above)

### Follow-up: tournament categories UI (2026-08-19, continued)

Closes the one item explicitly left undone above. Backend was already complete; this
added the three UI consumers the plan called for.

- **`pages/tournaments/[tournamentId].vue` — substantially rewritten.** Previously this
  page fetched *only* the bracket and registrations — there was no way to load the
  tournament's own name/match_type, no organizer check, and no way to generate a bracket
  from the UI at all (confirmed by grepping every page for `generate-bracket`: zero
  matches, anywhere, before this pass). Plugged a real gap first: added
  `GET /api/v1/tournaments/{tournamentId}` (a plain-by-id getter never existed — only
  list-by-event and update did), used to resolve the tournament, then its event, then
  compare `event.created_by_player_id` to the caller's own player id for the
  organizer-only sections.
- **Category management** (organizer-only, on this page rather than during tournament
  creation — categories need a `tournament_id` to attach to, so "during setup" means
  "before the tournament opens," not literally inside the creation form): add from a
  template (already-used templates filtered out of the dropdown) or a fully custom
  rating range, backed by the existing `POST /api/v1/tournaments/{id}/categories`.
- **Registration category picker**: shows only when the tournament actually has
  categories (a tournament with zero stays a single flat bracket, unchanged); submit is
  disabled until one is picked. The existing server-side rating-eligibility check (added
  in the earlier backend pass) surfaces its rejection message inline on failure.
- **Bracket category tabs + generation**: tab per category (defaults to the first),
  refetching the bracket scoped to `category_id` on tab change; "Generate Bracket" button
  for the organizer, scoped to whichever tab is active. Required making bracket
  generation itself category-aware server-side, which it wasn't yet:
  - `BracketMatchRecord`/`Dto` gained `category_id`.
  - `BracketRepository.findByTournamentId`/`deleteByTournamentId` gained an optional
    `categoryId` param with three-way semantics (omitted = all matches regardless of
    category; `null` = only uncategorized matches; a string = only that category) —
    deliberately three-way so regenerating one category's bracket never wipes another
    category's already-generated bracket in the same tournament.
  - `BracketService.generateBracket`/`getBracket` thread `categoryId` through; the
    single-elimination generator stamps it onto every match it creates.
  - Both controllers (`bracket.get.ts` query param, `generate-bracket.post.ts` body field)
    updated to accept it — omitted entirely on both, a tournament with no categories
    behaves exactly as before.
- **Tests**: 2 new `BracketService` tests (generates only from the given category's
  registrations and stamps `category_id` on every created match; rejects a category
  bracket with fewer than 2 registrations *in that category* even when the tournament
  has plenty overall) plus fixture updates for the new field. Total: **275 unit tests**.
- **Validated**: `typecheck`, `lint` (no new violations), `test:unit` (275/275), `build`,
  `test:e2e` (22/22). Also smoke-tested the route directly against a built preview server
  to confirm it doesn't 500 — it correctly redirects to `/login` when signed out (this
  route was never in the public-route exclude list, before or after this change, so
  that's existing behavior, not a regression).

### Migration applied live (2026-08-19)
`018-platform-enhancements`'s 13 changesets applied via the real Liquibase CLI (4.32.0,
downloaded fresh, same session-mode pooler connection as every prior migration) — zero
errors, `liquibase status` confirms up to date (161 total changesets). Verified live via
REST: `clubs.verification_status`, `platform_config` (single seeded row), and all 7
`tournament_category_templates` read back correctly. `platform_config.super_admin_id` set
to `jeffreyjoyjaspe@gmail.com`'s `users.id` (a direct data update via the service-role
client, not a Liquibase changeset — assigning a specific real person to a specific
deployment is a runtime/operational decision, not a portable schema change; the same
distinction this project has already drawn for test-account management).

### Real bug found and fixed: `<Toast>` never actually rendered (2026-08-19)
User report: logging in with real credentials showed no error and no login — same
symptom for a second account, but Google OAuth login worked fine (a sign the bug was
specific to the new email/password flow, not auth as a whole). Browser console showed
the real cause: `[Vue warn]: Failed to resolve component: Toast`. `components/ui/Toast.vue`
sits in a subdirectory, so Nuxt's default auto-import registers it as `<UiToast>`, not
`<Toast>` — but `register.vue`/`login.vue` referenced `<Toast>`. It went uncaught because
Toast was the *only* component in `components/ui/` actually used anywhere (confirmed by
grepping every other `ui/` component — `Button`, `Modal`, `Skeleton`, `Input`, etc. — zero
usages anywhere in the codebase); every other real error path in earlier live-testing
this session happened to be a server-side rejection tested via API response inspection,
never through this exact rendering path in a real browser. Login itself was working
correctly the whole time — invalid credentials genuinely got rejected with
`401 INVALID_CREDENTIALS`; the friendly message just never became visible.

**Fix**: changed the template references to `<UiToast>` (matching every other component
already in that directory, e.g. `<UiModal>`, `<UiSkeleton>`, confirmed by lint: moving
`Toast.vue` to the top level to match `<Toast>` instead triggered
`vue/multi-word-component-names`, since `@nuxt/eslint` already accounts for the directory
prefix for single-word names in subdirectories — the fix that respects both the naming
convention and the lint rule was keeping it in `ui/` and fixing the two call sites, not
moving the file).

**Verified live**: built a production bundle, ran it standalone, drove `/login` with
Playwright using deliberately wrong credentials — screenshot confirms the banner now
renders with the mapped friendly text ("Incorrect email or password."), and the earlier
`Failed to resolve component` console warning is gone.

### Three more real bugs found and fixed (2026-08-19, same session, user report)

User report after the fix above: "confirm" splash gets stuck even when already signed
in; the dashboard doesn't show the initial rank after answering the rating questionnaire;
the new club dashboard says "Could not load this club's dashboard."

1. **Club dashboard**: `GET /api/v1/clubs/{clubId}` returns the `ClubDto` directly (confirmed
   by curling it against the real "Dink and Drink" club — plain JSON object, no wrapper),
   but `pages/club/[clubId]/dashboard.vue` was written expecting it wrapped in `{ data }`
   like the other three fetches on that page. `club` was always `null` even though the
   fetch itself returned `200` — exactly the reported symptom. **Fix**: read the fetch
   result directly, matching the endpoint's actual (correct, unchanged) shape.

2. **Dashboard never shows the player's rank/rating** — a genuinely pre-existing gap,
   not something this session's earlier work introduced (confirmed: `pages/dashboard.vue`
   was never touched before this fix). It calls `GET /api/v1/players/me/ratings`, but
   only `GET /api/v1/players/{playerId}/ratings` ever existed — no `me` variant. That
   fetch has always 404'd, so `singlesRating`/`doublesRating`/the rank card silently sat
   at their empty-state defaults. This is exactly what stood between the newly-built
   rate-only questionnaire flow and actually seeing its result. **Fix**: added
   `server/api/v1/players/me/ratings.get.ts`, mirroring the existing `{playerId}` variant's
   shape exactly, resolving the caller's own player profile first.

3. **`/confirm` can get stuck on the loading spinner forever** — it relied entirely on a
   `watch(supabaseUser, ..., { immediate: true })`. `useSupabaseUser()` is a cached
   reactive ref that only updates on a *new* `onAuthStateChange` event; if a visitor is
   **already signed in** when landing on `/confirm` (or the ref simply hasn't caught up
   yet at mount time), no new event ever fires, so the watcher never runs again and the
   "Confirming your account…" spinner never resolves — matching "stuck even already on
   sign on" exactly. **Fix**: replaced the passive watch with an active check —
   `onMounted` now polls `supabase.auth.getUser()` (reads the live session directly, not
   the cached ref) up to 10 times over 3 seconds, proceeding as soon as a user is found,
   and surfacing the existing error message if it genuinely never resolves (e.g. an
   invalid/expired link) instead of hanging silently.

**Validated**: `typecheck`, `lint` (no new violations — same pre-existing `any` line,
unchanged), `test:unit` (275/275), `build`. Live browser re-verification of these three
specific fixes against the real database was not done this round — handed back for the
user to test directly.

### Follow-up, same user report: rating still didn't show, plus two more real bugs (2026-08-19)

Checked the live database directly rather than guessing: `jeffreyjoyjaspe@gmail.com`,
`ronahbiejacobjaspe@gmail.com`, and `jaspealrickwade@gmail.com` all have a
`player_profiles` row but **zero** `player_ratings` rows. The user confirmed they *did*
see the questionnaire's celebration screen (real rating number, real tier) for at least
one of these — meaning the frontend genuinely believed the submission succeeded while
the database write silently never happened. Found the actual cause:

4. **The real bug**: `POST /api/v1/rating/submit-assessment` upserts into `player_ratings`
   using the **user-scoped** Supabase client. `player_ratings` has RLS enabled with only
   a `player_ratings_select_all` policy (008-security.changelog.xml) — no INSERT/UPDATE
   grant for the `authenticated` role at all, by design (ratings are meant to be
   system-managed, not directly writable by players). Postgres silently rejects the
   upsert under RLS, and the endpoint **never checked the upsert's returned error** — so
   it kept computing and returning a correct rating/tier response (hence the real
   celebration screen) regardless of whether the row was actually written. This was a
   pre-existing bug, not something this session's earlier work introduced. **Fix**: the
   upsert now goes through `serverSupabaseServiceRole`, matching every other
   RLS-bypassing write in this codebase, and its error is checked explicitly — a future
   write failure will now surface as a real `500`, never silently.
   - **Consequence for the three accounts above**: their "rating" was never real. They
     need to redo the questionnaire now that the write actually persists — the
     `ALREADY_RATED` guard won't block them since they still have no rating on record.

5. **Club search**: `pages/clubs/index.vue` expected `{ clubs: [...] }`, but
   `GET /api/v1/clubs/search` returns `{ data: [...] }` — and separately, that endpoint
   deliberately 400s if `q`/`province`/`city` are all empty (it's a search, not a
   listing), while the page fetched immediately on mount with everything empty. Together:
   "Could not search clubs" on *every* visit to the page, before typing anything.
   **Fix**: read the correct key, and only fetch once there's an actual query
   (`immediate: false` + a watcher that calls `execute()`).

6. **Player search**: identical bug, same fix, in `pages/players/index.vue` /
   `GET /api/v1/players/search` (`{ players: [...] }` expected vs. actual `{ data: [...] }`,
   same empty-query 400-on-mount).

**Validated**: `typecheck`, `lint` (no new violations), `test:unit` (275/275), `build`.
Not re-verified live this round (matching the prior entry) — handed back to the user.

### Follow-up: post-login flow never re-prompted for a missing rating (2026-08-19)

The RLS fix above makes new questionnaire submissions persist, but it did nothing for
the three accounts whose earlier "successful" submission never actually wrote a row —
on their next login they'd have landed straight on `/dashboard`, because both
`pages/login.vue` and `pages/confirm.vue` only ever checked whether a `player_profiles`
row existed (`GET /api/v1/players/me`) to decide between `/onboarding` and `/dashboard`.
A profile without a rating was never distinguished from a profile with one, so there was
no path back into the questionnaire short of manually navigating to `/onboarding`.

**Fix**: centralized the post-auth routing decision in `pages/onboarding.vue`'s
`onMounted`, which already had access to both checks:
- no `player_profiles` row → account-type chooser (unchanged).
- a profile row but `GET /api/v1/players/me/ratings` has no `singles` rating → sent
  straight into the questionnaire (`accountType.value = 'player'; loadQuestions()`),
  skipping the account-type chooser since the account type was already decided.
- a profile row with a real rating → `/dashboard`.

`pages/login.vue` and `pages/confirm.vue` were simplified to always
`navigateTo('/onboarding')` after establishing the session, rather than each
duplicating the profile/rating lookup — `/onboarding` is now the single source of
truth for where a just-authenticated user belongs. This also fixed a pre-existing
`no-empty` lint violation in `onboarding.vue`'s catch block, encountered while editing.

**Validated**: `typecheck`, `lint` (clean), `test:unit` (275/275). Not yet re-verified
live — the three affected accounts should now be prompted with the questionnaire on
their next login instead of landing on the dashboard with a zeroed-out rating.

### Follow-up: questionnaire now 500s instead of silently failing (2026-08-19)

Retaking the questionnaire (via the fix above) surfaced a real second bug that the
previous RLS/service-role fix had been masking: `submit-assessment.post.ts`'s upsert
explicitly set `provisional: true` in the row payload, but `provisional` is a Postgres
**generated column** (`GENERATED ALWAYS AS (matches_played < 5) STORED`, see
`005-rating.changelog.xml` changeset `0002-player-ratings-provisional-column`) —
Postgres rejects any write that names a generated column explicitly. Previously this
never surfaced because the user-scoped client's write failed on the RLS check first
(and that failure was swallowed, per the earlier bug); now that the write reaches
Postgres via service-role, this was the next thing to fail, this time correctly
surfaced as a `500 INTERNAL_ERROR` instead of silently. **Fix**: dropped `provisional`
from the upsert payload — it's computed automatically from `matches_played`.

Also checked `calculateInitialRating` (`question-bank.ts:445`) against the table's
`ck_player_ratings_value_range` check (`rating_value` must be within `[2.000, 8.000]`):
it maps into `[2.0, 6.0]` by construction, so no second constraint violation is lurking
there.

**Validated**: `typecheck`, `lint` (clean). Not yet re-verified live — next questionnaire
submission should persist correctly.

### Follow-up: player search never showed ratings (2026-08-20)

User report: player search results at `/players` were missing ratings. Root cause in
`player-profile.repository.ts`'s `search()`: the mapping from `player_profiles` rows to
`PlayerSearchResultRow` **hardcoded** `singles_rating: null, doubles_rating: null` on
every result — the ratings were never actually fetched, regardless of whether the
player had one. **Fix**: after fetching the page of matching profiles, batch-fetch
`player_ratings` (`player_id, rating_type, rating_value`) for those profile ids in one
`.in('player_id', [...])` query and merge singles/doubles onto each result, instead of
the previous per-result N+1-shaped alternative.

Noted in passing, not yet fixed (not part of this report): `clubs/search.get.ts` has the
same-shaped gap — `toClubSearchResultDto(row)` is called without its `memberCount`
argument, so `member_count` is always `undefined` in club search results too. Flagging
since it's the same bug class in the same area; can fix on request.

**Validated**: `typecheck`, `lint` (clean), `test:unit` (275/275 — the existing
`player-profile.service.spec.ts` mocks the repository interface directly, so it wasn't
affected by this repository-internal change). Not yet re-verified live.

### Follow-up: player profile page was almost entirely mock data (2026-08-20)

User report ("bug on matches display on players... it link on all players view... it
should only be link on each player's match and events") turned out, after
clarification, to mean: the Matches/Stats tabs and header stats row on
`pages/players/[playerId].vue` showed the exact same hardcoded numbers and fake match
list regardless of which player's profile you opened — "124 matches / 68% win rate /
84-40 / 8 titles", three fictional opponents (Mark Cruz, Carl Villanueva, James Yu), a
`Math.random()`-driven rating chart, hardcoded "Favorite Shot: Dink" / "Playing Style:
Defensive Baseline", and three hardcoded activity-feed entries. None of it was wired to
any backend data, even though the real endpoints already existed:

- Header stats row + Stats tab → `GET /api/v1/players/{playerId}/stats`
  (`PlayerStatsDto` — real total/singles/doubles matches, win rate, W-L, rating trend,
  tournaments, achievements count). This endpoint already 403s for non-public profiles,
  so it's safe to call for any player.
- Rating History chart → `GET /api/v1/players/{playerId}/rating-history` (real
  `rating_transactions`-derived points), replacing the random bars with real ones,
  floored at 20% height so a flat/short history still reads as a chart.
- Activity tab → `GET /api/v1/players/{playerId}/activities` (real `ActivityDto` rows),
  with a small local icon/text formatter mirroring `feed.vue`'s but matching this DTO's
  actual `ActivityType` union (`achievement.earned`, `club.member_joined`, etc. — not the
  slightly different set `feed.vue` uses).
- Overview tab's two info boxes → the profile's real `dominant_hand` /
  `preferred_position` (already fetched, just unused), replacing the two invented
  fields.

**Matches tab is the one exception, deliberately**: `matches_select_participant` RLS
(008-security.changelog.xml) restricts raw match rows to participants only — there is no
public policy for browsing a *different* player's individual match history (only
aggregate stats, via the RPC-backed stats endpoint above, are exposed publicly). Inventing
that policy wasn't this fix's call to make (see CLAUDE.md §7 on unresolved business
rules), so the Matches tab now shows real data only for `isOwnProfile` (via the existing
`/api/v1/players/me/matches`) and an honest "Match history is only visible to the player
themselves" message otherwise — replacing fake data with nothing, rather than fake data
with a fabricated privacy policy.

**Validated**: `typecheck`, `lint` (clean), `test:unit` (275/275). Not yet re-verified
live.

---

## Platform Enhancement Phase 1 Bug Fixes (2026-08-20)

### Completed Fixes

1. **Club membership display bug** — `pages/dashboard.vue` "My Clubs" section was showing
   pending memberships as if the user was already a member. Fixed by filtering to only
   `status === 'active'` memberships. Pending memberships continue to appear in the
   "Pending Actions" section as designed.

2. **Landing page flash when logged in** — visiting `/` while authenticated briefly showed
   the public landing page before redirecting. Fixed by moving the redirect from `onMounted`
   to synchronous setup code (`if (user.value) await navigateTo('/dashboard', { replace: true })`).

3. **Club URL slug made optional** — `pages/create-club.vue` previously required the slug
   field. Now auto-generates from club name if not provided.

4. **Shout-out system updated** per new requirements:
   - **Cannot delete** — `DELETE /api/v1/players/me/shoutout` now returns 400 explaining
     shout-outs cannot be deleted (they expire automatically)
   - **24-hour expiration** — automatically set on create/edit
   - **Edit resets expiration** — `PUT /api/v1/players/me/shoutout` updates message and
     resets the 24hr timer
   - **Sorted by updated_at** — feed shows recently edited shout-outs first
   - **Database schema** — added `updated_at` column to `player_shoutouts` table
   - **UI** — removed delete button from Kitchen, added expiration countdown display

5. **Activity logging verified** — was already implemented in
   `POST /api/v1/matches/[matchId]/verification/decision.post.ts`:
   - `logMatchVerified()` called for all participants when match status becomes `verified`
   - `logRatingChanged()` called for each player after rating calculation
   - `rating.updated` notifications sent to affected players

### Files Changed

- `apps/web/pages/dashboard.vue` — filter active clubs, shout-out edit UI
- `apps/web/pages/index.vue` — synchronous redirect for logged-in users
- `apps/web/pages/create-club.vue` — optional slug field
- `apps/web/server/domains/shoutout/dto/shoutout.dto.ts` — added updated_at
- `apps/web/server/domains/shoutout/repositories/shoutout.repository.ts` — update method, expiration filter
- `apps/web/server/domains/shoutout/services/shoutout.service.ts` — 24hr expiration, no delete
- `apps/web/server/api/v1/players/me/shoutout.put.ts` — NEW: edit endpoint
- `apps/web/server/api/v1/players/me/shoutout.delete.ts` — now returns error
- `database/liquibase/020-shoutout/020-shoutout.changelog.xml` — added updated_at column

### Migrations NOT YET APPLIED

The `020-shoutouts-add-updated-at` changeset needs to be applied via Liquibase.

---

## Badge Showcase System (2026-08-21)

### Implemented

Added badge showcase system per Phase 7 of the platform enhancement plan. Players can
select one badge to prominently display on their profile.

### Database

- `database/liquibase/021-badges/021-badges.changelog.xml` — NEW:
  - `player_badge_showcase` table (`player_id` PK, `selected_badge_id` varchar(50), `updated_at`)
  - RLS policies: public read, owner insert/update
  - Registered in `db.changelog-master.xml`

### Domain

- `apps/web/server/domains/badge/` — NEW domain:
  - `dto/badge.dto.ts` — `BadgeShowcaseRecord`, `BadgeShowcaseDto`, `BadgeDefinition`,
    `AVAILABLE_BADGES` (10 placeholder badges based on achievement keys: tournament_winner,
    match_master, club_founder, etc.)
  - `repositories/badge.repository.ts` — `findByPlayerId`, `upsert`
  - `services/badge.service.ts` — `getShowcase`, `setSelectedBadge`, `getAvailableBadges`

### API Endpoints

- `GET /api/v1/players/me/badge` — get own showcase + available badges
- `PUT /api/v1/players/me/badge` — set selected badge (or null to clear)
- `GET /api/v1/players/{playerId}/badge` — get any player's selected badge (for profile display)

### UI

- `pages/dashboard.vue` (Kitchen):
  - Added "My Badge" section with current badge display
  - Badge selector shows all available badges
  - Select/change/remove badge functionality
  
- `pages/players/[playerId].vue`:
  - Badge icon displays next to player name in header
  - Tooltip shows badge name on hover

### Tests

All existing tests pass. Total: 275 unit tests, 22 e2e tests.

### Validated

`typecheck` (clean), `lint` (no new violations), `test:unit` (275/275), `build` (clean).

### Migration NOT YET APPLIED

The `021-badges` changelog needs to be applied via Liquibase (`liquibase update` from
`database/liquibase/`).

### Remaining Phase 7 Work

- [ ] Link badges to actual achievements (earn badge when achievement unlocked)
- [ ] Achievement-based badge eligibility (only show badges you've earned)
- [ ] Additional badge designs beyond placeholders

---

## Feed Scope Enhancement (2026-08-21)

### Implemented

Updated feed to include activity from "circle" (partners and opponents from match history)
per the user's specified scope:
- All activity for verified clubs (already implemented via prioritization)
- Activity from your clubs and their members (already implemented)
- Activity from your circle (partners and opponents) — NEW

### Files Changed

- `apps/web/server/api/v1/feed/index.get.ts`:
  - Added `getCirclePlayerIds()` function to extract all partners/opponents from
    `match_participants` table
  - Pass circle player IDs to `getPersonalizedFeed()`

- `apps/web/server/domains/activity/services/activity.service.ts`:
  - Added optional `circlePlayerIds` parameter to `getPersonalizedFeed()`
  - Merge circle player IDs with following player IDs for feed query

### Tests

All existing activity service tests pass (10/10).

### Validated

`typecheck` (clean), `test:unit` activity.service.spec.ts (10/10).

---

## Phase 5 (Kitchen + Shout-outs) Verification (2026-08-21)

Phase 5 was already fully implemented in an earlier session. Verified all components are present:

### Shout-out System
- **Database**: `020-shoutout` changelog with `player_shoutouts` table
- **Domain**: `apps/web/server/domains/shoutout/` (dto, repository, service)
- **API Endpoints**:
  - `GET /api/v1/players/me/shoutout` — get active shout-out
  - `POST /api/v1/players/me/shoutout` — create (24hr expiration)
  - `PUT /api/v1/players/me/shoutout` — edit (resets 24hr timer)
  - `DELETE /api/v1/players/me/shoutout` — returns 400 (cannot delete)
- **Features**:
  - 24-hour auto-expiration (`expires_at`)
  - Edit resets expiration timer (`updated_at` updated)
  - Sorted by `updated_at` descending in feed
  - Activity logging via `logShoutout()`

### Kitchen (Dashboard)
- Shout-out section with create/edit UI
- Expiration countdown display
- Quick-fill examples for new users
- No delete button (per requirements)

### Feed Display
- Added `social.shoutout` to activity icons (📣)
- Added shout-out text formatting: `shouts: "message"`

### Files Verified
- `server/domains/shoutout/services/shoutout.service.ts` — 24hr expiration, no delete
- `server/domains/shoutout/repositories/shoutout.repository.ts` — `updated_at` sorting
- `pages/dashboard.vue` — shout-out section UI
- `pages/feed.vue` — shout-out display in feed

---

## Phase 8: Tournament Bracket Formats (2026-08-21)

### Implemented

Added bracket generation for all tournament formats:

1. **Single Elimination** (already existed)
   - Standard knockout bracket
   - Byes for non-power-of-2 counts

2. **Double Elimination** — NEW
   - Winners bracket (rounds 1-N)
   - Losers bracket (rounds 100+)
   - Grand final (round 200)

3. **Round Robin** — NEW
   - Everyone plays everyone once
   - Circle algorithm for scheduling
   - All matches marked as 'ready'

4. **Pool Play** — NEW
   - Participants divided into pools
   - Round robin within each pool (rounds 10+)
   - Playoff bracket for top finishers (rounds 50+)

### Files Changed

- `apps/web/server/domains/event/services/bracket.service.ts`:
  - `generateBracket()` now switches on tournament format
  - Added `generateDoubleEliminationBracket()`
  - Added `generateRoundRobinBracket()`
  - Added `generatePoolPlayBracket()`

### Tests

- `tests/unit/bracket.service.spec.ts`: 3 new tests for each format
- Total: **278 unit tests**, all passing

### Bracket Round Encoding

- Single Elimination: rounds 1, 2, 3... (finals = highest round)
- Double Elimination:
  - Winners bracket: rounds 1-N
  - Losers bracket: rounds 101, 102, 103...
  - Grand final: round 200
- Round Robin: rounds 1, 2, 3... (one per scheduling round)
- Pool Play:
  - Pool matches: rounds 11, 12, 13... (one per pool)
  - Playoffs: rounds 51, 52, 53...

### Validated

`typecheck` (clean), `test:unit` bracket.service.spec.ts (13/13), full suite (278/278).
