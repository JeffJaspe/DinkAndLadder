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
   - **UI** — removed delete button from Dashboard, added expiration countdown display

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

- `pages/dashboard.vue`:
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

## Phase 5 (Dashboard + Shout-outs) Verification (2026-08-21)

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

### Dashboard
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

---

## Phase 9: Audit Remediation — Critical & High (2026-08-22)

A read-only audit of all 410 tracked files plus the working tree produced 37
findings. This pass fixed the 6 critical and 13 high ones. The other 18 are
logged under "Audit Follow-ups" in `/docs/10-IMPLEMENTATION-BACKLOG.md`.

**No Liquibase changeset was needed.** The two schema mismatches were resolved by
deleting the code that queried absent columns, not by adding them. Nothing edits
`0003-add-barangay-column`, so this pass is safe regardless of whether that
changeset has been applied to the live database yet.

### 1. Quarantined the out-of-MVP surface (F-01,02,03,07,08,09,10,20,30)

See ADR-005. Payments and Public API are "Explicitly Out of MVP" in
`/docs/03-MVP-SCOPE.md`, so nine findings were closed by removing the surface
rather than hardening it.

- Stripe/PayMongo webhooks now return **501**. They previously verified a
  signature, `console.log`-ed the event and returned 200 — so the provider
  marked it delivered and never retried. 501 keeps events queued upstream.
- Deleted: `server/middleware/api-key.ts`, `server/api/public/**`,
  `server/api/v1/api-keys/**`, `server/api/v1/webhooks/**`,
  `server/domains/apikey/services/webhook.service.ts`,
  `pages/settings/{api-keys,webhooks}.vue`.
- `apikey.service.ts` / `apikey.repository.ts` **kept, unwired** — they are the
  correct implementation. The deleted `webhook.service.ts` was the one the
  endpoints actually imported, and it derived webhook secrets from
  `Date.now()` and wrote columns `webhook_deliveries` does not have.
- No tables dropped.
- `/settings` is no longer super-admin-gated (nothing privileged is left on it)
  and is back in the sidebar for everyone. The `super-admin` middleware now
  guards `/admin/clubs/verification`, which previously had no route guard.

### 2. Barangay feature completed (F-14, F-15)

- `barangay` was silently dropped on every profile save: the PATCH handler's
  hand-maintained field list omitted it while the column, DTO, editor, search
  filter and rankings join all had it. Every barangay filter therefore matched
  zero rows.
- Fixed structurally, not by adding a string. Body parsing moved into
  `player-profile.dto.ts` as `parseUpdatePlayerProfileInput`, with the writable
  fields declared as `Record<OptionalTextField, true>` — **TypeScript now rejects
  adding a field to the DTO without listing it**, so this class of bug cannot recur.
- The profile editor used two `setTimeout(500)` calls to wait for PSGC lookups.
  On a slow response the selects stayed empty and Save then wrote
  `city: null, barangay: null` over data the user never touched. The picker's
  `select*` functions now return their load promise, and the editor holds
  location as form state seeded from the profile, so saving no longer depends on
  loading succeeding.

### 3. Identity and privacy (F-04, F-05, F-06, F-16)

- **Turnstile now fails closed.** Both auth endpoints wrapped the check in
  `if (turnstileSecretKey)`, so one missing env var silently removed all bot
  protection. New `server/utils/require-turnstile.ts` skips only under
  `import.meta.dev` (loudly); any other environment returns 500.
- **Display names are no longer derived from email.** `display_name` is
  published through the public-read RLS policy, and *two* places defaulted it to
  the email local part — `onboarding.post.ts` and `submit-assessment.post.ts`
  (the latter is the primary player path and was not in the original finding).
  Onboarding now collects a display name; both endpoints call the new
  `PlayerProfileService.ensureProfile`.
- `ensureProfile` is insert-if-absent, so re-entering onboarding no longer
  renames an existing player — previously reachable via AccountSwitcher's
  rate-only redirect.
- `/api/v1/locations/*` interpolated an unvalidated query param into an external
  URL path, unauthenticated and uncached. New `server/utils/psgc.ts` validates
  codes against `^\d{9,10}$` and sets a 24h `Cache-Control`.

### 4. Correctness (F-17, F-18, F-19, F-21)

- **F-17 was worse than filed.** `analytics.service.ts` filtered
  `player_relationships` on `follower_id`/`followed_id`, which are not columns —
  they are `from_player_id`/`to_player_id`. PostgREST errored, `Promise.all`
  destructuring swallowed it, so follower and following counts were **always 0**
  on every profile. Now delegates to the already-correct
  `RelationshipRepository.countFollowers`/`countFollowing`, and query errors are
  checked rather than discarded.
- `/api/v1/analytics/platform` deleted — it read platform counts through the
  RLS-bound anon client (so `total_matches` was always 0) and had no consumer;
  `pages/index.vue` uses `/api/v1/stats/public`, which is correct.
- Rank queries switched from `.select('id')` + `.length` to
  `{ count: 'exact', head: true }`; past ~1000 players everyone reported the same
  rank. `percentile_doubles` is now computed instead of hardcoded null.
- Bracket generation: all four generators used
  `sort(() => Math.random() - 0.5)` (not a uniform shuffle) — replaced with
  Fisher-Yates. First-round bye placement rewritten: 5 entrants in an 8-slot
  bracket previously emitted a slot with both participants null, status `'bye'`
  and a null winner.

### Validated

`typecheck` clean · `test:unit` **300/300** (was 278; +22 new) · production
`build` succeeds · build output confirms the quarantined routes are gone.

`lint` still fails with **66 pre-existing errors** — verified against a clean
`main` checkout, down from 70 because deleted files took some with them. No new
lint errors were introduced. This blocks CI and is logged in the backlog.

### Not yet done

- Live walkthrough against Supabase (8 scenarios in the plan file).
- **Existing live profiles still carry email-derived display names.** That is
  data, not schema, so no changeset — correct them through the profile UI or a
  one-off script.

---

## Design system + theming, Phase 1 (2026-08-22)

Spec: `docs/33-DESIGN-SYSTEM-AND-THEMING-SPEC.md`. Phase 1 only — the token
foundation. Phases 2–6 (codemod, components, shell, screen parity) are not started.

### Decisions taken

- **Light is the product default**, dark is opt-in, `system` remains selectable.
  Light lives on `:root`, so a first-time visitor needs no class and no script.
- Colors are CSS custom properties consumed through semantic Tailwind names.
  No `dark:` variants — an element declares intent once (`bg-surface`) and the
  theme switch is a single class on `<html>`.
- Preference persists in a **cookie**, not `localStorage`: the server renders this
  app and cannot read `localStorage`, which would flash the wrong theme on load.
- Fonts are **self-hosted** (64KB, latin subsets) rather than CDN-linked.

### Contrast failures found and fixed

The new contrast test rejected four inherited values:

| Token | Was | Now | Measured |
| --- | --- | --- | --- |
| dark `fg-muted` | `#6B7B75` | `#8A9A94` | 4.0:1 → 6.6:1 on the canvas |
| light `fg-muted` | `#77857F` | `#63706A` | 3.65:1 → 4.90:1 |
| light `primary` | `#0B8D4D` (mockup swatch) | `#0A7F45` | 4.03:1 → 4.80:1 as text, 5.08:1 under white |
| dark `info` | `#3B82F6` | `#60A5FA` | 3.86:1 → 5.58:1 on a card |

**Documented deviation from the mockup:** dark-mode `on-primary` is near-black
(`#06170F`), not white. In dark mode the brand green cannot do both jobs — reading
as text on `#0B0D09` needs luminance ≥0.195, carrying white text at 4.5:1 needs
≤0.183. Keeping `#4DB175` vivid and putting dark text on the fill gives 6.9:1; the
mockup's white label measures 2.7:1. Same pattern Material 3 uses for dark themes.
Reversible in one token if brand fidelity is preferred over AA.

### Files changed

- **New:** `assets/css/tokens.css`, `assets/css/fonts.css`, `composables/useTheme.ts`,
  `plugins/theme.ts`, `pages/dev/theme.vue` (dev-only preview, 404s in production),
  `public/fonts/*.woff2` (3 files, 64KB)
- **Rewritten:** `tailwind.config.ts` — literal hex palette replaced with semantic
  token-backed colors
- **Edited:** `nuxt.config.ts` (css order, pre-hydration theme script, font preload,
  `/dev/*` auth exclusion), `assets/css/main.css` (body base colors, dark-scoped
  date-picker glyph inversion, tokenized scrollbars)
- **Migrated:** 13 `components/` files off the removed legacy color names
  (`text-text-muted` → `text-fg-muted`, `bg-surface-light` → `bg-surface-3`, …)

### Database changes

None. This phase is presentation only.

### Tests

- `tests/unit/design-tokens.spec.ts` — 47 tests: light/dark token parity, channel
  ranges, and WCAG AA contrast on 21 foreground/background pairs per theme
- `tests/unit/use-theme.spec.ts` — 7 tests: default, cookie name stability,
  explicit vs `system` resolution, toggle-against-what-is-on-screen, invalid input

### Validated

`test:unit` **370/370** (was 300; +54 new + 16 from other work) · `typecheck` clean ·
production `build` succeeds · build output confirms tokens compile with working
opacity modifiers, both themes ship, fonts are emitted, and the pre-hydration
script is in the renderer. New/changed files lint clean; the 66 pre-existing lint
errors elsewhere are untouched.

### Known limitation

~1,900 hardcoded hex classes across 55 files still render dark values in both
themes. Toggling the theme on a real screen therefore changes very little until
Phase 2 runs the codemod. `/dev/theme` exists so the token layer can be reviewed
on its own before that.

### Phase 1 follow-up (2026-08-22)

- **`components/ui/ThemeToggle.vue`** — sun/moon sliding switch replacing the
  three-way segmented control as the quick toggle. Sun left, moon right, thumb
  travels between them; `role="switch"` with `aria-checked` so Space/Enter and
  screen readers work without extra handling; transform transition disabled under
  `prefers-reduced-motion`. Not dev-only — this is the component Phase 4 mounts in
  the sidebar footer and the mobile Profile header.
  The switch is binary by design; `system` stays reachable from Settings, and
  flipping resolves against what is on screen so a `system` user never gets a no-op.
- **`pages/dev/theme.vue` now renders real data.** The sample rating/rank cards
  were the only invented values in the codebase — every other page already fetches
  from the API. They now read the signed-in player's actual singles rating,
  provisional flag, matches played, server-computed rank, display name and city
  from `/api/v1/players/me`, `/api/v1/players/me/ratings` and `/api/v1/rankings` —
  the same endpoints `pages/dashboard.vue` uses. Loading, error, unrated and
  unranked states are all handled, and the rating-tier legend underlines the
  player's real tier.

`test:unit` 370/370 · `typecheck` clean · `build` succeeds · new files lint clean.

No component test: `vitest.config.ts` has no Vue SFC plugin wired in yet, and the
toggle holds no logic of its own — it delegates to `useTheme()`, which is covered.
Phase 3 needs SFC mounting for the component gallery and should add it then.

### Verified in a real browser (2026-08-22)

Ran the dev server and drove `/dev/theme` with Playwright rather than assuming it
worked. Confirmed: `data-theme` flips light↔dark, `--dnl-canvas` goes
`247 249 248` → `11 13 9`, `--dnl-primary` `10 127 69` → `77 177 117`, the thumb
travels 5px → 29px, `aria-checked` tracks state, Inter loads, and the `dnl-theme`
cookie persists the choice so SSR renders `class="dark"` on reload with no flash.

Three real defects the browser run caught, all fixed:

- **Switch thumb was invisible in light mode.** `bg-surface` (white) on
  `bg-surface-2` (#F2F4F7) is 1.05:1 — fine at 6× zoom, a flat blob at the
  control's real 56×32px. Added `--dnl-switch-track` / `--dnl-switch-thumb`: the
  thumb must read as *raised above* the track, and that is opposite directions per
  theme (light lifts whiter on a grey track; dark lifts to #5A7A70 on #14201C).
- **Theme transition was being cut off mid-flight.** `markSwitching()` removed
  `.dnl-theme-switching` after 200ms, but `useHead` patches the `dark` class
  asynchronously, so colours were still ~80% through when the window closed and
  froze part-way. Window widened to 500ms.
- **Tailwind config changes need a dev-server restart.** New color keys did not
  generate utilities under HMR — `bg-switch-thumb` silently resolved to
  transparent until the server was restarted. Worth knowing during Phase 2/3.

`test:unit` 370/370 · `typecheck` clean · `build` exit 0 · lint clean on changed files.

## Phase 2 — token codemod applied (2026-08-22)

The app now actually responds to the theme switch. Every hardcoded colour class
in the UI layer is gone.

### What ran

`scripts/theme-codemod.mjs` (`npm run codemod:theme`, `--dry` to preview):

| | count |
| --- | --- |
| Files changed | 42 of 59 |
| `-[#hex]` classes → tokens | **1,963** |
| `text-white` / `text-canvas` classified | 484 |
| → `text-fg` (body copy) | 345 |
| → `text-on-primary` (label on a brand fill) | 122 |
| → `text-on-accent` (dark label on a bright fill) | 6 |
| → kept literal `text-white` (deep red fills) | 11 |
| Unmapped hex left untouched | 0 |

30 distinct hex values covered the whole codebase. Some map by *prefix*, not just
value: `#2E4540` is `border-border` as a border but `bg-surface-2` as a fill;
`#F5A623` is `text-warning` as text but `bg-warning-fill` as a fill.

### Three classifier bugs found while running it

- **`to-` matched inside ordinary utilities.** The "does this element paint its
  own background" regex had no word boundary, so `pointer-events-auto` and
  `auto-rows-min` read as gradient stops and short-circuited the classifier.
- **Ternary branches poisoned each other.** A `:class` is one double-quoted
  string containing two single-quoted branches, so
  `isFollowing ? '… hover:bg-danger/20' : 'bg-primary text-white'` let the first
  branch's red decide the second branch's label. The codemod now recurses into
  nested quotes and scores each branch on its own.
- **Class strings in `<script>` were invisible.** Object literals and computed
  returns (`return 'bg-primary text-white'`) sit in no HTML tag. A second
  whole-file sweep covers them — deliberately with *no* outer context, since
  "somewhere in this file" is not a background.

### Left for a human, by design

The codemod reports what it will not guess at. Four survived, three of them
correctly: two `bg-red-400/80` avatar chips and `bg-danger` in `UiButton` keep a
white label. The fourth — `trendClass` in `pages/players/[playerId].vue`
returning a bare `'text-white'` with no fill in scope — was fixed by hand to
`text-fg`.

### Also fixed

**The date-picker glyph was invisible in dark mode.** The old `filter: invert(1)`
predated `color-scheme`. Now that tokens.css declares `color-scheme` per theme,
the browser already draws a light glyph in dark mode and the invert flipped it
straight back to black-on-black. Removed; `color-scheme` does the work.

### Guard

`npm run check:tokens` (`scripts/check-no-hex-classes.mjs`) fails on any new
`-[#hex]` class, or any `text-white` not sitting on a red fill. Wire it into CI.

### Validated

`test:unit` 370/370 · `typecheck` clean · production `build` exit 0 · `eslint`
**0 errors** across `pages components layouts scripts` (14 pre-existing
`require-default-prop` warnings) · `check:tokens` passes on 59 files.

Driven in a real browser at `localhost:3000`: the landing page renders correctly
in both themes with real data, tokens resolve to live values
(`rgb(10,127,69)` light / `rgb(77,177,117)` dark, including alpha variants like
`rgba(10,127,69,0.1)`), and there are no page errors.

### Note

Tailwind does **not** hot-reload `tailwind.config.ts`. New colour keys silently
resolve to transparent until the dev server restarts — this cost time twice.

## Phases 3–4 complete, Phase 5 begun (2026-08-22)

### Phase 3 — design system

`@vitejs/plugin-vue` added as a devDependency so Vitest can mount SFCs at all —
that is why `components/ui/*` had no tests before. 26 component tests now cover
the parts a screenshot cannot catch: which element renders, what ARIA is
emitted, whether a disabled control is really inert, whether a value can escape
its bounds.

- **New:** `UiIcon` (+ `utils/icons.ts`, 45 glyphs), `UiAvatar`, `UiTabs`,
  `UiSegmented`, `UiSelect`, `UiDataTable`, `UiLineChart`, `UiPodium`,
  `UiStepper`, `UiErrorState`, `UiToaster` + `useToast()`
- **Rewritten:** `UiButton` (5 variants; renders `<a>` when given `to`, falls
  back to `<button>` when disabled), `UiInput` (leading icon, always-present
  label), `UiModal` (focus trap, Escape, scroll lock, focus restore),
  `UiEmptyState`, `UiRatingBadge`, `UiTrendIndicator`

**`UiLineChart` uses no charting library.** Inline SVG with a
visually-hidden `<table>` of the same series, per docs/33 §5.8 — a single
smoothed line did not justify 40–90KB.

### The rating scale in the mockups does not exist in this platform

The mockups show ELO-style ratings ("1854") with four medal tiers
(Gold 1900+ … Iron <1400). The real scale is `numeric(5,3)` constrained to
**2.000–8.000** (DUPR-style) with **nine** named bands in
`server/domains/rating/data/question-bank.ts`.

`components/ui/RatingBadge.vue` carried a *third*, wrong table (five tiers at
3.0/3.5/4.5/5.5) matching neither. Per CLAUDE.md §7 the implemented rule wins
over an invented one: `utils/rating-tiers.ts` now mirrors the nine real bands,
grouped onto the mockup's four-medal *visual* language, and
`tests/unit/rating-tiers.spec.ts` fails if the mirror ever drifts from the
server table. Ratings render at three decimals — two would show genuinely
different players as the same number.

### Phase 4 — shell

Sidebar user card (avatar, name, rating, tier), `UiThemeToggle` mounted in the
sidebar footer, mobile drawer and public header, three-way Appearance section in
Settings, `env(safe-area-inset-bottom)` on the bottom bar, `UiToaster` mounted
once. "Messages" from the mockup is deliberately absent — messaging is outside
MVP scope and a nav item that goes nowhere is worse than none.

Two codemod judgement-call misses were found and fixed here: sidebar nav items
had `hover:text-on-primary` (should be `text-fg`), and the green logo chip had
`text-fg` (should be `text-on-primary`).

### Phase 5 — Rankings rebuilt on real data

**The Trend column was `Math.floor(Math.random() * 20)`** — a fresh random
number on every render. This was live in the app, not in any preview page. An
earlier claim in this log that the only invented values were in `/dev/theme` was
wrong; the sweep that produced it did not look for `Math.random`.

Also fixed on that page: pagination was seven hardcoded dead buttons reading
"1 2 3 … 25" on a five-player ladder, and ratings rendered through
`Math.round()`, so 4.290 and 3.547 both displayed as "4" and "3".

Real trend needed backend work, done through the full layering:

| Layer | Change |
| --- | --- |
| DTO | `RankingEntryDto.trend_delta`, new `RankingPageDto` |
| Repository | `countRankings()`, `getTrendDeltas()` over `rating_transactions` |
| Service | `RANKING_TREND_DAYS = 7`, joins page + total + deltas |
| Controller | `meta.total` added; `data` shape unchanged for existing callers |
| UI | `UiPodium`, `UiDataTable`, `UiTrendIndicator`, real pagination |

`trend_delta` is **null**, not zero, when a player has had no rated match in the
window — "hasn't played" and "held steady" are different facts and the table
renders them differently. Five service tests cover that distinction, the total
count, and the window.

No database migration was needed: `rating_transactions.rating_delta` and
`created_at` already existed.

### Validated

`test:unit` **408/408** (was 370) · `typecheck` exit 0 · production `build`
exit 0 · `eslint` **0 errors** across pages/components/composables/utils/layouts/
scripts/tests/server · `check:tokens` passes on 70 files.

Driven in a real browser: Rankings renders correctly in **both** themes with
live data — real 3-decimal ratings, real podium, honest `—` trend, "5 ranked
players" instead of 25 fake pages.

### Note on verification limits

Headless Chromium cannot sign in, so only public routes (`/`, `/rankings`,
`/dev/theme`) have been verified visually. Dashboard, Player Profile, Club Page,
Match Details, Matches, Submit Match, Events and Notifications are all
auth-gated and have **not** been seen rendered.

### Also fixed

Four pre-existing `vue-tsc` errors in test mocks: `EventRepository` gained
`countBlockingChildren`/`deleteWithChildren` in uncommitted work and the fakes
were never updated. Earlier "typecheck clean" claims in this log were unreliable
— the command was being piped to `tail -6`, which showed only the Nuxt banner.
Typecheck must also be run with the dev server **stopped**: otherwise it races
`.nuxt` regeneration and reports phantom errors.

## Phase 5 mostly done, Phase 6 green (2026-08-22, later)

### Screens rebuilt

- **Match Details** — the verification timeline the mockups build the screen
  around. Every step derives from stored facts (`created_at`, each
  verification's `responded_at`, the match's rating transactions); a step that
  has not happened is absent rather than guessed. Needed a vertical slice:
  `RatingRepository.findTransactionsByMatch` → `RatingService.getTransactions
  ForMatch` → `GET /api/v1/matches/:id/rating-changes`, plus
  `PlayerProfileRepository.findByIds` for bulk name resolution. Shows **both**
  sides of the zero-sum swing, which is what pre-empts disputes.
- **Dashboard** — 12-bar sparkline → `UiLineChart` with the mockup's
  7D/1M/3M/6M/1Y/ALL range toggles. The bars had no time axis, so two ratings a
  year apart sat beside two from the same afternoon.
- **Player Profile** — same chart swap; tabs now `UiTabs`, route-query backed
  (`?tab=matches`) so a tab is linkable and the back button works.
- **Submit Match** — score fields are `UiStepper`. Scores became numbers, and
  validation now rejects a tied set, which also makes an accidental all-zeros
  submission impossible (the old check only caught it because fields started blank).
- **Notifications** — grouped under Today / Yesterday / explicit date.
- **Matches list — new page.** `pages/matches/index.vue` did not exist; the
  mobile tab and sidebar sent "Matches" straight to the submit form, so there
  was no way to find the match blocking your rating. Status chips (All /
  Pending / Verified / Disputed) with live counts, URL-backed.

### Phase 6

`tests/e2e/theme.spec.ts` — 17 tests: light-by-default with no cookie, tokens
resolving differently per theme, the switch persisting across a reload, the
thumb travelling left→right, `body` painting the canvas token, every public
route rendering differently per theme, and **axe (wcag2a/2aa/21a/21aa) on 4
routes × 2 themes**. `@axe-core/playwright` added as a devDependency.

### Bugs the axe pass found — all real, all fixed

- **No page in the app set a `<title>`.** Every route failed `document-title`.
  Fixed globally in `app.vue` with a `titleTemplate` function (the `%s` string
  form cannot express a fallback) plus titles on 17 pages.
- **`bg-white text-primary` CTA on the landing page** — 2.67:1 in dark, because
  primary flips to the light green while the button stayed white. Now
  `bg-canvas text-primary`, which passes in both. The same banner's `text-fg`
  became `text-on-primary`, and three `bg-white/5` overlays became `bg-fg/5` —
  they were invisible on a light canvas.
- **Avatar initials** — tinting the letters *and* the background with the same
  colour gave 4.13:1 light / 4.11:1 dark. The background now carries the
  identity and the initials are always `text-fg`.
- **Dark `fg-secondary` (4.41:1) and `fg-muted` (3.49:1) on `surface-2`.** The
  token test only checked `canvas` and `surface`, but `surface-2` carries count
  pills, the Draft pill, segmented tracks and every nav hover. Raised to
  `#B6BBB7` / `#A2B2AC`, and three `surface-2` pairs added to the token test so
  this class of gap cannot recur.
- **Two "Log in" links on `/`** — introduced by the Phase 4 public header, which
  duplicated the landing page's own. The layout header is now suppressed on `/`,
  and the landing header gained the theme toggle it was missing.
- **Dashboard carried its own wrong 5-tier rating table**, so the dashboard and
  a player's own badge could disagree about their tier. Now `tierForRating`.

Two stale E2E assertions were failing before this work (landing copy changed in
uncommitted work); both updated.

### Validated

`test:unit` **433/433** · `test:e2e` **39/39** · `typecheck` exit 0 ·
`build` exit 0 · `eslint` 0 errors · `check:tokens` passes.

### Still outstanding

- Club Page (cover photo, values bullets, 2-up events, club rank)
- Events screen filters ("All Status" / "All Regions") and image-led cards
- Dev-only component gallery
- Verifier display names on Match Details (the match DTO carries ids only)
- **No authenticated screen has been verified visually** — headless Chromium
  cannot sign in. Dashboard, Profile, Match Details, Submit, Matches and
  Notifications are typecheck/test/build-clean but unseen.

## Phases 3–6 complete (2026-08-22, final)

### Remaining Phase 5 screens

- **Events** — added the mockup's status filter and image-led cards. Found and
  fixed a live bug while doing it: the page's `statusConfig` was keyed on
  `published`/`in_progress`, but the real `EventStatus` union is
  `draft | published | active | completed | cancelled`. There is no
  `in_progress`, and `active` was missing entirely — so every in-progress event
  rendered with an unstyled status pill. The map is now typed
  `Record<EventDto['status'], …>`, so adding a status without styling it fails
  the build.
- **Club Page** — generated cover banner with the logo tile overlapping it, as
  drawn.
- **Match Details** — verifiers and the submitter now show real names. The
  detail endpoint returns a `players` id→name map, resolved with one bulk
  lookup, because `match_verifications` has no foreign key to `player_profiles`
  that PostgREST can traverse.

### `/dev/components` — the gallery earned its keep immediately

Every variant of every primitive, both themes, including the loading, empty and
error states that get built once and never looked at again.

Axe on it found **24 serious violations in light and 21 in dark** — components
that never co-occur on a public route, so the route-level sweep could not see
them. All four causes were systemic:

- **`UiRatingBadge` had the same bug I had just fixed in `UiAvatar`** — tier
  colour text on a wash of that same colour, 2.4–4.4:1. The wash now carries the
  identity and the text is `text-fg`. An `opacity-80` on the tier label was
  compounding it.
- **`--dnl-primary-soft` was the raw primary in dark mode**, on the assumption
  every caller would add `/20`. But `bg-primary-soft` is used *without* alpha
  for the active sidebar item and the highlighted rankings row — so both were a
  block of vivid green carrying text at **1.0:1**. This was live in the shell.
  It is now a real solid tint (`#1A3325`), chosen dark enough that a losing
  trend (`danger`) also clears AA inside that row.
- **`opacity-70` on segmented-control counts** — dimming already-muted text.
- **Light `danger`** darkened to `#D01E1E`; `#DC2626` was 4.36:1 on the
  highlight row.

After the fixes: **zero serious violations in both themes.** Four `primary-soft`
pairs were added to the token test so this class of bug cannot come back.

### Cover images: not faked

The mockups show photographic club covers and image-led event cards. No
`cover_image_url`, `logo_url`, or any image column exists on events, clubs, or
anywhere in the schema. Rather than ship fake photos or a grey box,
`UiCoverArt` derives a stable gradient and monogram from the entity name — every
event looks distinct, the same event always looks the same, and nothing is
invented about the entity. It accepts a `src` already, so it becomes the
fallback when a real column lands.

### Final validation

`test:unit` **441/441** · `test:e2e` **39/39** · `typecheck` exit 0 ·
`build` exit 0 · `eslint` **0 errors** · `check:tokens` clean on 74 files ·
axe clean on 4 public routes x 2 themes and on the full component gallery.

Gaps that remain, and why, are catalogued in docs/33 §11. The largest is that
**no authenticated screen has been seen rendered** — headless Chromium cannot
sign in and no seeded account with a known password exists.

## Filters moved server-side (2026-08-22, later still)

Both "client-side filter" gaps from docs/33 §11 are closed. Both were bugs
waiting to happen rather than merely unpolished: each filtered only the rows
already loaded, so they worked on today's five players and would have started
lying silently as the data grew.

### Rankings search

Full slice: `RankingQuery.q` → `ilike` on `display_name` in **both**
`getRankings` and `countRankings` (using the existing `escapeLikePattern`
helper, so a user typing `%` searches for a literal `%`) → `q` param on
`GET /api/v1/rankings` → debounced 300ms input that resets to page 1.

The count applies the same filter, so pagination stays consistent with the
result set instead of offering pages that no longer exist.

Verified against the live database: `q=claude` returns 2 of 5 with
`meta.total: 2`, an unknown term returns 0, and the podium correctly hides while
a search is active.

### Events status filter

No backend work was needed — **the endpoint already accepted `status` and the
repository already filtered on it**; an earlier note in this log claiming
otherwise was wrong. The UI now sends the param instead of filtering the loaded
page in the browser.

### Attempted and abandoned: rendering authenticated screens without an account

Tried forging the client-side Supabase session cookie plus stubbing every
`/api/v1/**` call in Playwright, so the auth-gated screens could at least be
seen. It does not work, for two independent reasons:

1. `@supabase/ssr` rejects a hand-built cookie, so `useSupabaseUser()` stays
   null and the layout renders its signed-out shell.
2. More fundamentally, `useFetch` runs during SSR, and Playwright can only
   intercept requests made by the browser. The server-side calls would hit the
   real backend regardless.

Even had it worked, stubbed data would only have proven layout, not
integration. The scaffolding was deleted rather than left as a file that claims
to do something it cannot.

**Verifying authenticated screens needs a real session.** Either credentials for
an existing account, or explicit approval to register a test user — that writes
to the live Supabase project, so it is not something to do unasked.

### Validated

`test:unit` **442/442** · `test:e2e` **39/39** · `typecheck` exit 0 ·
`build` exit 0 · `eslint` 0 errors · `check:tokens` clean on 74 files.

## Rankings visual rework + light-mode depth (2026-08-22, final)

### Podium reworked against a supplied reference

Took the reference's *visual language* — plinths with #1 raised and centred,
tier-coloured trophies, larger winner avatar, rank numeral watermarked into the
base, atmospheric glow, two-line player rows. Did **not** take its data: prize
pools, "earn 2,000 points", a countdown, Daily/Monthly periods and a Reward
column have no schema behind them. The plinths carry rating, tier, matches
played and 7-day movement instead, and the table's "Followers" slot became
Matches (`matches_played`, already in the DTO).

The silhouette took two attempts. Using top margins to push #2 and #3 down
staggered their *bottoms* and produced three floating cards; the fix is
`items-end` plus differing plinth heights. Verified all three bottoms land on
the same pixel.

### Light mode had no depth at all

Reported as "no shade", and correct: the plinth was `#FFFFFF` on a `#F7F9F8`
canvas — **1.06:1**, literally invisible — with `shadow-card` at 0.08 alpha.

The instructive number is that dark's plinth-to-canvas ratio is only **1.38**.
Depth in dark comes from a surface being *lighter* than a near-black canvas.
Light cannot use the same trick: going darker than the canvas reads as a hole,
not a raised block. Light-mode depth has to come from **shadow**, and there
essentially wasn't any.

- New `--dnl-plinth` token: `#EFF3F1` light (a visible tint that still keeps
  `fg-muted` at 4.63:1 on it) / `#1E2E2A` dark.
- New `--dnl-shadow-raised`, cast upward and wide — a plinth is lit from above
  and grounded at its base.
- `--dnl-shadow-card` strengthened in light (0.08 → 0.10 with a wider spread)
  and `card-hover` to 0.16. Dark shadows left understated, since dark surfaces
  already separate by lightness. This lifts every card in the app, not just the
  podium.
- Plinth borders moved to `border-strong`; `border` was 1.17:1 on the canvas.

### A Tailwind naming collision worth knowing about

`shadow-plinth` silently resolved to *no shadow*. Tailwind derives
`shadow-<color>` utilities from the colour palette, so a colour named `plinth`
and a boxShadow named `plinth` both emit `.shadow-plinth` — and the colour rule,
coming later in the sheet, sets `--tw-shadow: var(--tw-shadow-colored)` and
blanks it. The computed style showed two transparent shadows and nothing else.
Renamed the shadow to `raised`. **Never give a boxShadow the same key as a
colour.**

### Validated

`test:unit` **442/442** · `test:e2e` **39/39** · `typecheck` exit 0 ·
`build` exit 0 · `eslint` 0 errors · `check:tokens` clean ·
axe **zero serious violations** on /rankings in both themes.

## Green plinth gradient + podium on the landing page (2026-08-23)

### Mint gradient on the plinths

`--dnl-plinth` moved from neutral grey to mint (`#E8F5EE`) with a new
`--dnl-plinth-deep` (`#D6ECDF`) for the gradient foot. The podium is the brand
moment on the page and a green plinth ties it to the identity.

`#E8F5EE` is as saturated as this can go: it holds 12px muted text at 4.62:1,
and the next step down (`#E2F2E9`) drops to 4.46 and fails AA. The deeper stop
sits at the foot of the plinth where only the rank watermark lives, so no small
text is ever on it. Dark gets the same treatment inverted — `#1E2E2A` settling
to `#16241F` at the foot.

### Landing page rankings now use the same podium

`pages/index.vue`'s Rankings tab renders `UiPodium` for the top three above the
list, with the same glow. Sharing the component means the landing page and
`/rankings` cannot drift apart.

### A fourth duplicate rating-tier table, found and removed

`pages/index.vue` carried its own `getRatingTier` — the **fourth** copy in the
codebase after `RatingBadge`, `dashboard.vue` and the server table. Its names
disagreed with the rating domain (it called 4.6 "Advanced"; the domain says
"Expert"), and it used raw Tailwind palette colours (`text-purple-400`,
`text-yellow-400`) that ignore the theme entirely. It also rendered ratings at
`toFixed(2)`.

Now delegates to `tierForRating` and `formatRating`, so every surface in the app
agrees about what tier a rating is. That is all four copies eliminated.

### Validated

`test:unit` **442/442** · `test:e2e` **39/39** · `typecheck` exit 0 ·
`build` exit 0 · `eslint` 0 errors · `check:tokens` clean · axe **zero serious
violations** on `/` (rankings tab) and `/rankings`, both themes.

## Podium made three-dimensional (2026-08-23)

Reported as looking 2D, and it was: a rounded rectangle with a vertical
gradient and a drop shadow reads flat no matter how strong the shadow gets. A
drop shadow says "this floats above the page", not "this is a solid object".

Three cues, none of which need an image asset:

1. **A trapezoid top face** (`clip-path`, narrower at the back than the front).
   That single piece of perspective is what tells the eye it is looking slightly
   down at a solid, and it is the cue that was missing entirely.
2. **Edge falloff across the front face** — an overlay darkening the left and
   right, lighter through the middle, as a block lit from the front would be.
   An overlay rather than a background so it composites over the vertical
   gradient, and it darkens only the edges, where no text sits.
3. **A seam at the top edge** — a white inset hairline over a dark border. A
   block's top edge is the highest-contrast line on it; without it the two faces
   blur into one painted rectangle.

### Light mode needed the opposite adjustment to dark

Dark had room to make a genuinely lit cap (`#2A4039` against a `#1E2E2A` face).
Light did not: the face already sat near the canvas ceiling, so the cap could
only be **1.06:1** brighter — invisible.

The fix was to push the *front face* down instead (`#E8F5EE` → `#D6ECDF`, foot
`#C7E4D1`), which gives the cap something to separate from. That in turn forced
the plinth's small text from `fg-muted` to `fg-secondary`: muted would have
failed on the darker face, secondary holds 5.09:1 even at the gradient's foot.
New `--dnl-plinth-top` token for the cap.

### Validated

`test:unit` **442/442** · `test:e2e` **39/39** · `typecheck` exit 0 ·
`build` exit 0 · `eslint` 0 errors · `check:tokens` clean · axe **zero serious
violations** on `/rankings` in both themes.

## Podium restyled to the second reference (2026-08-23)

Four structural changes, from a leaderboard reference the user supplied:

1. **The three blocks are joined into one stepped platform** rather than three
   separate cards with gaps. Equal thirds, touching, with only the outer corners
   rounded — that is what makes them read as one object.
2. **Large rank numerals on the block faces** instead of a faint watermark.
   Decorative (`aria-hidden`): the rank is already carried by position, the
   medal and the table, so its contrast is a styling choice rather than a
   legibility floor.
3. **The rating moved off the block into a pill above it.** This is the change
   that made the rest possible — with no text on the face, the block is free to
   be a saturated brand colour and reads as an object *on* the page rather than
   a panel *of* it.
4. **The medal moved onto the avatar**, the way the reference crowns its winner,
   instead of sitting on the block edge.

Block palette is the brand green in both themes — light `#6FBF95` → `#57AC80`
with a `#93D4B2` cap, dark `#2A6B48` → `#1E5236` with a `#3C8A5C` cap. The 3D
treatment from the previous pass (trapezoid cap, edge falloff, top seam) carries
over unchanged.

Not borrowed, again: the reference's prize money, points and rewards column. The
pill shows the rating, which is what this ladder ranks on.

### Validated

`test:unit` **442/442** · `test:e2e` **39/39** · `typecheck` exit 0 ·
`build` exit 0 · `eslint` 0 errors · `check:tokens` clean · axe **zero serious
violations** on `/rankings` in both themes.

## Event capacity on the event card (2026-08-23)

Event thumbnails now show remaining slots — "12 of 14 slots left" with a fill
bar — through the full layering.

| Layer | Change |
| --- | --- |
| DTO | `EventDto.registered_count?`, plus `SLOT_OCCUPYING_STATUSES` |
| Repository | `countByEvents(ids, statuses)` — bulk, keyed by event id |
| Service | `searchEvents` enriches; optional 5th constructor arg |
| Controller | list endpoint passes the registration repository |
| UI | `slotsFor()` + capacity bar on the card |

No migration needed: `event_registrations` and `max_participants` already existed.

### Three things it deliberately refuses to guess

- **A withdrawal frees its slot.** Only `registered` and `checked_in` occupy
  one, so a cancelled signup does not make an event look full.
- **Uncapped events show nothing.** `max_participants` is nullable; an event
  with no limit has no slots to be remaining, and "0 left" would be a lie.
- **Undefined ≠ zero.** `registered_count` is undefined when the caller never
  asked for it, which is a different fact from "nobody has signed up". Every
  other caller of `createEventService` constructs it without the registration
  repository and keeps working; the field stays undefined for them rather than
  defaulting to 0.

Over-subscription (manual additions, a race) clamps to "Full" rather than
rendering a bar past 100% or a negative remainder. Under a quarter remaining
switches the label and bar to the warning tone.

`countByEvents` is one query for the whole page — a per-event count would have
made a 20-card listing 21 round trips.

### Found while verifying: the events list is auth-gated but its data is public

`/events` redirects to `/login`, while `/events/:id` and `GET /api/v1/events`
are both public and the landing page advertises "Browse everything free". The
same gap exists for `/players` and `/clubs`: the `/x/*` globs in
`supabase.redirectOptions.exclude` do not match the bare `/x` index route.

Nothing is actually protected by this — the API serving that page is already
public — so it reads as an oversight rather than a decision. **Not changed:**
altering auth exclusions is the user's call. It is also why the new capacity bar
could not be screenshotted; the logic is covered by six unit tests and verified
against the live API instead (Saulog Tournament 1/16, Open Play 2/14).

### Validated

`test:unit` **448/448** (+6) · `test:e2e` **39/39** · `typecheck` exit 0 ·
`build` exit 0 · `eslint` 0 errors · `check:tokens` clean.

## Turnstile client IP, and light-theme card elevation (2026-08-23)

Two unrelated items: the last open Security finding from the 2026-08-22 audit,
and the light theme's missing depth.

### F-11 — Turnstile was being handed the proxy's IP

`requireTurnstile` called `getRequestIP(event)` with no options, so Cloudflare
received the socket address. On Vercel that is the edge, identical for every
visitor, which makes the `remoteip` signal uniform noise.

The naive fix — always pass `{ xForwardedFor: true }` — is worse than the bug.
`X-Forwarded-For` is client-controlled unless something upstream overwrites it,
so trusting it on a bare host lets a caller pin every request to an IP of their
choosing. Turnstile would then be scoring a fiction rather than scoring nothing.
That is why the finding was filed as "decide based on the deploy topology"
rather than as a one-line change.

The topology is now a configured fact instead of a guess:

| Layer | Change |
| --- | --- |
| `server/utils/trust-proxy.ts` | `resolveTrustProxy(env)` — dependency-free, so `nuxt.config.ts` can import it at config load |
| `nuxt.config.ts` | `runtimeConfig.trustProxyHeaders`, overridable as `NUXT_TRUST_PROXY_HEADERS` |
| `server/utils/client-ip.ts` | `getClientIp(event, trustProxy)` — reads the header only when trusted |
| `server/utils/require-turnstile.ts` | passes the resolved flag through |

Precedence: `TRUST_PROXY_HEADERS` when set (so a non-Vercel deployment behind
its own load balancer can opt in, and a Vercel deployment can opt out), then
Vercel auto-detection, then untrusted. A blank variable counts as unset rather
than as `false` — an empty Vercel project variable must not silently disable
the auto-detection sitting next to it.

`getClientIp` mirrors h3's `getRequestIP` precedence rather than calling it:
h3 is a transitive dependency, unresolvable from the Vitest runner under pnpm's
strict layout, which would have left the spoofing branch — the only part worth
testing — uncovered. 11 tests cover both the decision and the extraction.

### Light-theme cards had no elevation at all

The dark theme separates a card from the page by lightness (#1E2E2A on
#0B0D09). The light theme cannot: `--dnl-surface` is #FFFFFF against a #F7F9F8
canvas, which is **1.06:1**. Elevation is the only cue available, and 152 panels
across 36 files were carrying none — no border, no shadow. Light mode read as
one undifferentiated sheet.

The shadow tokens were not the problem; they were tuned in the 2026-08-22 theme
pass and are unchanged here. The problem was reach: two card idioms coexist,
and the dominant page-level one (`rounded-xl bg-surface p-5`) never adopted
`shadow-card`. `components/cards/*` already had it, which is why the components
looked right and the pages did not.

`scripts/card-shadow-codemod.mjs` applies it, deliberately narrower than a
find/replace:

- `bg-surface` matched as a whole token — `bg-surface-2` and `bg-surface/50` are
  nested rows and secondary fills, and a shadow on a row *inside* a card is
  worse than no shadow.
- Only card radii (`rounded-card`, `rounded-xl`, `rounded-2xl`). `rounded-button`
  and `rounded-lg` are inputs and buttons; a form field is not a card.
- Skeletons (`animate-pulse`) skipped — a shadow on a pulsing block draws the
  eye to the loading state.
- Anything already declaring a shadow left untouched.
- Panels that already animate a hover also get `hover:shadow-card-hover`, so an
  interactive card lifts the way `components/cards` already do.

Dark mode is unchanged: its shadow token is understated by design, so the same
class produces no halo there. Verified by screenshot on `/dev/components` and
`/rankings` in both themes.

### Three failures found here, all since resolved

See the next section — all three were fixed the same day. One of them turned out
not to be a repo defect at all.

### Validated

`test:unit` **459/459** (+11) · `typecheck` exit 0 · `build` exit 0 · `eslint`
0 errors · `check:tokens` clean · light and dark screenshots on
`/dev/components` and `/rankings`.

## Capacity wording, and "Registered" on the event card (2026-08-23, later)

Reported as a bug: on an event thumbnail the slots-left figure and the `2/14`
fraction "are not the same", the fraction being the true one.

Nothing was static. `slotsFor()` derives both from the same
`registered_count`/`max_participants` pair, confirmed against the live database
(Open Play: `max_participants` 14, two `registered` rows, none withdrawn) and
against `GET /api/v1/events` (`registered_count: 2`). The label was
arithmetically right and read wrong: `"12 of 14 slots left"` beside `2/14` puts
two fractions with the same denominator on one row pointing opposite ways, so it
scans as "12 filled".

| Screen | Was | Now |
| --- | --- | --- |
| Event card | `12 of 14 slots left` · `2/14` | `12 slots left` · `2/14` |
| Event detail | `2 / 14 players — 12 more needed` | `2 / 14 players — 12 slots left` |
| Tournament category | `12 of 16 places left` | `4/16 · 12 places left` |

"More needed" was the worse of the three: on an open-play session it implied the
event could not run without twelve more players. All three now singularise
(`1 slot left`).

### Already-registered indicator

An event thumbnail now carries a "Registered" badge when the caller already
holds a live registration for that event, through the full layering.

| Layer | Change |
| --- | --- |
| DTO | `EventDto.viewer_registered?`, `EventSearchQuery.viewer_player_id?` |
| Repository | `findRegisteredEventIds(playerId, ids, statuses)` → `Set` |
| Service | `searchEvents` attaches the flag; capacity and viewer lookups are now independently conditional |
| Controller | list endpoint passes the resolved player id |
| UI | badge over the cover art, top-left, opposite the status pill |

No migration needed — `event_registrations` already carries everything.

- **Undefined ≠ false.** A signed-out visitor gets no flag at all, so an absent
  badge never means "you are not signed up" to someone the request could not
  identify. The card renders it under `v-if="event.viewer_registered"`.
- **A withdrawal clears it.** Same `SLOT_OCCUPYING_STATUSES` filter the capacity
  count uses, so withdrawing removes the badge as well as freeing the slot.
- **One query for the page.** Ids only, filtered by player and by the ids
  already on screen.
- Restructuring `searchEvents` fixed a latent gap: the capacity round trip is
  skipped when nothing in the listing is capped, and the old early return would
  have skipped the viewer lookup with it. Covered by a test.

**Known gap:** the badge reflects event-level registration only. A player who
entered a tournament through a category (`tournament_registrations`) but never
registered at the event level will not see it. The event detail page's Register
button is the path that exists today for both, so this matches what the capacity
count on the same card already measures.

### Validated

`test:unit` **462/462** (+3) · `typecheck` exit 0 · `build` exit 0 · `eslint` 0
errors on the touched files · live query shape verified against Supabase
(player `0e636938…` → Saulog Tournament). Not screenshotted: `/events` is still
auth-gated, as noted in the previous section.

## Clearing the three reported failures (2026-08-23, later still)

All three items logged by the card-elevation pass are closed. One of them was a
misdiagnosis on my part, and correcting it matters more than the fix did.

### The axe failures were my own dev server, not the repo

`playwright.config.ts` starts `pnpm run preview` — a production build, no
devtools — but sets `reuseExistingServer: !process.env.CI`. Any `pnpm dev`
server already listening on :3000 therefore silently becomes the target of the
whole suite, DevTools toolbar and all. That toolbar's timing pill is a genuine
3.54:1 violation, so axe was right; it just was not looking at the app.

I had recorded this as "confirmed pre-existing on a clean `main`". That check was
real but worthless: `git stash -u` reverts the working tree and does nothing to a
running server, so the same dev server served both runs. **With :3000 free, all
39 e2e tests pass with no code change at all.**

Fixed regardless, because a suite whose verdict depends on what a developer left
running cannot be trusted: the scan now carries `.exclude('nuxt-devtools-frame')`.
Verified from both directions — 39/39 against `preview`, and 8/8 axe tests
against a deliberately started dev server, the exact case that used to fail.

### `prettier --check` is green: 209 files → 0

Two independent causes, and fixing either alone leaves it red.

**Real debt.** The repo had never been formatted consistently. These were
substantive reflows, not cosmetic noise — inlined `watch()` bodies, `{ a: string,
b: number }` where Prettier writes `;`, unwrapped chains.

**Line endings.** `core.autocrlf=true` checks files out as CRLF while Prettier's
`endOfLine` default is `lf`, so every file fails on a fresh clone no matter how
well formatted. Proven by taking a *passing* file, converting it to CRLF, and
watching the check fail. Without this half, the next clone re-breaks everything.

A root `.gitattributes` now pins the working tree to `eol=lf`. It changes no
committed content — the index was already LF — so the fix is invisible in the
diff, which is the point. `types/database.types.ts` is now in `.prettierignore`;
it is generated, and formatting it only creates a diff against the next
regeneration.

An early hypothesis that the whole thing was *only* line endings was wrong, and
testing it took two minutes: `utils/icons.ts` was already LF and still failed.

### The Prettier/Vue deadlock

`@confirm="destructiveModalOpen = false; toast.info(…)"` — Prettier splits it
and drops the `;`, the Vue compiler rejects the result, the build fails, and
re-adding the `;` is formatted straight back out. Extracted to a named
`confirmDestructive()`, the one form both tools accept. A grep confirmed it was
the only multi-statement inline handler in the codebase.

### Validated

`format:check` **0 files failing** (was 209) · `test:unit` **462/462** ·
`test:e2e` **39/39** · `build` exit 0 · `eslint` 0 errors · `check:tokens` clean.

`typecheck` reports one error, and it is not from this work:
`tests/unit/club-verification.service.spec.ts` fakes `PlatformAdminService`
without the `getFeatureFlags` / `setFeatureFlag` methods that a **concurrent
session** added while this ran. That session is mid-build on platform feature
flags — `023-platform-feature-flags/`, `server/utils/feature-flags.ts`,
`server/domains/platform/dto/`, `middleware/super-admin.ts`. Left untouched: it
is their in-flight work, and the fake belongs to whoever changed the interface.
It is the only typecheck error, so everything here is type-clean.

Note for the next session: `prettier --write .` reformatted that session's new
files too. Formatting is non-semantic and the build is green, but expect their
next write to land unformatted code that `format:check` will then flag.

## SuperAdmin, slice 1: feature flags (2026-08-23, later still)

First slice of `docs/30-SUPER-ADMIN-SPECIFICATION.md` §2.5. The Registered badge
shipped earlier today is its first flag, **off by default** — so as of this
change the badge is invisible to everyone until the SuperAdmin turns it on.

| Layer | Change |
| --- | --- |
| Database | `023-platform-feature-flags` — `feature_flags jsonb`, `feature_flags_updated_at`, `feature_flags_updated_by` on `platform_config` |
| DTO | `platform/dto/feature-flag.dto.ts` — the flag registry, `resolveFeatureFlags()` |
| Repository | `getFeatureFlags()`, `updateFeatureFlags(flags, userId)` |
| Service | `getFeatureFlags()`, `setFeatureFlag()` + `PlatformAdminServiceError` |
| Controller | `GET`/`PATCH /api/v1/admin/feature-flags`, both SuperAdmin-gated |
| Server util | `utils/feature-flags.ts` — `isFeatureEnabled(event, key)`, 30s cache |
| UI | `/admin/features` toggle console; nav entry for the SuperAdmin |

### Defaults live in code, overrides live in the column

The column stores only what a SuperAdmin has explicitly decided (`{}` means
"nothing overridden"). A flag's default has to be known *before* anyone has ever
written the map, and adding a flag must not need a migration. `resolveFeatureFlags`
merges the two and is deliberately strict: unknown keys are dropped, so a flag
removed from the registry cannot come back to life from an old stored map, and a
non-boolean stored value falls back to its default rather than being coerced —
`"false"` is truthy, and guessing there would enable something an admin turned
off.

### Gated on the server, not in the template

`GET /api/v1/events` consults the flag and simply does not attach
`viewer_registered` when it is off, so no client — stale bundle, direct API call,
or the future Flutter app — can surface the badge. This is the spec's "API
doesn't serve it", one endpoint at a time.

### A dead SuperAdmin check, found while wiring this up

`GET /api/v1/me/is-superadmin` read `platform_config` through the **caller's**
client. That table was created in 018 with RLS enabled and **zero policies**, so
the read returned no rows for everyone — the endpoint always answered `false`.
The Club Verification nav item never appeared and the `/admin/*` route guard
bounced the real SuperAdmin to `/dashboard`. Confirmed against the live database:
an anon-key select on `platform_config` returns `[]` while the service-role
select returns the row with `super_admin_id` set. Now reads with the service-role
client, like every other consumer of that repository already did; the identity
being checked still comes from the verified session.

### Migration NOT yet applied

`023-platform-feature-flags` is authored and in the master changelog but has not
run — this session has the Supabase API keys, not the Postgres password Liquibase
needs. Verified live that the column is genuinely absent (PostgREST `42703`), and
the repository treats exactly that code as "not migrated yet": it logs once and
serves registry defaults instead of failing every request that consults a flag.
Everything at default means the badge stays hidden, which is the intended state
regardless. Run `liquibase update` from `database/liquibase/` to enable the
toggle.

### Scope deliberately left out

- **Branding, 4-colour theme, hero, icons, config history.** Spec §2.1–2.4 and §9.
- The spec's §2.2 palette assumes a single light theme ("Dark mode — No"), which
  the shipped token system and light/dark switch have since overtaken. That
  section needs a decision before anyone builds it; noted here rather than
  silently reinterpreted.
- The spec's other flags (payments, tournaments, social, …) are not in the
  registry, because none of them is enforced anywhere yet. A toggle that changes
  nothing is worse than no toggle; each lands as it is genuinely wired.

### Validated

`test:unit` **475/475** (+13) · `typecheck` exit 0 · `build` exit 0 · `eslint` 0
errors on the touched files · live check of the pre-migration fallback path.

## SuperAdmin, slice 2: flags moved into the database, and theme palettes (2026-08-23, final)

Two directions from the product owner, both applied before anything shipped to
the live database:

1. **"Make sure feature flag is not hard coded."** The `023` migration authored
   earlier had not run yet, so it was rewritten rather than amended: flags are
   now rows in a `feature_flags` table, not a `jsonb` column driven by a
   TypeScript registry.
2. **"For colour palette it always has a counterpart for light and dark mode;
   better pre-suggested palette rather than custom."** The theme slice is a
   curated catalog where every palette carries both modes — not four free-form
   colour pickers.

### Flags are data now

| Layer | Change |
| --- | --- |
| Database | `023` rewritten — `feature_flags` table (key, label, description, enabled, display_order, audit), RLS public SELECT, no write policies, seeded with the badge flag disabled |
| DTO | `feature-flag.dto.ts` — record/DTO/map, `isEnabledIn()` |
| Repository | `feature-flag.repository.ts` — `listAll`, `findByKey`, `setEnabled` |
| Service | `feature-flag.service.ts` — `listFlags`, `getFlagMap`, `setFlag` |
| Controller | `GET`/`PATCH /api/v1/admin/feature-flags`, `GET /api/v1/platform/feature-flags` |
| Composable | `useFeatureFlags()` — shared per page load |
| UI | `/admin/features` renders whatever rows exist |

Nothing in code lists the flags any more. A key still appears where a feature is
gated — that is the gate, not the catalog — and **an unknown key reads as off**,
so a gate whose row was never seeded hides its feature instead of exposing it.
`PlatformAdminService` went back to `isSuperAdmin` only; flags own their service.

**The badge stays halted.** Its row seeds disabled and the events endpoint still
consults the flag before attaching `viewer_registered`.

### Theme palettes: pre-suggested, light and dark together

| Layer | Change |
| --- | --- |
| Database | `024-platform-theme` — `theme_palettes` (key, name, description, light/dark jsonb, order), `platform_config.active_palette_key` + FK + audit columns, RLS public SELECT |
| DTO | `theme-palette.dto.ts` — `PALETTE_TOKENS`, `sanitizePaletteColors()`, `hexToRgbChannels()`, `paletteToCss()` |
| Repository / Service | `theme-palette.repository.ts`, `theme.service.ts` |
| Controller | `GET /api/v1/platform/theme`, `GET`/`PATCH /api/v1/admin/theme` |
| Plugin | `plugins/palette.ts` — inlines the palette stylesheet during SSR |
| UI | `/admin/theme` — palette cards showing both counterparts, plus a reset |

Four palettes seeded: **Court Green** (identical to today's tokens, so selecting
it changes nothing), **Deep Ocean**, **Sunset Clay**, **Violet Night**.

- **Brand tokens only.** A palette may set `primary`, `primary-hover`,
  `primary-soft`, `on-primary`, `accent`, `accent-soft`, `on-accent` — nothing
  else. Surfaces, text and status colours stay with the design system, so no
  palette can make body text unreadable, which is the failure mode a free-form
  picker has.
- **Anything that is not a six-digit hex is dropped** before it reaches the
  stylesheet. These values are interpolated into CSS served to every visitor;
  a stored string that is not a colour is a mistake or an injection attempt, and
  both fall back to the token's own value. Covered by a test that feeds it
  `#FFFFFF; } html { display: none } .x {`.
- **`html:root` / `html:root.dark`**, not `:root` / `.dark`: the palette rides in
  the head next to the bundled token stylesheet, and load order between them is
  not something a page should depend on. The extra element selector wins either way.
- **Inlined during SSR**, so the first paint already carries the brand. Fetching
  after hydration would flash the default green for a frame.
- No palette selected → no `<style>` at all → the design system's own tokens,
  which is what every deployment runs today.

### Found while smoke-testing: PostgREST reports a missing table as PGRST205

The pre-migration fallbacks originally matched Postgres's `42P01`. Running the
built server against the real database showed PostgREST answers a missing table
with its own `PGRST205` ("not found in the schema cache") instead — a missing
*column* does come through as `42703`, which is why the earlier check worked.
Both codes now count as "the migration has not run".

### Still not applied

`023` and `024` are authored and in the master changelog; the Postgres password
was mentioned but not included in the message, so `liquibase update` has not run.
Verified degradation against the live database in the meantime:
`GET /api/v1/platform/feature-flags` returns `{}` (everything off, badge hidden)
and `GET /api/v1/platform/theme` returns `{"palette":null,"css":""}` (built-in
colours). Both admin endpoints 401 unauthenticated.

### Validated

`test:unit` **486/486** (+14) · `typecheck` exit 0 · `build` exit 0 · `eslint` 0
errors on the touched files · `check:tokens` clean · live smoke test of all four
new endpoints against the built server.

## Migrations 023 and 024 applied to the live database (2026-08-23, applied)

Ran with the real Liquibase CLI (4.32.0, downloaded fresh into a scratch dir with
the PostgreSQL JDBC driver — neither is installed in this environment) against
the session-mode pooler, the same connection every prior migration used. The
password contains `&`, so it went in through `LIQUIBASE_COMMAND_PASSWORD` rather
than a CLI flag, per the note further up this file.

`status` showed **11** pending, `update` ran all 11, `status` afterwards reports
up to date. 192 changesets total.

### One older changeset was blocking everything behind it

`002-player::0003-add-barangay-column` failed with `column "barangay" of relation
"player_profiles" already exists` — the column had reached the live database
outside Liquibase at some point, and because Liquibase stops at the first
failure, nothing after it could run.

Fixed by guarding that changeset with a `MARK_RAN` precondition
(`<not><columnExists …></not>`) rather than force-syncing it locally: a fresh
database still needs the column created, and the next environment would have hit
exactly the same wall. Recording it as applied where it already exists is what
the precondition is for.

### Verified live, not assumed

- `feature_flags` — one row, `events.registered_badge` = **false**. The badge
  stays hidden, which is the point.
- `theme_palettes` — four rows: court-green, deep-ocean, sunset-clay, violet-night.
- `platform_config.active_palette_key` — NULL, so the platform paints its own tokens.
- **RLS holds.** An anon key reads both tables fine and an anon `PATCH` of
  `feature_flags` affects zero rows (PostgREST returns `200 []`); the flag was
  still `false` and `updated_by_user_id` still NULL afterwards.
- **The palette pipeline works end to end.** With `active_palette_key` set to
  `deep-ocean`, `GET /api/v1/platform/theme` returned the expected CSS and the
  built server inlined it into the `<head>` of `/login` as
  `html:root{--dnl-primary: 11 105 199;…}html:root.dark{--dnl-primary: 88 174 234;…}`.
  Reset to NULL afterwards, so the platform is exactly as it was found and the
  choice remains the SuperAdmin's.

### The storage bucket for branding: two things to settle first

The bucket exists — `Images`, 50 MB limit, mime allow-list
`image/jpeg, image/jpg, image/png, image/svg`. Two problems before branding
uploads can work:

1. **`image/svg` is not the MIME type browsers send for an SVG.** It is
   `image/svg+xml`. As configured, every SVG upload will be rejected by Storage
   with a mime-type error. The allow-list needs `image/svg+xml`.
2. **The bucket is private** (`public: false`). A logo shown to every visitor has
   to be reachable, so either the bucket goes public (normal for branding assets)
   or the server mints a signed, expiring URL on each render. Both work; they are
   different code paths, which is why this is a question rather than a guess.

An SVG logo is also worth a thought regardless of MIME: an SVG uploaded to a
same-origin URL can carry script, so it wants either a public bucket on a
separate origin or `Content-Disposition`/CSP handling.

## SuperAdmin, slice 3: branding (2026-08-23, applied)

App name, logo and favicon, on the bucket the operator created. Migration
`025-platform-branding` is **applied live** (193 changesets total, status clean).

| Layer | Change |
| --- | --- |
| Database | `platform_config` gains `app_name`, `logo_path`, `favicon_path`, branding audit columns |
| DTO | `branding.dto.ts` — slots, allowed types, object paths, name fallback |
| Repository | `branding.repository.ts` (config row), `branding-asset.repository.ts` (Storage) |
| Service | `branding.service.ts` — read, rename, upload, clear |
| Controller | `GET /api/v1/platform/branding`; admin `GET`/`PATCH`, `POST`/`DELETE /api/v1/admin/branding/:slot` |
| Composable | `useBranding()` — one request per page load |
| UI | `UiBrandMark` (logo or monogram) replacing four hard-coded marks; `/admin/branding` |
| App | title template and favicon now follow the platform name |

### Paths are stored, URLs are minted

The row holds `platform/logo-<stamp>.png`, never a URL. The bucket is private
today, so a visitor needs a signed URL per render; if it is made public the same
path yields a stable public one. Storing a URL would bake one of those choices
into the row and go stale the moment the bucket setting changed. The stamp in the
filename is cache-busting: a replaced logo occupies the same slot, and without it
a public URL would keep serving the previous image.

Order on replace is upload → point the row at the new object → delete the old
one. Deleting first would leave the config referencing something already gone if
the update failed. Covered by a test asserting the call order.

### Verified against the real bucket

A self-test ran against live Storage with the service-role key:

- `upload png` → ok; `sign` → ok; `GET` signed URL → **200 image/png**
- `GET` public URL → **400**, confirming the bucket is private and that the
  signed path is the one actually in use
- `image/svg+xml` upload → **rejected: "mime type image/svg+xml is not supported"**
- test objects removed afterwards

That last line is the concrete version of the earlier warning: the bucket's
allow-list names `image/svg`, which no browser ever sends, so SVG cannot be
uploaded at all as configured. The UI therefore accepts **PNG and JPEG only**,
and `ALLOWED_IMAGE_TYPES` matches. Adding `image/svg+xml` to the bucket would
also mean accepting a format that can carry script from the app's own origin —
worth a deliberate decision rather than a config tweak.

The S3-compatible credentials offered for this were not used and are not stored
anywhere in the repo: the server already holds the service-role key, which is
what Storage uploads and URL signing need.

### A note on the working tree

Midway through this slice the entire working tree briefly disappeared — a
`git stash` (and then a pop) ran outside this session, and two file-state checks
landed inside that window. Everything came back intact; the full suite was re-run
afterwards to confirm the restored tree matches what was built.

### Validated

`test:unit` **499/499** (+13) · `typecheck` exit 0 · `build` exit 0 · `eslint` 0
errors (8 pre-existing warnings) · `check:tokens` clean · live smoke test:
branding, flags and the login page title all served correctly by the built server.

## Account switcher restored to the sidebar (2026-08-23, later still)

Reported: "the switching from player to club is gone?" It was, and it had been
since this morning.

### Cause

Commit `d985f6c` ("light and dark theme") rewrote `layouts/default.vue` — 367 of
its lines — merging the sidebar's three separate blocks (main nav / account
switcher / bottom nav) into a single `<nav>` with a divider. The bottom-nav links
survived that merge. The switcher's wrapper did not:

```
-        <!-- Account Switcher -->
-        <div v-if="user" class="border-t border-[#2E4540]/50 px-2 py-3">
-          <AccountSwitcher />
-        </div>
```

The component file itself was kept and *retokenised in that same commit*, which
is what made this hard to see: `AccountSwitcher.vue` looks current and correct,
`useAccountMode()` still drives which nav items render, and the only surviving
references to the switcher anywhere in the app are four code comments pointing
at a component nothing mounts. `git grep '<AccountSwitcher' HEAD` returned
nothing.

Consequence: `accountMode` could still be *read* — the layout switches nav items
on it — but there was no longer any way to *change* it, so club mode was
unreachable for anyone not already in it.

### Fix

Restored the mount point at the foot of the desktop sidebar, above the user card,
in the current token vocabulary. That position is not arbitrary: the menu renders
with `bottom-full`, so it opens upward and only works anchored near the bottom.
The old `v-if="user"` was dropped as redundant — the whole `<aside>` is already
behind it.

### Verified by bundle, not by eye

A signed-in screenshot needs a live session, and the throwaway-password step
against the real Supabase project was declined by the permission layer — left
alone rather than worked around.

Verified structurally instead, which for a mount-point regression is arguably the
stronger check: `"Set up a club"` (a string unique to the switcher) is absent
from `default-*.mjs` in a build of `HEAD` and present in a build with this
change. The component was dead code; now it is wired into the layout on both the
server and client bundles.

### Still open

- [ ] The mobile drawer has no switcher — it had none before this regression
      either, so club mode has never been reachable on a phone. Pre-existing
      scope, deliberately not widened here.

### Validated

`format:check` clean · `test:unit` **499/499** · `test:e2e` **39/39** · `build`
exit 0 · `eslint` 0 errors.

Two environment notes worth carrying forward. `git stash -u` stashes an untracked
`.gitattributes`, so the checkout underneath it re-applies `core.autocrlf` and
every file comes back CRLF — `format:check` then fails on ~220 files that were
fine a moment earlier. Re-run `prettier --write .` after any stash cycle until
`.gitattributes` is committed. And `npm run build` deletes `.nuxt/dist`, which
puts any running `nuxt dev` server into a permanent 503 restart loop; because
`playwright.config.ts` sets `reuseExistingServer`, that broken server then gets
reused and the e2e suite times out waiting for it.

## Player mode is read-and-register; club mode runs events (2026-08-23, later still)

Three related asks: make the account switcher reachable on mobile, keep drafts
out of player mode, and confine every event-modifying action to club mode —
including the word "Publish".

### One gate, not scattered conditionals

`useAccountMode()` now exposes `isClubMode` / `isPlayerMode`, and each screen
derives a single named capability from it rather than testing the mode inline:

| Screen | Gate | Reads as |
| --- | --- | --- |
| `events/[eventId]` | `canManageEvent` | `isOrganizer && isClubMode` |
| `tournaments/[id]` | `canManageTournament` | `isOrganizer && isClubMode` |
| `clubs/[clubId]` | `canManageAnnouncements` | `isStaff && isClubMode` |
| `events/index` | `canCreateEvent` | `isClubMode` (already existed) |

`isOrganizer` survives as ownership-only and is now documented as something
almost nothing should branch on directly.

The subtle part is the *negative* branches. On the event page, two conditions
previously read `!isOrganizer` — "Register for this event to join the queue" and
the registered-player block. They now read `!canManageEvent`, which is what makes
the rule hold in both directions: an owner in player mode is not merely stripped
of controls, they are shown the participant view. Half-gating would have left
them in a state that is neither.

What player mode keeps, deliberately: register and withdraw, the registered
player list, the bracket, the matches, the rankings, the categories and who is in
them. What it loses: publish, delete, edit, add tournament, generate bracket,
confirm registrations, and the queue-matching console.

### Drafts

A draft is unpublished club work. Player mode now filters drafts out of the
events list, drops "Draft" from the status filter, and resets the filter to "All
Status" if the mode changes while Draft is selected — otherwise the select keeps
showing an option it no longer offers.

Deep-linking a draft in player mode renders a short explanatory panel rather than
an error: the viewer may well own it, so it says the event is still a draft and
that drafts live in club mode. Treating it as a 404 would have been a lie to the
one person who can actually see it.

The list filter is defence in depth, not the only guard — `events_select_public`
already withholds other people's drafts server-side. What it adds is hiding an
organiser's *own* drafts while they wear the player hat.

### Mobile

The switcher was desktop-only, so club mode was unreachable on a phone — a real
problem for a mobile-first product. The same component now renders in the mobile
drawer's footer (its menu opens upward, so the footer is where it works).

The drawer also needed to close on navigation. Every nav link already did that on
click, but the switcher navigates from inside its own component after an async
check, and on the "no club yet" path it lands on `/create-club` rather than any
link's href. A watcher on the settled route closes it, covering both and any
future in-drawer navigation.

Verified in the built layout chunk: `AccountSwitcher` is rendered at two sites —
the desktop `<aside>` and the teleported mobile drawer (`_push2`).

### Scope held at the line the request drew

Member approvals, role changes and club verification still go by role alone, not
by mode. Extending the mode gate there changes *who can act on a pending join
request*, which is a product decision rather than a UI one — logged in the
backlog rather than assumed.

### Validated

`test:unit` **504/504** (+5, `use-account-mode.spec.ts`) · `test:e2e` **39/39** ·
`typecheck` exit 0 · `build` exit 0 · `eslint` 0 errors · `format:check` clean.

Not verified by eye: every screen touched here is behind a login, and the
throwaway-password step needed to drive a real session remains declined by the
permission layer. The mode logic is unit-tested and the mount sites confirmed in
the bundle, but nobody has yet *looked* at player mode on a phone.

## Club roles: the UI the API was always waiting for (2026-08-23, later still)

Two things, one screen: expose the role-change API that nothing ever called, and
apply the club-hat split the product chose.

### The role API had no caller

`club_memberships.role` has been constrained to OWNER / ADMIN / MODERATOR /
MEMBER since `003-club`, `PATCH /clubs/{id}/members/{playerId}` has always
accepted a role, and `ClubService.updateMember` has held an explicit permission
matrix the whole time. A grep of the entire front end found no call that ever
sent one.

So in practice **every member was a MEMBER for life.** The only way anyone held
another role was creating the club, which assigns OWNER. The members list offered
one button — Remove — and nothing else.

There is now a role control on each member row, with options drawn from the same
matrix the service enforces:

| Acting as | May assign | To whom |
| --- | --- | --- |
| OWNER | ADMIN, MODERATOR, MEMBER | anyone except the owner row and themselves |
| ADMIN | MODERATOR, MEMBER | members and moderators only |

### A bug found while mirroring the matrix

The old Remove condition was `isAdmin && member.role !== 'OWNER' && not-self`,
which offered Remove to an ADMIN against another ADMIN. The service refuses that
("Admins cannot modify other admins") — and `updateMember` had no catch, so the
403 was swallowed and the row simply did not change, with no message. Both halves
are fixed: the condition matches the matrix, and failures now surface.

The mirroring is the risk here — two copies of one rule set — so
`club-member-permissions.spec.ts` pins the UI copy against the same cases the
service enforces. If the service changes, those tests fail.

### Option C, as chosen

Club administration is split rather than uniformly gated:

| Action | Needs the club hat? |
| --- | --- |
| Approve / reject join requests | **No** — works in both |
| Change a role | Yes |
| Remove a member | Yes |
| Request verification | Yes |
| Submit match / create event for the club | Yes |
| Announcements (write, pin, publish, delete) | Yes |

Approvals stay available in both hats on purpose: a pending request is a person
waiting to get into a club, and nothing else on the page has a third party
blocked on it. Every other action can wait for a deliberate mode switch.

`Create Event` was already club-mode-only on the events page, so leaving it
ungated on the club page had been the same inconsistency in a second place.

### The two-clubs hole is closed

`canManageAnnouncements` previously tested `isClubMode` alone, which let someone
acting as Club A publish for Club B. Every club-hat gate now goes through
`isActingAsThisClub` — club mode AND `activeClubId` being the club on screen.

That makes the controls disappear for staff who are on the page in the wrong hat,
so the members panel now carries a line naming the club to switch to. Controls
that vanish without explanation are worse than controls that are merely absent.

### Validated

`test:unit` **516/516** (+12) · `test:e2e` **39/39** · `typecheck` exit 0 ·
`build` exit 0 · `eslint` 0 errors · my files format-clean.

Still not verified by eye — the club page is behind a login and the
throwaway-password step remains declined.

### Worth deciding next

MODERATOR can now be assigned, and still grants nothing. `ClubService` says so
outright: "recognized as a role; carries no additional permissions in this pass".
Promoting someone to moderator changes a label and nothing else. Either give the
role powers (announcements is the obvious candidate — `isStaff` already includes
MODERATOR) or drop it from the assignable list so it stops implying authority it
does not carry.

## MODERATOR becomes a real role (2026-08-23, later still)

Instruction: a moderator may accept event requests, accept new club members, and
announce. The third already worked; the other two needed server-side permission
changes, not UI ones — and one of them needed a UI that had never been built.

### Announcements — already true

`announcement.service.ts` has admitted OWNER / ADMIN / MODERATOR since it was
written, and the club page gates on `isStaff`, which includes the role. Editing
*someone else's* announcement is still OWNER/ADMIN; a moderator edits their own.
No change made — checked rather than assumed.

### Club join requests — service change

`ClubService.updateMember` gated everything behind `ADMIN_ROLES`. It now
distinguishes a *join-request review* from every other membership change:

```
isJoinRequestReview =
  target.status === 'pending' && !input.role &&
  (input.status === 'active' || input.status === 'rejected')
```

Reviews admit `APPROVAL_ROLES` (owner, admin, moderator); everything else keeps
`ADMIN_ROLES`. The gate turns on the **target's state**, not on the status value
in the body — otherwise `status: 'active'` against an existing member would have
let a moderator reinstate someone, and `status: 'left'` is a removal however it
is spelled. Six tests cover the boundary, including that same-input-different-
target case.

### Event registrations — service change plus the missing screen

`updateRegistrationStatus` called `assertEventOrganizer`: the event's creator and
nobody else. A new `assertCanReviewRegistrations` widens it to the hosting club's
owner, admin and moderator, leaving edit/publish/cancel/delete organiser-only.

It degrades to organiser-only when no membership repository was supplied rather
than throwing, so the service's other callers keep their current behaviour. The
registrations endpoint now passes one — it never had.

`PATCH /api/v1/registrations/{id}` turned out to have **no caller at all**. The
tournament page rendered "3 awaiting approval" as dead text: the queue was
visible and unactionable. There are now Approve / Reject buttons per pending
entry. `waitlisted` is accepted by the endpoint but not offered — there is no
waitlist concept in the UI, and half-building one is worse than leaving it.

### Where the two queues agree

Both reviews work in **either hat**, unlike every other management action.

That is the same reasoning behind option C: a pending request is a person waiting
for an answer, and making them wait on someone noticing they are in the wrong
mode costs real time. Nothing else in either surface has a third party blocked on
it, so nothing else got the exemption.

| Action | Roles | Hat required |
| --- | --- | --- |
| Review club join request | OWNER, ADMIN, MODERATOR | either |
| Review event registration | organiser, or club OWNER/ADMIN/MODERATOR | either |
| Announcements | OWNER, ADMIN, MODERATOR | club hat |
| Roles, removals, verification | OWNER, ADMIN | club hat |
| Publish/edit/cancel/delete an event | organiser | club hat |

### Validated

`test:unit` **522/522** (+6) · `test:e2e` **39/39** · `typecheck` exit 0 ·
`build` exit 0 · `eslint` 0 errors · format-clean.

Still unverified by eye — both screens are behind a login and the
throwaway-password step remains declined.

## Discovery, the default duo, and one ranking treatment (2026-08-23, later still)

Seven things that using the app surfaced. Six of them were separate; the seventh
— the duo — turned out to be sitting on a genuinely broken path.

### The event page opened on the wrong tab, showing the wrong thing

A public event landed on Info, and Info was frequently blank: it rendered a
Tournaments card, a Record Match link and a queue blurb, each behind its own
condition, so a plain published event opened on an empty panel. The description
typed at creation was a small paragraph in the page header and had never been
editable by anything — `PATCH /api/v1/events/{id}` has accepted `description`
since the event domain landed and no screen ever called it.

Players is now the default tab. Info leads with an "About this event" card
carrying the description plus a definition list of when / where / format / fee /
players / registration close. Organisers get inline editing of the description,
gated on `canManageEvent` (owner **and** club mode), not on ownership alone —
running an event is club-mode work, the same rule publish and delete already
follow.

### Two club directories, one of them unreachable

The sidebar linked "Verified Clubs" → `/verified-clubs`. The real directory at
`/clubs` was already titled "Discover Clubs" and was not in the nav at all.

They are one screen now. The nav item is "Discover Clubs" → `/clubs`;
`/verified-clubs` redirects to `/clubs?verified=1`, which lands with a
Verified-only toggle already on. `GET /api/v1/verified-clubs` is left in place
but no longer has a caller.

`/clubs` also carried a hardcoded three-option province dropdown — "Metro
Manila", "Cebu", "Davao" as plain strings. Club rows store PSGC names, so
"Metro Manila" could never match anything: the option was inert. It now uses
the same cascading `useLocationPicker()` province → city pair as the players
directory.

### "All Provinces" showed nothing, on both directories

Same three-layer cause on `/clubs` and `/players`: the page refused to fetch
without a filter, and the endpoint 400'd on an unfiltered call. So the option
labelled "All Provinces" cleared the list and said "Start searching".

Both guards are gone. Empty filters now mean everything. The repositories always
handled the unfiltered case correctly — they were never the problem — and both
still restrict to public+active rows and still page with `.range()`, so an
unfiltered browse is bounded and no broader than a search was.

### The default duo, and the doubles bug underneath it

New table `player_default_partners` (`027-default-partner`), one row per player,
`player_id` as the primary key so "one duo" is structural and changing it is an
upsert. **Deliberately not a column on `player_profiles`**: that table is
publicly selectable, while `partnerships` is restricted by RLS to the two
partners, and a `default_partner_id` on the public profile would leak exactly
the relationship that policy protects.

The behaviour is **pre-fill only**, chosen explicitly over auto-registration.
Setting a duo never enters anyone into anything: it pre-selects an editable
partner field in doubles match submission, event queue join, and tournament
registration, marks that player ★ in each list, and floats them to the top.
`removePartner` clears the duo on both sides — the FK only cascades when a
profile is deleted, so without that the pickers would keep offering someone who
is no longer a partner.

Wiring it up exposed a real bug. **Registering for any doubles tournament
category always failed.** `EventService.register` requires `partner_player_id`
(`PARTNER_REQUIRED`), the endpoint has always read it off the body, and
`pages/tournaments/[tournamentId].vue` sent `{ category_id }` and nothing else —
with no partner control anywhere on the page to fix it. That path now has a
per-category partner select, pre-filled from the duo. Per category rather than
per page, because mixed doubles and men's doubles are rarely the same partner.

### One ranking treatment

`/rankings` had the podium/table/tier/trend design; four other screens kept
their own. Extracted to `components/RankingBoard.vue` and applied to the landing
page's Rankings tab, event standings, the club profile's Top Members, and both
club-dashboard ladders. `/rankings` was refactored onto it first, as the
reference.

Two variants, because two shapes of ladder genuinely exist: `rating` (rating,
tier, 7-day trend) and `record` (wins–losses, for event standings, whose
endpoint deliberately carries no rating delta — `rating_transactions` is
select-own under RLS).

Three real defects died with the old copies: the club and community podiums
rendered nothing at all below three players, the club dashboard rounded
`numeric(5,3)` ratings to two decimals so members three thousandths apart read
as identical, and the landing page's rows below the podium were bespoke gradient
cards with their own medal colours. A fourth was found by a test while writing
this: with three or fewer players the whole ladder sits on the podium and the
table below it rendered its own "No ranked players yet" state directly under
three named players. The table is now dropped in that case.

`components/ui/RankBadge.vue` was the last primitive still on raw
`text-xs`/`text-sm`/`text-xl`; it is on the token scale now.

**Community was left alone on purpose** — it was excluded from the chosen scope.
It is the worst remaining offender and now a two-line swap.

### Landing nav

The tab row was `justify-start` inside a `max-w-6xl` container, so five pills
packed left under the brand and, below ~640px, overflowed with no way to reach
the last one. Now centred at `sm` and up, horizontally scrollable below it, on
`UiIcon` rather than emoji, with a hover lift and an animated underline on the
active tab — all of it behind `motion-safe` / `prefers-reduced-motion`.

### Validated

`typecheck` exit 0 · `lint` 0 errors (8 pre-existing warnings in PlayerCard and
Skeleton, both untouched) · `test:unit` **544/544** (+22: 10 for the duo service,
12 for RankingBoard) · `test:e2e` **39/39** · `build` exit 0 · `check:tokens`
clean. Formatting was applied only to the files this pass touched.

The four light-mode axe failures recorded on 2026-08-23 did not reproduce — all
39 e2e pass here, consistent with those having been the Nuxt DevTools toolbar,
which the preview build does not load.

### Migration applied

`liquibase update` ran against the live Supabase project on 2026-08-23 and all
four `027-default-partner` changesets applied cleanly — they were the only
pending ones, against 195 already-applied. `status` now reports up to date
(199 total).

Two things worth recording about reaching that database, because they cost time
and will cost it again:

- **`db.<ref>.supabase.co` is IPv6-only and this machine has no global IPv6
  address**, so the direct connection documented in the Liquibase README cannot
  be used from here. Migrations go through the **session** pooler on port 5432
  (`aws-0-ap-northeast-1.pooler.supabase.com`, user `postgres.<ref>`). Not the
  transaction pooler on 6543 — Liquibase needs session-level locks for
  DATABASECHANGELOGLOCK.
- **The project is in `ap-northeast-1`**, which is not obvious from anything in
  the repo; it was identified by matching the direct host's IPv6 address against
  the published AWS IP ranges.

Verified after applying: the table answers PostgREST (200 `[]`, where a missing
table 404s), an anonymous read returns no rows — the owner-only RLS policy is
live, matching how `partnerships` behaves — and the exact query the repository
issues (`select=*&player_id=eq.<uuid>` under the service-role key, which is what
the endpoint uses) succeeds with all three columns resolving by name.

The rollback path was **not** exercised. The changesets all carry explicit
`<rollback>` blocks, but proving them means dropping and recreating the table on
a live database, which is worth asking about rather than assuming.

### Still not verified in a browser

Every screen this pass touched except the landing page and the two directories
is behind a login, and no authenticated walkthrough has been run.

## Community trimmed to its own content, ranking filter consolidated (2026-08-23)

`pages/community.vue` had four tabs, two of which were duplicates of better
pages:

- **Rankings** — a second, lower-fidelity leaderboard: its own emoji-crown
  podium, and `Math.round()` on `rating_value`, so a 4.250 and a 3.500 both read
  as "4" and "3" on a `numeric(5,3)` column. Removed.
- **Clubs** — listed every club, which is exactly what `/clubs` (Discover Clubs)
  is for. Removed. `GET /api/v1/clubs/all` stays; `pages/index.vue` still uses it.

What that tab did own was the **Province → City → Barangay cascade**, which
`/rankings` did not have — it filtered by province only. The cascade moved to
`pages/rankings.vue`, so there is now one ranking surface and it can answer "who
is the best in my barangay?".

Details worth knowing:

- The `/rankings` URL now carries `province`, `city` and `barangay` as PSGC
  **names**, not codes — that is what `GET /api/v1/rankings` already filters on
  (the endpoint has accepted `city`/`barangay` since MVP-007; only the UI was
  behind), and it keeps a pasted link readable. Rehydrating a shared link walks
  the cascade one level at a time, awaiting each list, because a child list does
  not exist until its parent has loaded.
- `components/ui/Select.vue` gained a `disabled` prop. Dependent selects need
  it: a city list has nothing to offer until a province is picked, and the
  hand-rolled selects this replaced were already doing it natively.
- Community now shows Partners and Opponents only — the part no other page
  shows — and its subtitle no longer promises clubs.

Validation: `typecheck` clean, `eslint` clean on the changed files,
`prettier --check` clean on them, 544 unit tests passing, `nuxt build`
succeeding. Not verified in a browser — `/community` is behind a login.

### Two fixes from actually driving that page (2026-08-24)

Both found in a browser, neither by any check that passes on green:

- **A shared barangay link restored only its province.** `restoreLocationFromQuery`
  read `route.query.city` *after* awaiting the province's city list — but
  selecting the province moves `provinceName`, which fires the URL-sync watcher,
  which rewrites the query from state where the city is still empty. The city
  was gone before it was read. The three wanted names are now snapshotted before
  the first await. Verified: `?type=doubles&province=Bohol&city=City+of+Tagbilaran&barangay=Cogon`
  restores all three selects and renders "Top 3 Doubles · Cogon".
- **The dependent selects read as instructions.** They inherited Community's
  "Select province" / "Select city" placeholders, which — greyed out, next to an
  enabled "All Provinces" — made the filter row look like three controls where
  two were broken. They now name their own level ("All Cities", "All Barangays");
  the disabled state alone says "not yet".

## Duo partners moved under Community (2026-08-24)

The sidebar had a top-level **Partners** item for one doubles setting, while
Community — which holds every other list of people — had its own first tab also
called "Partners", meaning something else entirely (play history, not
partnerships). Two different things, one word, two places.

Now:

- `components/community/DuoPartnersPanel.vue` holds the whole former `/partners`
  page: duo list with the star control, remove, incoming and outgoing requests,
  every action unchanged. Its three sections render as a `UiSegmented` control
  rather than a second pill tab bar — stacking two identical tab bars read as if
  the tabs had broken.
- `pages/community.vue` is **Partners / Teammates / Opponents**. Teammates is the
  old play-history "Partners" list, renamed for what it is: anyone you have
  played alongside, open play included, no agreement required. Opponents is
  unchanged. The tab is URL-backed (`?tab=`).
- `pages/partners.vue` is a redirect to `/community?tab=partners`, following the
  `/verified-clubs` precedent — the path sat in the sidebar and is bookmarkable.
  It stays outside the Supabase `exclude` list, so a signed-out visitor still
  lands on `/login` exactly as before.
- `layouts/default.vue` drops the Partners nav item. Nothing else in the app
  linked to `/partners`.

Validation: typecheck clean, eslint clean, prettier clean, 544 unit tests
passing, build succeeding, and the compiled route manifest carries the
`/partners → /community?tab=partners` redirect.

**Not verified in a browser.** Both routes are behind auth and this environment
has no test-account credentials, so the tab switching, the segmented sections
and the redirect landing on the right tab have not been driven live.

## Eleven fixes from using the live app (2026-08-24)

Six phases from one plan, in dependency order: design-system fixes, an event-time
migration, bracket correctness, the tournament page restructure, queue fairness,
and duo-request parity.

### A — Design system

- **The invisible hover.** Six hand-rolled tab bars used `hover:text-on-primary`
  on a `bg-surface` tab. `--dnl-on-primary` is white in light and near-black in
  dark (`tokens.css:49`, `:160`), so the label vanished on hover in **both**
  themes. Now `hover:text-fg`, with `hover:bg-surface-2` where the bar sits on a
  surface (`surface-3` where the tab is already `surface-2`).
  `components/ui/Tabs.vue` was already right and is the reference.
- **Landing page had no depth in light mode.** `pages/index.vue` had *zero*
  `shadow-card` usages across ~30 card containers, on a theme whose light
  palette deliberately leans on shadow for separation (a white card on an
  off-white canvas separates by 1.06:1 — the shadow does all the work).
  21 containers now carry `shadow-card`, interactive ones
  `hover:shadow-card-hover`, and the hero and primary CTA `shadow-raised`.
  No token changes.
- **Landing burger menu.** Below `sm` the five section pills were a fixed strip
  that only scrolled sideways, so the last tabs were reachable only by dragging
  a row most people do not notice is scrollable. The strip is now `sm:block`
  only; below that a burger opens a panel carrying the five sections plus Log in
  and Get Started, which the header cannot fit at that width. Structure follows
  the app drawer in `layouts/default.vue`: scrim, sheet, close button, Escape to
  close, focus returned to the burger. The slide-in is behind
  `prefers-reduced-motion: no-preference`, same as `.dnl-tab-underline`.
- **`alert()` / `confirm()` retired.** `pages/events/[eventId]/index.vue` was the
  last file using them — eight calls. Withdraw, publish and delete are now
  `UiModal` (which already had the focus trap, focus restore, Escape and
  destructive styling and was used by nothing but `pages/dev/components.vue`);
  failures are toasts. The dialog stays up while the action runs so its loading
  spinner is visible, and closes in `finally`.

### B — Event start and end time (Liquibase 028)

`events.start_date` / `end_date` are plain `date` columns, so an open play could
say which day it ran but never what time it started.

**Architectural decision: two nullable `time` columns, not a `timestamptz`
conversion.** Conversion is destructive, every event query, card, filter and sort
reads those two columns as dates today, and it would silently reinterpret every
existing row against a timezone nobody recorded. Additive nullable columns leave
every existing event rendering exactly as it does now — time when present, date
alone when not — and keep a later conversion open. `time` rather than `timetz`:
"play starts at 6pm" is a fact about the court, not about an offset.

- `028-event-time` adds `start_time` / `end_time` plus `chk_event_time_order`,
  which only compares the clock when `start_date = end_date` — a Friday-evening
  to Saturday-morning event is correctly ordered even though 11:00 reads as
  earlier than 18:00. `event.service.ts` applies the same rule before the write
  so the caller gets a sentence rather than a constraint violation.
- `create-event.vue` offers hourly `UiSelect`s from 05:00 to 22:00; picking a
  start proposes start + 1h, and only fills a blank or plainly wrong end.
- `utils/event-time.ts` formats them **without `new Date()`**, which would
  attach today’s date and the viewer’s timezone to a value that has neither.
  Shown on the event page header, its Info tab, the events list and `EventCard`.

**Applied 2026-08-24** (201 changesets total). It was shipped unapplied first, and
that broke every event screen: `EVENT_COLUMNS` selects `start_time, end_time`, so
PostgREST rejected the whole query with `42703 column events.start_time does not
exist` and `/events` showed "Could not load events." Verified after applying: the
full column list returns rows, `GET /api/v1/events` and the detail endpoint both
200, and existing events carry `start_time: null` so they render date-only as
designed.

**Lesson worth keeping:** code that hard-depends on an unapplied changeset should
not be merged ahead of the migration. Either apply the migration first, or make
the column selection tolerant until it lands.

### D — Brackets: real names, real seeds

- **F-23 closed.** Seeding is confirmed-only; see the backlog entry for the
  decision and its consequences.
- **Seeds ordered by rating**, unrated last, `registered_at` breaking ties. The
  `shuffle()` that ran immediately afterwards is deleted: with it, seed order was
  meaningless and the pre-generation preview could not tell the truth. Pool play
  benefits too — seeded input turns its `i % numPools` distribution into a real
  one, so the top seeds land in different pools instead of possibly all in one.
- **Names instead of hex.** `BracketMatchDto` gained `participant1`/`participant2`
  (`BracketParticipantDto`: name, rating, doubles partner) alongside the existing
  ids, hydrated in `getBracket` and `generateBracket` from
  `findByTournamentIdWithPlayers` — one extra query per bracket load.
  `BracketMatchCard.vue` renders the name, a `UiRatingBadge` and `with <partner>`;
  the `registration_id.slice(0, 8)` hack is gone.
  The unit tests caught a real bug here: `created.map(toBracketMatchDto)` handed
  `Array#map`’s index to the new participants parameter.

### E — Tournament page, organised by category

> **SUPERSEDED (2026-08-24)** by the tournament viewing redesign at the end of
> this file. The two stacked tab bars, the "Manage categories" disclosure, the
> Queue and Matches views and the `/tournaments/:id` page itself are all gone;
> `utils/bracket-rounds.ts` and `utils/category-standings.ts` survive unchanged.

`pages/tournaments/[tournamentId].vue` was 1141 lines of single scroll — header,
then every category at once, then every registration in the tournament, then the
bracket — so answering "who is in the 4.0s and when do they play?" meant reading
past everything else. It is now category-first:

- A `UiTabs` bar per category (`?category=`, count = confirmed), falling back to
  one "All players" tab so the flat, category-less path still works end to end.
- **Register sits directly under it** — the logic and the doubles partner picker
  moved unchanged; they were correct and only hard to find.
- A second `UiTabs` (`?view=`) over six views, each its own component under
  `components/tournament/`: Players, Ranking, Queue, Matches, Matchups, Info.
- **Matchups is where format variation lives.** The generator encodes phase in the
  round number (pools at 10+, playoffs 50+, losers 100+, grand final 200); that
  logic moved to `utils/bracket-rounds.ts`, and the view renders whatever phases
  are present in playing order — Pools → Playoffs, or Winners → Losers → Grand
  Final — with no phase heading at all when there is only one. Before generation
  it shows the real seed order rather than a row of placeholders.
- **Standings come from bracket results**, not `matches`: `matches` links to a
  tournament only through `bracket_matches.match_id`, while
  `bracket_matches.category_id` is a real indexed column. The rule lives in
  `utils/category-standings.ts` so it is testable without mounting a component.
  A bye is **not** counted as a win.
- Matches links to the match page rather than showing a score: a bracket slot
  carries `match_id` and nothing about what was played.
- The registration list that rendered `player_id.slice(0, 8)` is gone; adding
  categories moved behind a "Manage categories" disclosure, since it is a
  tournament-level job rather than a per-category one.

### C — Open play queue, first come first served

The data was already FIFO (`event-queue.repository.ts` orders by `joined_at`
ascending); nothing said so and the organiser picked arbitrary pairs.

- `matchNextPair` takes the two longest-waiting entries **of the same match
  type** and delegates to `matchEntries`, so the court-in-use and status checks
  are not duplicated. Selection is server-side: two organisers tapping at once
  would otherwise both send the same pair computed from their own stale copy.
  `POST /events/{id}/queue/match-next`.
- Each waiting row shows its position (`#1`, `#2`, …, the first highlighted) and
  how long it has waited, from `joined_at`, ticking once a minute.
- The primary action is **Match next**, which names the two players before it is
  pressed. The two hand-pick dropdowns moved behind a "pick manually" disclosure
  — kept for injuries and no-shows. Skip is unchanged.

### F — Duo requests behave like friend requests

- `GET /players/me/partner-requests/count` — its own endpoint rather than
  `incoming` plus `.length`, because the sidebar asks on every page and `incoming`
  enriches each request with a profile and rating a badge has no use for.
- `composables/usePartnerRequestCount.ts` shares one `useFetch` key between the
  sidebar and Community. Accept and decline refresh it, so the badge clears
  without a reload.
- `NavItem` gained `badge?: number`; Community carries the count in the desktop
  sidebar and the mobile drawer, and the Partners tab on `/community` repeats it.
- **Decline now notifies the sender**, which accept already did — a declined
  request used to leave the requester watching something that had quietly stopped
  being pending.
- Incoming requests join `GET /players/me/pending-actions` beside match
  verifications and club memberships.
- **`pages/players/[playerId].vue` handles the incoming direction.** If that
  player had already sent a request, the button read "Request as Duo Partner" and
  pressing it failed with `INCOMING_REQUEST_EXISTS` — the server telling the user
  to accept an invitation the page never showed them. It now offers Accept and
  Decline.

**Deviation from the plan:** the mobile bottom bar does not carry the badge. Its
five slots are the primary mobile navigation and its centre "+" is deliberately
centred, so adding Community would have displaced Home or broken that layout. The
badge markup is in place if a bottom-bar item is ever given a count; on a phone
the count shows in the drawer.

### Validation

`typecheck` clean, `eslint` clean on every changed file, `prettier --check` clean
on them, **576 unit tests passing** (was 544; 32 added across event-time
formatting and validation, bracket seeding and hydration, category standings, and
`matchNextPair`), `nuxt build` succeeding with both new endpoints in the route
manifest.

**Not verified in a browser.** Migration 028 is applied. Every screen this
touched except the landing page is behind a login. The live walkthrough in the
plan — 375px burger, light-mode shadows, hovering every tab in both themes, the
themed dialogs, an open play with a start time, three players queueing and
"Match next" pairing #1 and #2, a two-category tournament through all six views,
and a duo request from a second account — has not been run.

---

## Tournament viewing redesign — two levels, one card per category (2026-08-24)

The tournament UI was confusing in a structural way, not a cosmetic one.

**Three levels where the product has two.** The model is
`events → tournaments → tournament_categories`, so an event page listed
*tournaments*, each of which then listed *categories*. The middle level carried
almost nothing of its own — a tournament has no dates (they live on the event),
only a format, a match type and a rating band. The page that created it
(`pages/events/[eventId]/create-tournament.vue`) had an `<h1>` reading **"Create
Category"** and an error saying *"Category name is required"*, while the button
that opened it said **"Add Tournament"**: three names for two concepts.

**Everything category-scoped was spread across a matrix** — two stacked `UiTabs`
bars (category, then one of six views) with the register button wedged between
them — and two of those six views were wrong. "Queue" rendered bracket-derived
order of play, not a queue; the real queue is an event feature keyed off
`events.queue_enabled`, one click away, sharing the word. "Ranking" rendered
standings before a single match had been played.

### What it is now

`/events/:eventId` **is** the tournament header. Categories are cards directly
beneath it. Each card owns its own registration, players, schedule, draw and
result; nothing category-scoped lives at page level, and no view anywhere
consolidates players across categories.

- `createEvent` now creates the tournament alongside a `event_type='tournament'`
  event (`ensureTournament`, idempotent, also fires when an event is switched to
  that type). The "Add Tournament" flow and its page are deleted;
  `pages/create-event.vue` gained the format and match-type fields instead —
  four real formats, no `swiss`, and `pool_play` included.
- `getPrimaryTournament` puts "render the first, ignore the rest" in the service
  rather than a page reaching for `[0]`. Events with several tournament rows are
  treated as dev data.
- `pages/tournaments/[tournamentId].vue` is a 301 redirect to its event,
  carrying `?category=` through so an old link opens that card.
- One bracket request covers the page. A collapsed card still shows what is on
  next, so every category's draw is needed at load; the endpoint already returns
  every match when `category_id` is omitted. `groupByRound` buckets by round
  number across the whole tournament, so the split has to flatten, partition by
  `category_id`, then regroup — otherwise one category shows another's matches.
- Standings appear only once an organiser marks the category complete
  (`tournament_categories.status = 'completed''). Deliberately not derived from
  the draw being decided: an abandoned category should not publish a result on
  its own.

### Scores, and the two things that were quietly broken

Inline set scores were asked for, and building them surfaced why no bracket has
ever shown one.

**Nothing ever wrote `bracket_matches.match_id`.** Every generator writes
`match_id: null` (nine call sites), the only writer was
`bracket.repository.update()`, and the `PATCH /api/v1/bracket-matches/:id`
endpoint that reaches it had no UI caller. A draw could name a winner but never a
score. `BracketService.recordMatchResult` is the missing half: it creates the
match, links it, settles the slot and advances the winner, behind
`POST /api/v1/bracket-matches/:id/result`. An organiser recording a draw result
marks the match `verified` — asking the pair who just lost to confirm the
bracket is backwards.

**Score orientation is a real correctness trap.** `match_scores` is keyed to
team1/team2, decided when a match is submitted; a bracket slot is decided when
the draw is made, and nothing keeps the two in step. `orientScores` derives the
mapping from who actually played, resolves a doubles slot through either partner,
and returns **nothing** rather than guessing when the mapping is ambiguous — a
reversed score reads as entirely plausible and would be believed. Recording
fixes participant1 as team 1, so a result written here reads back in the
orientation it was entered.

The score lookup lives on the **match** repository, not the bracket one:
`match_scores`/`match_participants` are match-domain tables (CLAUDE.md §4), and
`bracket.repository.ts` does no hydration — that happens in `bracket.service.ts`.

### Migration 029 — three RLS gaps this exposed

`tournament_registrations` had exactly one SELECT policy,
`tournament_registrations_select_own` (008-security `0030`), matching only the
viewer's own entry. `getBracket` resolves participant **names** from those rows
through the user client, so **every slot in every published bracket rendered
"TBD" to anyone who was not that entrant**, and a category player list showed
only yourself. That was live, hidden behind a tab; the redesign puts it on every
card.

`match_scores` and `match_participants` had the same shape of gap — 008-security
`0016` admits only the people who played. 017 later added `matches_select_event`
so a match row became visible to anyone who can see its event, but the score and
the teams were never given the equivalent.

`029-tournament-visibility` adds three additive SELECT policies mirroring
`bracket_matches_select_visible` and `matches_select_event`. Scoped to matches
carrying an `event_id`, so a casual match stays participant-only.

### Components

New: `CategorySection.vue` (owns the data and every mutation, so the cards stay
presentational and mountable), `CategoryCard.vue`, `CategoryUpNext.vue`,
`CategorySchedule.vue`, `CategoryMatchRow.vue`, `CategoryCreateCard.vue`.
`CategoryOrderOfPlay.vue` became `CategorySchedule.vue`; `CategoryMatches.vue` is
deleted — its score-less list of completed matches is now the schedule's
Completed section, with real scores. `CategoryPlayers`, `CategoryMatchups`,
`CategoryStandings` and `CategoryInfo` survive.
`utils/bracket-schedule.ts` holds the shared reading of a draw as an order of
play, so the collapsed strip and the expanded list can never disagree.

### Validation

`typecheck` clean, `eslint` 0 errors, `nuxt build` succeeding, **637 unit tests
passing** (was 576; 61 added across score orientation, score hydration,
`recordMatchResult`, tournament auto-creation, `getPrimaryTournament`, the
schedule utils and the category card).

**Migration 029 is applied** (2026-08-24). `liquibase status` reports the
database up to date at 204 changesets.

Verified against the live database after applying:

- `tournament_registrations_select_visible` **works** — an anonymous PostgREST
  read of `tournament_registrations` now returns entries for a public,
  non-draft event's tournament. Before 029 that call returned `[]` for everyone,
  which is what made every bracket slot render "TBD".
- `match_scores_select_event` and `match_participants_select_event` return
  nothing anonymously, which is **correct** rather than broken: all 8 matches in
  the database carry `event_id IS NULL` (they are casual), and both policies are
  deliberately scoped to matches that belong to an event. The negative case —
  a casual match's score staying private — is therefore confirmed. The positive
  path cannot be exercised until a tournament result is recorded through
  `recordMatchResult`, since nothing has ever created an event-linked match.

### Singles or doubles, per category (migration 030)

`match_type` lived only on `tournaments` (006-event, changeSet 0003), so every
category of one tournament had to be the same. That is wrong for the ordinary
case — "Men's Doubles 4.0" and "Singles Open" are two categories of one weekend
— and it is why nothing on a category card could label it: there was no
category-level value to show.

`030-category-match-type` adds a nullable `match_type` to
`tournament_categories` with a CHECK, and backfills existing rows from their
tournament. Nullable means "inherit": a category created by an older client
still resolves to something sensible rather than failing an insert.
`tournaments.match_type` deliberately stays, as the default a new category
inherits and the fallback for the category-less path.

`resolveMatchType(category, tournamentMatchType)` is the single reader, and it
drives behaviour rather than only display:

- **The partner rule on registration** now follows the category. A singles
  category of a doubles tournament used to answer PARTNER_REQUIRED and could not
  be entered at all.
- **The match created by `recordMatchResult`** is stamped with the category's
  type, so a mixed weekend does not mislabel one draw in players' records.
- **The card** shows it as a pill beside the category name, and the create-card
  offers it as a singles/doubles choice starting from the tournament's own type.

`EventService` and `BracketService` each take an optional
`TournamentCategoryRepository` for this; without it both fall back to the
tournament's type, which is exactly what they did before.

**Applied 2026-08-24.** `liquibase status` reports the database up to date at
207 changesets. Verified: all 4 existing categories carry a `match_type` equal
to their tournament's, and none is left null.

### Validation (final)

`typecheck` clean, `eslint` 0 errors, `prettier` clean on every file this work
touched, `nuxt build` succeeding, **645 unit tests passing** (was 576 before the
redesign).

**Still not verified in a browser.** The live walkthrough in the plan has not
been run.

## Per-category formats, the bracket redesign, and category editing (2026-08-25)

Seven things, driven by using the live app.

### 1. Five formats, chosen per category — Liquibase `031-tournament-format`

The format vocabulary is now exactly the five the product offers, each carrying
the one line that explains it at the point of choice:

| value | label | description |
| --- | --- | --- |
| `round_robin` | Round Robin | Everyone plays everyone |
| `single_elimination` | Single Elimination | One loss and you're out |
| `double_elimination` | Double Elimination | Two losses and you're out |
| `round_robin_single_elimination` | Round Robin → Single Elimination | Group stage then knockout |
| `round_robin_double_elimination` | Round Robin → Double Elimination | Group stage then double-elim playoffs |

`pool_play` was **renamed** to `round_robin_single_elimination` (changeSet 0002).
It always was that; the vague name only became actively misleading once the
double-elim variant sat beside it. Both `tournaments.format` and the new
`tournament_categories.format` now carry a CHECK constraint against the list —
`tournaments.format` had carried none since 006-event, so a typo could be stored
and then fall through the generator's `switch` to single elimination without
anyone being told.

**King of the Court was considered and excluded** (ADR-004). It cannot be
pre-drawn as a fixed bracket, and needs a progressive generator that is its own
piece of work.

`tournament_categories.format` is nullable, meaning "inherit from the
tournament", on the identical pattern `match_type` uses since 030 — addColumn →
CHECK → backfill. `resolveFormat(category, tournament.format)` sits beside
`resolveMatchType` and is the single resolution point for the generator, the draw
view and the settings form.

The list itself lives in **one** place, `apps/web/utils/tournament-formats.ts`.
It was previously inlined in `create-event.vue` and duplicated as a label-only
map in `CategoryInfo.vue`, and the two had already drifted.

**New generator: `generateRoundRobinDoubleEliminationBracket`.** Pools at the 10
offset, then the same three pieces plain double elimination lays out — winners at
50, losers at 100, grand final at 200 — so `phaseOf` reads it as Pools →
Playoffs → Losers → Grand Final with no new phase vocabulary. `buildGroupStage`
and `buildEmptyKnockout` were extracted so the two staged formats share their
common halves rather than copying them.

**A real hole closed: pool → playoff seeding.** `advanceWinner` used to return
early unless the format was an elimination, so a staged format generated its
playoff skeleton and *nothing ever filled it* — an organiser could play every
pool fixture and the knockout stayed a column of TBDs forever. It now advances on
any knockout round (the format is still consulted, because a pure round robin
numbers its rounds from 1 exactly as a knockout does), and `seedPlayoffsFromPools`
fills round 51 the moment the last pool fixture is decided. Idempotent by
inspection, so a correction to a finished group stage does not reshuffle a
playoff already under way.

The qualification rule is a **product decision**, recorded in ADR-004: top two
per pool, ranked wins → point difference → head-to-head, with pool winners seeded
ahead of every runner-up so the two out of one pool land on opposite halves.

### 2. The draw is drawn as a draw

`BracketMatchDto.scores` has carried oriented set scores all along; nothing
rendered them on the bracket, only the schedule row. And the rounds were plain
stacked columns with no lines, so the one question a draw exists to answer — who
plays the winner of this — was the one thing it did not show.

- **`BracketTree.vue`** (new) — a knockout phase as a column-per-round rail with
  CSS connector elbows and a **Champion** panel. No SVG and no measurement:
  `space-around` puts the two feeders of a slot at 25%/75% of their pair and the
  slot they feed at 50% of the same band, so the elbow is three pseudo-elements
  that stay correct at any width, card height, or round count.
- **`BracketGroupTables.vue`** (new) — the group stage as tables, one per pool,
  with the qualifying line marked. A pool is a round robin, and a round robin is
  read as a table.
- **`BracketMatchCard.vue`** — one score column per set on each slot row, plus a
  `dense` form for tree nodes. The rating badge stands down once a score exists;
  there is not room for both, and the score is the more useful.
- **`CategoryMatchups.vue`** — now the format switch, and it names the format and
  its description at the top so a player looking at someone else's draw can tell
  whether one loss ends their day.
- `championOf` / `finalMatchOf` in `utils/bracket-rounds.ts` — the champion is
  whoever won the last match, not whoever has most wins; with byes those differ.

### 3. Event-header capacity, for tournaments

`2 / 16 players — 14 slots left` is gone from a tournament's header and its
details list. Capacity is a category's business — the 3.5s and the Open draw fill
independently — so one event-wide number matched nothing anybody could enter.
Open play and leagues keep it, where the event really is the thing with a limit.

### 4. Rating bands are used up by a match type, not on their own

`usedTemplateIds` keyed on template id alone, so adding "4.5 Singles" removed 4.5
from the picker entirely and "4.5 Doubles" — the other half of the pair a weekend
most often runs — could never be created. Now keyed on the `(band, match_type)`
pair, and because `matchType` is a `ref` in the create card the list re-filters
live as the organiser toggles. No migration: there was never a DB uniqueness
constraint here.

### 5. The singles/doubles pill in light mode

`--dnl-accent` is mint `#A7E3C1` in light mode, so `bg-accent/15 text-accent` was
pale mint on near-white — the pill was there and could not be read. The token set
already defines the pair for exactly this: `accent-soft` as fill, `on-accent`
(`#0B3B24`) as text. Same swap on the "Full" status tone; the two bare-text uses
(`isFull` vacancy line, "Awaiting approval") moved to `text-warning`.

### 6. Editing a published category

The Settings tab already had an "Edit category" button gated only on `canManage`
— what was missing were the fields. It reached the name and the size only, so
correcting a rating band or switching a category to a round robin meant deleting
it and losing every entry. It now covers name, capacity, rating band, match type
and format, with the format's description under the select and a note that the
draw must be regenerated. The emit moved from three positional args to
`(categoryId, UpdateTournamentCategoryInput)`.

`match_type` **locks** once anyone has entered (`MATCH_TYPE_LOCKED`, 409): every
doubles entry carries a partner a switch to singles would orphan. Format changes
are always allowed — they redraw a bracket, they strand nobody.

### 7. Running standings on the Schedule tab

`computeCategoryStandings` and the standings component already existed; the only
thing gating them was the Results tab appearing solely once the organiser marks
the category complete. That gate is deliberate for *final* standings and stays.
The Schedule tab now carries the live W–L table above "Up next" — group tables
for the staged formats and a single table otherwise — which is the scoreboard
everybody at the venue asks about between matches. `computeStandingsGroups` is
the new util; it keeps each pool to its own entrants, because a merged table
would rank people who never played each other.

### Applied

**Applied 2026-08-25.** All five changesets ran; `liquibase status` reports the
database up to date at **212 changesets** (was 207). Verified through PostgREST:
the one tournament reads `single_elimination`, all five categories carry a
non-null `format` equal to their tournament's, and no `pool_play` survives
anywhere.

The two CHECK constraints (0003, 0004) are inferred rather than directly
observed — Liquibase's default snapshot does not capture check constraints (the
pre-existing `ck_tournament_categories_match_type` from 030 is absent from it
too). The inference is sound: `ALTER TABLE … ADD CONSTRAINT` either succeeds or
aborts the update, and both changesets are recorded as applied.

### Validation

`typecheck` clean, `eslint` 0 errors (8 pre-existing warnings in unrelated
files), `check:tokens` clean across 91 files, `nuxt build` succeeding, **710 unit
tests passing** (was 645).

New specs: `tournament-formats.spec.ts`, `bracket-tree.spec.ts`,
`category-create-card.spec.ts`. Extended: `bracket.service.spec.ts` (per-category
format, staged advancement, pool seeding), `tournament-category.service.spec.ts`
(format validation and inheritance, `MATCH_TYPE_LOCKED`),
`category-standings.spec.ts` (group tables), `category-card.spec.ts` (contrast
and format labelling).

**Still not verified in a browser.** The live walkthrough has not been run.

---

## One entry per person per category, and a ladder without overlaps (2026-08-25, later)

Phase 1 of the tournament work. Two problems, both reported from the live app.

### 1. A doubles partner was invisible to the system

A doubles entry is ONE row — `player_id` plus `partner_player_id` — so a partner
exists in a category only as a value in somebody else's column. Nothing read that
column when deciding whether an entry was allowed: the duplicate check filtered
on `(tournament_id, player_id)` alone, and no index backed it. The reported
screen:

```
Elbuff The great        2.910      <- Elbuff's own entry
ronahbiejacobjaspe      2.800
  with Elbuff The great            <- Elbuff again, same category
```

One person, two slots in one draw, seeded twice by `generateBracket` and drawable
against themself.

**The rule is now one entry per person per category, as registrant OR partner** —
all four combinations of (already in as / entering as) refused, checked against
both people named on an incoming entry.

`findByTournamentAndPlayer` is gone, replaced by `findCategoryEntrants`, which
flattens each row into its one or two occupants so a caller cannot check one
column and forget the other. Being **category**-scoped rather than
tournament-scoped also fixes the opposite bug: entering both the 3.5 Singles and
the 3.5 Doubles was blocked, while `CategoryCreateCard` advertised that you may.

The DB backstop is a **trigger**, not a unique index, and the distinction matters:
a player who is `player_id` on one row and `partner_player_id` on another
violates the rule while satisfying two separate partial indexes, because each
index only ever sees one column. No single-table UNIQUE or EXCLUDE treats two
columns as one set. `fn_assert_one_entry_per_category` takes
`pg_advisory_xact_lock` on the category scope first — without it two transactions
naming the same free partner both see an empty conflict set and both commit — and
raises `23505`, which the service maps back onto its own 409 so a lost race and
an ordinary duplicate read identically.

Three further holes closed while in here: entering as your own partner (nothing
prevented it, now a CHECK constraint too), naming a partner who never agreed
(any player id was accepted, so a stranger could enter you and bill you), and a
category's `max_participants`, which only the UI enforced — the API accepted the
entry anyway, so anyone posting directly or racing the page got in regardless.

On screen, `CategorySection`'s `mine` matched `player_id` alone, so the named
partner was told they were not in a category they were already entered in and
shown a Register button the server would refuse. Partners already holding a slot
are now filtered out of the picker, and "all of your linked partners are already
in this category" is deliberately distinct from "no partners yet" — the two point
at different fixes.

### 2. The rating ladder overlapped at every boundary

Intermediate 3.0–3.5 and Advanced 3.5–4.5 both claimed 3.5, and the check was
inclusive at both ends, so a 3.5 player was eligible for both. The ladder is now
2.0–2.4, 2.5–2.9, 3.0–3.5, 3.6–4.5, 4.6–5.5, 5.6+ — no shared numbers. **The
bottom two bands were not in the request and are the one thing here worth a
second look.**

Ratings are `numeric(5,3)`, so a ladder written in tenths leaves gaps: 3.550 is
above 3.5 and below 3.6 and belongs to no band. `utils/rating-bands.ts` rounds to
one decimal before comparing — 3.550 → 3.6 → Advanced, 3.549 → 3.5 →
Intermediate — which is gapless and explainable to the player it affects. A test
walks every thousandth from 2.000 to 8.000 and asserts each matches exactly one
band. The same helper generates both the server's refusal and the card's label,
so the number a player is refused by is the number they were shown.

The band check itself **moved out of the registrations controller into
EventService** (CLAUDE.md §1 — controllers are wiring). It had two bugs there: it
read the TOURNAMENT's match type, so a doubles category inside a singles
tournament was judged on singles ratings; and it examined the registrant alone,
so a 3.2 player could carry a 4.9 partner into a 3.5 draw.

Relatedly, `findByTournamentIdWithPlayers` hardcoded `rating_type === 'singles'`,
so every doubles draw was seeded — and labelled — by everyone's singles form. The
repository now returns both ratings and `resolveEntrantRating` picks one by the
category's match type, falling back to the other rather than to null: a player
with only a singles rating entering their first doubles category is better seeded
on stale evidence than dropped to the bottom as unrated.

### Validation

`typecheck` clean, `eslint` 0 errors (8 pre-existing warnings in unrelated
files), `check:tokens` clean across 91 files, `nuxt build` succeeding, **755 unit
tests passing** (was 710). New: `rating-bands.spec.ts`. Extended:
`event.service.spec.ts` (all four rows of the invariant, self-partner,
non-partner, category capacity, the trigger's race rejection and its
non-duplicate sibling, five band cases), `category-card.spec.ts` (partner sees
their status, band reason replaces Register, all-taken vs none-linked).

### NOT applied

**Changeset 032 has not been run against the live database.** The Liquibase CLI
is not installed on this machine and `database/.env` does not exist, so the
schema is one changeset behind the code. Until it is applied the trigger, the
CHECK constraint and the new ladder are absent — the service-level checks still
hold, but the DB backstop and the reseeded templates do not. Not verified in a
browser either.

### Applied

**Applied 2026-08-25.** All six changesets ran; `liquibase status` reports the
database up to date at **218 changesets** (was 212). Verified through PostgREST:
the seven templates carry the new ladder with no shared numbers.

Two things the live data then showed.

**The backfill skipped `Beginner` (2.5–3.0), correctly.** That category holds two
confirmed entries, and the guard exists so a band cannot move under players
already standing in it. It keeps the old boundary until an organiser changes it
by hand — which is the intended outcome, not a failure.

**The reported duplicate is still in the data**, in that same category:

```
c77235f0  player_id=211d7251                          confirmed
fd7c72ce  player_id=58ab7e99  partner=211d7251        confirmed
```

The trigger is `BEFORE INSERT OR UPDATE` and does not validate rows that already
exist, so it neither rejects these nor rewrites them. Clearing it is an organiser
action: reject or withdraw one of the two.

Which surfaced a real bug in the first cut of the trigger. It treated only
`withdrawn` as releasing a slot, so **rejecting** an entry would have been
refused by the very constraint meant to make the cleanup possible — the rejected
row still counted as occupying its place, and a rejected player could never
re-enter. Both statuses now release the slot, on both sides of the check, driven
by a new `SLOT_HOLDING_REGISTRATION_STATUSES` in `tournament.dto.ts` that the
repository filter and the trigger mirror. Changeset 0004 carries
`runOnChange="true"` precisely so a function body can be corrected in place; the
fix re-applied as a single changeset with no new one added.

**763 unit tests passing** after the fix (was 755).

---

## Category endings, and a lifecycle for the draw (2026-08-25, later still)

Phases 2 and 3 of the tournament work.

### Categories: one open at a time, and two ways to end one

Every card could be open at once. On a weekend running six categories that made
the page six stacked full-height panels and put the card you wanted below the
fold, so `openIds: Set<string>` is now `openId: ref<string | null>` and the open
card carries a ring and a lifted header — with one open at a time, which one it
is has to be visible at a glance.

**Withdrawing is per category now**, and only while the entry is still pending.
The endpoint has existed since the tournament domain was built and nothing ever
called it; the only Withdraw on screen was in the event header, which targets
`event_registrations` — a different table that means nothing for a category
entry, so a player who had entered two categories pressed it and nothing they
could see changed. That button is gone for tournament events. Once an organiser
has confirmed an entry there may be a drawn bracket and a paid fee behind it, so
leaving is a conversation with them rather than a button, and any refund is
theirs to make.

**Mark complete now waits for every match to have a result.** It used to be
available at any time, with a note offering to finish anyway if the category was
abandoned — which meant the commonest misclick on the card published a
half-played table as the category's result. Abandonment has its own answer now:

**Trash this category** — a red, confirmed, hard delete of the category, its
entries and its draw, for one that is postponed or will not run. Hard because
the project's rule is that soft deletion is for personal data and for records of
things that happened, and a category nobody played is neither. Refused once any
result exists (`CATEGORY_HAS_RESULTS`): at that point it *is* a record, and the
matches behind those results have already moved people's ratings. The delete is
leaves-first — bracket slots, then entries, then the category — because every FK
in this schema is RESTRICT and nothing cascades.

### The draw gets a lifecycle

```
open -> generate -> lock -> complete
        (private,   (public,  (standings
         redrawable) playable)  published)
```

A bracket had none of this. Generation was destructive, repeatable, and public
the instant it existed, with no undo. Three consequences, all of them things a
real organiser hits in the first hour:

**An organiser experimenting was broadcasting.** Trying three seedings pushed all
three to every entrant, and a player refreshing the page watched their
first-round opponent change under them. `getBracket` now takes a viewer: an
unlocked draw comes back with `rounds: []` to anyone but the organiser, and the
card falls back to the placeholder shape and the entrant list — which is what a
player actually needs before a draw is final. The page fetches one bracket for
the whole tournament rather than one per card, so the gate cannot be a single
yes/no; each match is kept or dropped by **its own category's** lock, or the
combined fetch would leak an unpublished draw on every visit.

**Generate at 6-of-16 produced a draw the next two entrants could not join.** The
only way back was to regenerate. It now refuses unless the category is full
(`CATEGORY_NOT_FULL`) and the message names both ways out — approve the entries
still waiting, or lower the size in Settings, which is a decision with a number
attached rather than an accident. A category with no stated capacity keeps the
old rule: two is enough.

**Undo Generate** returns to "not drawn yet", which was unreachable once the
button had been pressed even once by mistake. Refused on a locked draw, and
refused once any result exists — the bracket rows would go but the `matches` they
point at carry verified results that have already moved ratings, and deleting a
rating-bearing record to tidy up a draw is the wrong trade. Regenerating had this
exact hole and silently orphaned those rows; it now refuses too, via the lock.

**Lock** freezes the draw, publishes it, and is what makes results recordable —
`recordMatchResult` now requires it, because recording into a draw that can still
be redrawn is how those orphans were created. Unlock is refused once a result
exists.

The lock lives on `tournament_categories` *and* `tournaments`, resolved by
`resolveBracketLock` — the same two-table contract `resolveMatchType` (030) and
`resolveFormat` (031) already use, because a tournament may legitimately run one
flat draw with no category row to carry the lock.

### Applied

**Applied 2026-08-25.** Both changesets ran; `liquibase status` reports the
database up to date at **220 changesets** (was 218). Verified through PostgREST:
all five categories and the one tournament carry the two columns, every one null
— every existing draw is unlocked, which is the correct starting state.

### Validation

`typecheck` clean, `eslint` 0 errors (8 pre-existing warnings in unrelated
files), `check:tokens` clean across 91 files, **796 unit tests passing** (was
778). New: `bracket-lifecycle.spec.ts` (18 tests — per-category visibility
filtering, the fullness gate, undo and lock guards).

Sixteen existing bracket specs had to be re-pointed at a locked fixture. That is
the behaviour change stated plainly: a draw you can read, and a draw you can
write a score to, are both necessarily locked draws now. A
`makeLockedTournamentRecord` helper names the distinction so the next person
does not have to infer it.

### Not yet done

The **Draw tab UI for all of this** — Generate disabled with its reason, Undo,
Lock, and the "organiser is still finalising the draw" state for players — is
not built. The service and endpoints are complete and tested; nothing on screen
calls them yet. Not verified in a browser.

---

## Fees, rosters, club limits, and the draw made legible (2026-08-25, final)

Phases 4 to 8 of the tournament work, plus the Draw-tab UI that Phase 3 was
missing.

### The connector lines, fixed by stating the geometry

The tree distributed matches with `justify-around` and assumed that placed the
two feeders of a slot at exactly 25% and 75% of their pair. It does not, and
four separate things exploited the gap: a `gap-3` between the flex children
shifted every centre by `gap/4`; cards are not equal height (a bye carries an
extra line, a card with set scores is taller than one without) and
`space-around` centres by FREE space; the losers bracket does not halve (an
8-draw emits 2, 2, 1, 1), so pairing two-at-a-time drew joiners into rounds with
two slots; and an odd match count left a lone stub running into empty space.

Every one of those is the same mistake — inferring position from layout. Each
round is now a CSS grid over shared leaf rows with a round-*i* match spanning
`2^i` of them, so a card's centre is arithmetic and card height, gaps and parity
stop mattering. `bracketGridRows` holds the maths and is unit-tested; CSS
geometry is not testable in jsdom, so the part that *is* testable moved out of
it. It also reports whether the rounds genuinely form a tree, and a losers
bracket or a round robin renders as plain columns — no lines at all beats lines
that misrepresent which match feeds which.

`FormatDiagram` puts a picture beside the format name. A sentence distinguishes
a knockout from a round robin; it does not let an organiser picture "round robin
into single elimination", and Generate is hard to take back once entrants have
seen the draw.

**A Matches tab**, ordered by what needs doing — Ready to play, Waiting, Played
— reusing the same score row the Schedule tab uses. The draw answers "who plays
the winner of this", which makes it a poor place to type into: the card needing
a result is wherever the tree puts it, while an organiser at a venue is scanning
for the next unplayed match.

### The Draw tab controls

Phase 3's rules were live on the database and unreachable from the UI. Now, in
lifecycle order: **Generate** (disabled with its reason when the category is
short), **Undo generate**, and **Lock bracket** beside it, live only once there
is a draw to freeze. Locked, those give way to a *Draw locked* marker and an
**Unlock** that withdraws once a result exists. A player looking before the lock
is told the organiser is still finalising it and pointed at the Players tab,
rather than shown an empty panel.

### Money, quoted but not moved

`events.fee_amount` was rendered and never charged, and nothing anywhere said
that a doubles entry costs twice the printed number — a pair is two players on
one row.

`platform_fee_rules` is the convenience-fee ladder: percentage or fixed, banded
on the base amount, with a floor and cap for percentages. Both shapes were asked
for and both are needed, because a flat 5% is trivial on a ₱200 entry and
punitive on a ₱5,000 one. `utils/convenience-fee.ts` holds the maths in integer
cents and is shared by the quote and by whatever eventually charges — a fee
quoted at one number and charged at another is the worst bug available in this
area. 23 tests, including the clamps, the no-rule case, and the guard that a fee
never exceeds the amount it is a fee on.

The register button now opens a summary: entry × 1 or × 2 with the partner
named, the convenience fee on its own line, and the total. It says plainly that
the entry goes to the club and only the convenience fee is the platform's, and
that online payment is not switched on yet.

`/admin/fees` is the Super Admin console, with a live preview computed by the
same function the registration screen uses. `club_payment_accounts` stores the
club's own public link reference and deliberately has **no column for a club
secret**: the platform never charges on the club's behalf.

**ADR-006** records what is not decided — whether this settles as two charges or
one split charge — because that is a provider and commercial question, not a
code one. Note it is ADR-**006**; ADR-005 was already taken.

### Team Up

A roster, not a partnership, and a separate table for a reason. `partnerships`
is mutual and symmetric — the pair who enter a doubles category together.
A team-up is directional: I may bring you to an open play session; you are not
thereby able to bring me. Folding them together would mean either creating
doubles partnerships nobody agreed to, or making partnership directional and
breaking the pairing rule the tournament domain rests on.

It still needs acceptance, because registering somebody commits their evening
and, once payments are live, their money. `POST /events/:id/register` takes
`player_ids`, checks every name against an accepted team-up, and counts the
whole group against capacity — entering four into two remaining places used to
half-succeed. `registered_by_player_id` records who did it.

Team Up sits **beside** the Duo Partner button on a profile, not instead of it,
and Community gains a fourth tab.

### Club limits, and the trap they nearly created

Nothing limited an unverified club, so verification — which has a full approval
flow already built — bought a club nothing. Now: one live tournament, one live
open play, one draft; verified clubs unlimited. Cancelled and completed events
do not count, so a club is not blocked by a weekend that has already happened.

That immediately exposed a trap. `deleteDraftEvent` refused the moment anything
was attached, so a club that had set up a category on its one permitted draft
could neither delete it nor create another. Draft deletion now **cleans up**
instead, which is safe because a draft is not playable (`register` requires
published or active, so nothing rated can be behind one). Matches are still
refused — those are a record of play.

### Verified club offering

`docs/36-VERIFIED-CLUB-OFFERING.md`. The short version: price on **online fee
collection**, because it is the only item that pays for itself for the club and
the only one that genuinely requires verification rather than merely being gated
behind it. The strongest hook is **rated events**, which is also the item with
the clearest integrity argument. The doc is equally explicit about what must NOT
go behind the gate — basic event creation, anything player-facing, the bracket
generator itself.

### Applied

**Applied 2026-08-25.** 034-platform-fees and 035-team-up ran; `liquibase status`
reports the database up to date at **228 changesets** (was 220). Verified through
PostgREST: the fee ladder reads with the anon key (the registration screen has to
quote a total) and rejects an anonymous insert with 401.

### Validation

`typecheck` clean, `eslint` 0 errors (8 pre-existing warnings in unrelated
files), `check:tokens` clean across 96 files, `nuxt build` succeeding, **881 unit
tests passing** (was 778 at the end of Phase 2).

New specs: `bracket-grid`, `category-matchups-controls`, `category-matches`,
`convenience-fee`, `team-up.service`, `club-event-limits`.

Three existing specs changed behaviour deliberately rather than being repaired:
`bracket-tree` no longer counts a `.bracket-pair` wrapper that the grid rewrite
removed, and `event-delete` now asserts that a draft with entries is cleared
rather than refused.

### Still not verified in a browser

None of this has been driven in the running app. The live walkthrough in the
plan is the outstanding work.

---

## F-25 — Verification roll-up race (2026-08-27)

### The bug

`recordVerificationDecision` read the match, wrote the acting verifier's
decision, then recomputed the match status by patching **its own in-memory
snapshot** — a snapshot taken before the write. When the last two verifiers of a
doubles match confirmed at the same time, each one's snapshot still showed the
other as `pending`, so both rolled up to `pending_verification` and neither
transitioned the match. The match sat unrated forever, with every verification
row confirmed and nothing left to trigger it.

Fixing only that exposed the mirror-image bug. The controller triggered rating
calculation on `match.status === 'verified'`, and once the roll-up reads from the
database *both* concurrent callers see a verified match — so both would rate it,
doubling every player's delta. Not rating a match is recoverable; rating it twice
corrupts the ladder.

### The fix

Both writes are now compare-and-set, so the database decides the winner:

- `transitionMatchStatus(matchId, fromStatus, toStatus, verifiedAt)` — new on the
  repository — updates `matches` with `.eq('status', fromStatus)` and returns
  whether it matched a row. Exactly one racing caller gets `true`.
- `updateVerificationDecision` gained `.eq('status', 'pending')` and returns
  `null` instead of throwing when no row matched. That closes the same window for
  a single verifier double-submitting, which the snapshot check could not see.
- The roll-up re-reads the match after writing the decision rather than patching
  the snapshot.
- `recordVerificationDecision` returns `{ match, status_changed }`.
  `status_changed` is true only for the caller that performed the transition, and
  the controller gates rating calculation, the match-verified activity log and
  the terminal-state notifications on it. The audit log stays ungated — it
  records each verifier's own decision, which did happen.

`updateMatchStatus` is unchanged and still used by the unconditional transitions
(`initiateVerification`, dispute, and the bracket's result recording), which have
no roll-up to race over.

### Tests

Three specs under `MatchService verification > concurrent verification
decisions`. The first — two verifiers confirming via `Promise.all` — was checked
against the old implementation and fails there with `expected
'pending_verification' to be 'verified'`, which is the stall itself. The fake
repository was tightened to make that meaningful: `findById` now deep-copies the
verification records (it previously shared the element objects, so a later write
appeared to mutate an earlier read), and the fake mirrors both compare-and-set
guards.

### Validation

`typecheck` clean, `eslint` 0 errors (8 pre-existing warnings in unrelated
files), **884 unit tests passing** (was 881).

### Not verified in a browser

The race needs two clients confirming the same doubles match simultaneously,
which the live walkthrough does not currently cover.

---

## Google OAuth redirecting to localhost from Vercel (2026-08-27)

### The bug

The deployment at `https://dink-and-ladder-web.vercel.app` shares one Supabase
project with local dev. Signing in with Google there completed at Google and
then landed the user on `localhost:3000`.

The app code was never at fault: `pages/login.vue` and `pages/register.vue`
already send `redirectTo: ${window.location.origin}/confirm`, which is the Vercel
origin in production. Supabase was overriding it. It validates `redirectTo`
against the project's **Redirect URLs** allow-list, and a URL that does not match
is discarded *with no error anywhere* and replaced by the project's **Site URL** —
still `http://localhost:3000` from initial setup. The silence is what made this
look like an application bug. Password reset
(`${window.location.origin}/update-password`) was affected the same way.

### The dashboard half (no code, no deploy)

Authentication → URL Configuration. Site URL is now the deployment; the
allow-list carries `http://localhost:3000/**`,
`https://dink-and-ladder-web.vercel.app/**` and
`https://dink-and-ladder-web-*.vercel.app/**` — the last for preview deploys,
which get a fresh generated hostname each time and would otherwise fail exactly
as production did. Google Cloud Console needed no change: its redirect URI points
at Supabase's own `/auth/v1/callback`, which is identical across environments.

**This half alone fixes the reported symptom.**

### The code half, and why it was needed

Registration runs server-side so Turnstile can gate it, and `registerWithPassword`
called `signUp({ email, password })` with no `emailRedirectTo` — so confirmation
links were always built from Site URL. That meant repointing Site URL at Vercel
would have sent *local* signups to Vercel links: the same bug mirrored. Being
server-side, there is no `window.location` to fix it the way the client calls do.

`server/utils/site-url.ts` resolves the origin from the platform instead of from
configuration, mirroring `resolveTrustProxy` (F-11) — same location, same
dependency-free constraint (`nuxt.config.ts` imports both at config load), same
explicit-then-detect-then-safe-default precedence:

- `NUXT_SITE_URL` wins if ever set (escape hatch for a non-Vercel host).
- Vercel production → `VERCEL_PROJECT_PRODUCTION_URL`, the *stable* domain.
  Deliberately not `VERCEL_URL`: that is the per-deploy generated hostname, so a
  link built from it stops working at the next deploy, and an emailed link has to
  outlive the deployment that sent it.
- Vercel preview → its own `VERCEL_URL`, so a preview signup confirms against the
  build being tested. This is why the preview wildcard above is required rather
  than optional.
- Anything else → `http://localhost:3000` (honouring `PORT`).

Surfaced as `runtimeConfig.siteUrl`; `register.post.ts` passes
`${siteUrl}/confirm` through to `signUp`. The argument is optional and the
`options` key is omitted entirely when absent, so the Site URL fallback still
applies and the change is backwards compatible.

**Not derived from the request `Host` header**, which would have needed no
platform knowledge at all. That header is caller-controlled and a confirmation
link carries a live token, so trusting it would let someone trigger a signup
whose confirmation URL points at a host of their choosing. Platform variables
cannot be spoofed by a caller.

Nothing to configure in either environment. This relies on Vercel's
"Automatically expose System Environment Variables" project setting, which is on
by default.

### Tests

`tests/unit/site-url.spec.ts` — 8 specs over the pure env→origin function,
including the production-vs-preview distinction that is the easiest thing to get
backwards. Two added to `auth.service.spec.ts` for the forwarding and the
omit-when-absent case.

### Validation

`typecheck` clean, `eslint` 0 errors (8 pre-existing warnings in unrelated
files), **894 unit tests passing** (was 884).

### Still to verify live

The dashboard changes and both OAuth flows (Vercel and localhost) have not been
driven in a browser yet, nor has a real signup email been checked from each
environment.

---

## Post-MVP Enhancement Plan — Phase 1: auth, routing and navigation defects

Status: **COMPLETE** (code + automated checks). Not yet driven in a browser —
see "Still to verify live" below.

Phase 1 of the phased enhancement plan (bugs first). Phases 2–5 (feed and
shout-outs, club profile/settings, open-play courts, tournaments/sponsors) are
NOT STARTED.

### The root causes

Five reported symptoms turned out to be four causes, none of which was where
the symptom pointed.

**1. There was no signed-in route guard at all.** `nuxt.config.ts` delegates all
route protection to `@nuxtjs/supabase`'s `redirectOptions.exclude`, which is
deny-by-default for signed-*out* users only. Nothing redirected a signed-*in*
user away from `/`, `/login` or `/register`. `pages/index.vue` tried to handle
its own case inside `<script setup>`, but `useSupabaseUser()` is empty on the
SSR pass and only fills in client-side, so the redirect fired late or — on a
hard URL load — not at all.

**2. The app shell was drawn from the session alone.** Every block in
`layouts/default.vue` was gated on `v-if="user"` and never consulted the route.
A password-recovery link *is* a session, so the reset form arrived wrapped in
the full sidebar and every nav item was an exit from the flow with the password
still unchanged. On the landing page the same flag drew the sidebar *underneath*
the page's own fixed marketing header — two sets of chrome.

**3. Navigation had no feedback and was serialized.** There was no
`<NuxtLoadingIndicator>`, no page transition, and no `lazy`/`useLazyFetch`
anywhere in the app. Every page did consecutive top-level `await useFetch`,
which suspends setup on each call before starting the next — so a page cost the
*sum* of its queries rather than the slowest one, with nothing on screen
changing meanwhile.

**4. "You are already registered" with an empty roster was an RLS asymmetry,
not duplicate detection.** `register.post.ts` checked for duplicates with the
**service-role** client (RLS bypassed — sees every row), while
`registrations.get.ts` listed with the **user** client *and* an inner join,
`player_profiles!inner`. RLS policy `player_profiles_select_public`
(008-security) exposes a profile only when `profile_visibility = 'public'`, so
the inner join silently deleted the registration of anyone with a private
profile. The organiser saw 0 registered; the player retrying got a 409.

**5. (Found while fixing 4, not reported.)** `uq_event_registrations_event_player`
is UNIQUE, and withdrawing leaves the row in place with `status = 'withdrawn'`.
Registering again called `create()`, which violated the constraint and surfaced
as a 500 — so withdraw-then-rejoin was broken for every event.

### Files changed

**New**
- `apps/web/utils/route-groups.ts` — one declaration of guest/chromeless routes,
  read by both the middleware and the layout so they cannot drift.
- `apps/web/utils/recovery-lock.ts` — sessionStorage flag marking a session as
  recovery-only. Fails *open*, so a storage error never strands anyone on the
  password form.
- `apps/web/middleware/guest-only.global.ts` — the missing signed-in guard, plus
  the recovery trap.
- `apps/web/layouts/auth.vue`, `apps/web/layouts/marketing.vue` — chromeless
  shells.
- `apps/web/components/ui/PageHeader.vue` — shared back affordance. Uses
  `router.back()` when there is real history (returns you to the list you came
  from, filters and scroll intact) and falls back to a declared `to` for deep
  links.
- `apps/web/tests/unit/route-groups.spec.ts` — 11 specs.

**Modified**
- `layouts/default.vue` — shell now gated on `showShell` (session **and**
  route), not the session alone. Eight call sites.
- `app.vue`, `nuxt.config.ts`, `assets/css/main.css` — loading indicator, 150ms
  opacity page transition, `prefers-reduced-motion` honoured.
- `pages/{login,register,reset-password,update-password,check-email,confirm,auth-error}.vue`
  — `definePageMeta({ layout: 'auth' })`.
- `pages/index.vue` — marketing layout; the late self-redirect removed.
- `pages/update-password.vue` — the 10×300 ms `getUser()` poll (up to a 3-second
  spinner) replaced with `onAuthStateChange` + immediate `getUser()` + a 3s
  backstop; recovery lock set on entry and released on success or cancel;
  "Back to sign in" now signs out rather than leaving a half-session behind.
- `server/api/v1/events/[eventId]/registrations.get.ts` — service-role read
  behind an explicit authorization check mirroring the RLS intent; left join;
  a profile the caller may not see is **redacted, never dropped**.
- `server/api/v1/events/[eventId]/register.post.ts` — duplicate check moved
  *after* the event lookup (a bad event id used to answer "already registered"
  instead of 404); withdrawn rows reinstated rather than re-inserted; the 409
  now distinguishes registered from checked-in.
- `server/domains/event/repositories/event-registration.repository.ts` — new
  `reinstate()`, which clears `withdrawn_at` and refreshes `registered_at`
  (queue order is first-come; keeping the old timestamp would hand back a place
  that was given up).
- Fetch parallelization — `pages/players/[playerId].vue` (6 SSR reads),
  `pages/dashboard.vue` (7), `pages/club/[clubId]/dashboard.vue` (6) grouped
  into `Promise.all`; 17 client-only (`server: false`) calls across 7 files had
  their `await` dropped, since those never feed SSR and the `await` only
  serialized them.
- `PageHeader` rolled out to `events/[eventId]`, `clubs/[clubId]`,
  `matches/[matchId]`, `matches/submit`, `players/[playerId]/head-to-head`
  (the last replaced a hand-rolled inline `<svg>` link).

### Database changes

**None.** Phase 1 is application-layer only; no changeset was needed. Next free
Liquibase prefix remains `036-`.

### Validation

`typecheck` clean, `eslint` 0 errors (8 pre-existing warnings in
`PlayerCard.vue` / `Skeleton.vue`, untouched), `prettier` clean on every changed
file, **923 unit tests passing** (was 912).

### Still to verify live

Nothing in this phase has been driven in a browser yet:
- Signed in, hit `/`, `/login`, `/register` by URL — each should redirect to
  `/dashboard` with no sidebar ever appearing over the landing page.
- A full password reset from a real email link — no nav reachable until the
  password is set; "Back to sign in" should sign out.
- Register a player whose `profile_visibility` is `private` for an event and
  confirm they appear in the roster.
- Withdraw from an event, then register again — should succeed, not 500.

### Newly discovered architectural decisions

- **Redaction over omission on roster reads.** A registration is a fact about
  the event; who the player is, is a fact about the player. Only the second is
  private, so a non-public profile now returns a redacted player object rather
  than removing the row. Any future service-role listing endpoint should re-apply
  the visibility rule in application code the same way, since the service-role
  client bypasses RLS entirely.
- **Recovery sessions need an application-level flag.** Supabase exposes nothing
  on the session object distinguishing a password-recovery session from a normal
  one, so "this session may only set a password" has to be tracked by us.

---

## Post-MVP Enhancement Plan — Phase 2: feed, shout-outs, notifications, moderation

Status: **COMPLETE** (code + automated checks). Migrations authored but **not yet
applied to any live database**.

### The root causes

**1. The feature-flag system had no readers.** `composables/useFeatureFlags.ts`
and `server/utils/feature-flags.ts` are both complete and correct, and
`pages/admin/features.vue` is fully data-driven off the `feature_flags` table —
but `isEnabled()` had **zero call sites** in the entire app, and only one key
had ever been seeded. So the SuperAdmin toggle saved to the database and nothing
anywhere read it. This is why turning achievements off changed nothing.

**2. Notifications looked inert because of a silent contract mismatch.**
`pages/notifications.vue` declared `is_read` and a free-form `data` bag. The API
has never sent either — `toNotificationDto()` emits `read`, and the payload is a
typed `reference_type`/`reference_id` pair. Both fields were permanently
`undefined`, which disabled every unread ring, the "Mark all as read" button and
all deep links. A third mismatch: the page read `unreadCount.count` while the
endpoint returns `{ data: { unread_count } }`. **The notifications were being
created correctly all along** — `match.verified` and `match.rejected` *are*
emitted from `verification/decision.post.ts`, contrary to an earlier survey.

**3. Feed prioritisation only ever reordered one page.**
`ActivityService.reprioritize()` re-sorted the records it had already fetched —
its own comment flags this as a known simplification, and it is a real one: at a
page size of 20, an item that should lead the feed but sits at row 400 by
timestamp never appears at all. Geo priority cannot be bolted onto that, because
"your barangay first" is only meaningful across the whole result set.

**4. Shout-out expiry already worked.** 020 gave `player_shoutouts` an
`expires_at`, the service sets it on create *and* update, and reads filter on
it. What was missing was housekeeping, phone-number rejection and event linking.

**5. No moderation existed at any layer.** No table, endpoint, UI or
notification type. "MODERATOR" in `club_memberships.role` is a *club* role and
unrelated to platform moderation.

### Database changes

Four changesets, `db.changelog-master.xml` updated. Next free prefix: **`040-`**.

- **`036-feature-flag-keys`** — seeds `achievements.enabled`. Because the admin
  page is data-driven the switch appears with no page change. Seeded **on**:
  achievements have been live since they shipped, so seeding off would silently
  remove a working feature the moment the migration ran.
- **`037-moderation`** — `player_reports` (reason/status CHECKs, a not-self
  CHECK, a partial unique index giving one *open* report per reporter/target
  pair, `(status, created_at)` for the queue). RLS lets a reporter insert and
  read only their own rows; there is deliberately **no** policy letting the
  reported player read rows about themselves, because the row names the
  reporter. `reporter_player_id` is `ON DELETE SET NULL` so a deleted account
  does not erase moderation history.
- **`038-shoutout-event-link`** — nullable `event_id` (FK `ON DELETE SET NULL`:
  deleting an event must not delete somebody's shout-out), a partial expiry
  index, `fn_sweep_expired_shoutouts()` and an hourly pg_cron schedule. The cron
  changeset is guarded by a `pg_available_extensions` precondition so it
  `MARK_RAN`s on the plain postgres:16 that CI runs — the sweeper is hygiene, and
  read-time filtering remains the correctness guarantee.
- **`039-feed-geo-priority`** — `fn_feed_for_player(...)` scoring barangay 3,
  city 2, province 1, else 0, with the old verified-club rule folded in as a
  tiebreak and `created_at DESC` last. Ordering happens **before** LIMIT/OFFSET,
  which is the entire point. Comparison is `lower(btrim(...))` because both
  columns are free text. A NULL viewer id (signed out) scores 0 everywhere and
  degrades to plain newest-first.

### Files changed

**New** — `server/utils/require-feature.ts`; `middleware/feature-achievements.ts`;
`composables/useUnreadNotificationCount.ts`; the whole `server/domains/moderation`
domain (dto/repository/service); `server/api/v1/players/[playerId]/report.post.ts`;
`server/api/v1/admin/reports/{index.get,[reportId].patch}.ts`;
`pages/admin/reports.vue`; `server/domains/shoutout/services/contact-info.ts`;
`server/api/v1/players/me/linkable-events.get.ts`;
`tests/unit/{contact-info,report.service}.spec.ts`.

**Modified** — seven achievement/badge endpoints gated with `requireFeature`
(404, not 403: with the feature off the resource does not exist, and 403 would
confirm it does); `pages/players/[playerId].vue` (four achievement surfaces
gated, plus the report action and modal); `layouts/default.vue` (achievements nav
item, Reports nav item, unread badge on both bells); `pages/notifications.vue`
(corrected to the DTO, deep links rebuilt off `reference_type`);
`pages/feed.vue` (rewritten as a vertical stack); the activity
repository/service/endpoint (geo feed); the shout-out DTO/repository/service
(shared `validateMessage`, phone rejection, event link) and both write endpoints;
`pages/dashboard.vue` (event picker, error display).

### Two extra defects found and fixed

- `pages/dashboard.vue` declared its **own** local `ShoutoutDto` that had already
  drifted from the server type — the same class of bug as the notifications
  mismatch. Replaced with an import of the real DTO.
- The shout-out composer swallowed API errors entirely, so a rejected post left
  the box full of text with no explanation. It now shows the message.

### Tests added

- `contact-info.spec.ts` — 23 specs. Catches `09171234567`, `+63…`, `0063…`, and
  the separator and letter-substitution evasions (`O9I7 - I23 . 4567`). Just as
  important, the negative cases: scores (`11-9, 11-7`), ratings (`4.25`), dates
  and times, and court counts must all still post. `s`→`5` / `e`→`3` are
  deliberately **not** folded, because they turn ordinary words into digits.
- `report.service.spec.ts` — 14 specs, most of them about the privacy rule: the
  warning notification must never contain the reporter's id, filing a report must
  not notify the reported player, and `warn_player` must be ignored on a
  dismissal.

### Validation

`typecheck` clean, `eslint` 0 errors (the same 8 pre-existing warnings in
`PlayerCard.vue`/`Skeleton.vue`), `prettier` clean, **960 unit tests passing**
(was 923).

### Still to verify live

**No migration in this phase has been applied to a database.** Run 036–039
through CI's ephemeral postgres first (apply *and* rollback), then dev.
- Toggle `achievements.enabled` off: achievements should vanish from the profile,
  the nav, the standalone page, and the API should 404.
- Post a shout-out containing a phone number in several formats.
- Confirm the bell badge appears and notification deep links work.
- File a report, warn from `/admin/reports`, and confirm the warning names the
  reason and never the reporter.
- Confirm the feed orders by proximity — this needs at least two players with
  different `province`/`city`/`barangay` values.

### Newly discovered architectural decisions

- **Ordering that spans the result set belongs in SQL.** PostgREST cannot order
  by a joined table's column, so any future "rank by something relational" work
  should follow `fn_feed_for_player` rather than re-sorting a fetched page.
- **Two DTOs where one of them is privileged.** `PlayerReportDto` structurally
  cannot carry the reporter; `AdminPlayerReportDto` adds it. Leaking the reporter
  takes a deliberate change of type rather than forgetting a `delete`.
- **Client feature gates always need a server twin.** `require-feature.ts` is now
  the pattern; a flag that only hides UI is not a gate.
- **Locally re-declared DTOs are a recurring bug source.** Two were found in this
  phase alone, one of which had silently broken a whole page. Import server DTOs
  rather than restating them.

---

## Post-MVP Enhancement Plan — Phase 3: club profile and settings

Status: **COMPLETE** (code + automated checks). Migration authored but **not yet
applied to any live database**.

### The root causes

**1. Club URLs were UUIDs because nothing called the code that already existed.**
`clubs.slug` has been present and unique-constrained since 003-club, and
`ClubRepository.findBySlug()` was fully written — it simply had **no caller**,
and no route ever resolved a slug. This was wiring, not a feature.

**2. Upcoming vs previous events was split by status, not by date.**
`loadClubEvents()` read upcoming = `published` + `active`, previous =
`completed`. An event whose date had passed but which nobody marked complete
stayed under "Upcoming" forever, and `cancelled` events appeared in **neither**
list — a cancelled fixture simply vanished with no explanation.

**3. Club rankings were singles-only because the page never asked.**
`GET /api/v1/clubs/:id/rankings` has always accepted `?rating_type=doubles`. The
card was hardcoded to singles and even labelled "By singles rating", so the
format most club play actually happens in was unreachable.

**4. Announcement colour came from `pinned` alone.** `announcement_type` —
which already includes `urgent` and `maintenance` — had no colour treatment at
all, so a court closure looked identical to a social post. The one highlight
that did exist was a 10% wash that barely read on either theme.

**5. There was no cover photo column and no club settings page.** `clubs` had no
image column at all; the profile rendered `UiCoverArt`, a banner generated from
the club name. The sidebar's "Club Settings" pointed at the *public* profile, and
every edit happened through inline staff controls scattered across it.

### Database changes

**`040-club-branding`** (registered in `db.changelog-master.xml`). Next free
prefix: **`041-`**.

- `clubs.cover_photo_path`, `clubs.logo_path` — both nullable, both **paths**
  rather than URLs, for the reason 025-platform-branding documents: the URL
  shape depends on whether the bucket is public, which is a deployment decision.
  NULL means "use the generated cover art", which is a finished design.
- `ck_clubs_slug_format` — the slug regex was previously enforced only in
  application code. Now that a slug is a routable address, a malformed one is a
  broken URL. Added **`NOT VALID`**: existing rows are left alone, because
  failing a deploy to reject a slug nobody has complained about is the wrong
  trade. New and updated rows are checked.

**Also fixed:** `CLUB_COLUMNS` in the repository is the select list for *every*
club read, so the new columns had to be added there or they would have read as
`undefined` everywhere rather than failing loudly.

### Files changed

**New**
- `server/domains/club/dto/club-slug.ts` — slug rules shared by the create and
  edit paths. Adds a reserved-word list (`admin`, `settings`, `clubs`, `api`,
  `login`, `superadmin`, …) and a UUID-shape check.
- `server/domains/club/services/club-branding.service.ts` — reuses the
  platform's `BrandingAssetRepository` (same bucket, same public-vs-signed URL
  logic) rather than growing a second storage path that could drift.
- `server/api/v1/clubs/[clubId]/images/[slot].{post,delete}.ts`
- `pages/club/[clubId]/settings.vue` — cover photo, logo, custom URL, details.
- `components/club/AnnouncementCard.vue`
- `tests/unit/club-slug.spec.ts` — 32 specs.

**Modified**
- `server/api/v1/clubs/[clubId].get.ts` — resolves by **shape**: a UUID is
  looked up by id, anything else by slug. Both keep working forever rather than
  redirecting, so a slug change never breaks a link already printed on a poster
  or encoded in a QR code.
- `server/api/v1/clubs/[clubId].patch.ts` — slug editing with a 409 on
  `SLUG_TAKEN`. Also **fixed in passing**: `barangay`, `court_name` and
  `court_address` were already on `UpdateClubInput` but the body parser never
  accepted them, so they could not be edited at all.
- `server/api/v1/clubs/index.post.ts` — now uses the shared slug rules; its
  inline regex accepted reserved words like `admin` and `settings`.
- `pages/clubs/[clubId].vue` — date-based event split, singles/doubles ranking
  toggle, cover photo and logo rendering, announcements via the new component.
- `layouts/default.vue` and `pages/club/[clubId]/dashboard.vue` — "Club
  Settings" now points at the settings page rather than the public profile.

### Design note on the announcement highlight

The request was "easier to see but not too vivid". The fix is a **2px left
rule** plus a `/15` tint, rather than a louder wash: an edge reads at a glance
while staying quiet, so the colour does *less* work, not more. `pinned` keeps its
own star mark rather than borrowing the type colour — "pinned" and "urgent" are
different claims and a reader has to be able to tell which they are looking at.

### Validation

`typecheck` clean, `eslint` 0 errors (the same 8 pre-existing warnings),
`prettier` clean, **992 unit tests passing** (was 960).

One TypeScript subtlety worth recording: `$fetch(\`/api/v1/clubs/\${id}\`, { method: 'PATCH' })`
fails to typecheck because the template literal also matches the GET-only literal
routes (`/api/v1/clubs/mine`, `/api/v1/clubs/all`), so Nuxt intersects the
allowed methods down to GET. Supplying an explicit response type selects the
generic overload.

### Still to verify live

**`040` has not been applied to any database.** Run it through CI's ephemeral
postgres (apply *and* rollback) before dev.
- Visit a club by slug and by UUID — both must resolve to the same page.
- Change a slug, then confirm the old UUID URL still works.
- Try to claim a reserved slug (`admin`) and a taken one; both should be refused
  with a readable message.
- Upload a cover photo and a logo, then remove them and confirm the generated
  cover art returns.
- Confirm a past-dated `published` event moves to Previous, and that a cancelled
  event now appears there rather than vanishing.
- Toggle the club rankings between singles and doubles.
- Post an `urgent` announcement and check contrast in both light and dark.

### Newly discovered architectural decisions

- **Resolve by shape, keep both addresses.** A slug change must never invalidate
  a printed link, so the UUID route stays valid permanently instead of issuing a
  redirect. Any future human-readable URL should follow the same rule.
- **Reserved words are a routing concern, not a naming one.** A club at
  `/clubs/settings` is only a problem the day someone adds that page — by which
  time the club has the URL on a banner.
- **Reuse the asset repository, not the pattern.** Club images share the
  platform's bucket, signing rules and public-vs-private detection outright. A
  parallel implementation would have duplicated the signed-URL lifetime logic and
  let the two drift.

---

## Post-MVP Enhancement Plan — Phase 4: open play courts, live scoring, mixup

Status: **COMPLETE** (code + automated checks). Migration authored but **not yet
applied to any live database**.

### The two blockers, and what they were

**1. There was no way to start an event.** `UpdateEventInput` has no `status`
field, so `'active'` was unreachable through the API — while check-in, the
Record Match card and the withdraw/check-in branches **all** gated on
`status === 'active'`. Every one of those paths was dead code. Nothing in the
product could ever have reached them.

**2. `event_courts` was dead schema.** The table has existed since 017 with
`court_number`, `court_name`, `status`, `current_match_id` and
`match_started_at`, and `EventCourtRecord`/`EventCourtDto` existed in
`event.dto.ts` — with **no repository, service, endpoint or UI**. A "court" in
practice was the integer `events.queue_courts` plus a free-text `court_number`
on `event_queue`, which two entries could both claim with nothing noticing.

### Database changes

**`041-open-play-live`**. Next free prefix: **`042-`**.

- `event_courts.live_score` (jsonb), `team1_queue_id`, `team2_queue_id`,
  `live_score_updated_at`. The live score is deliberately **not** in
  `match_scores`: an unfinished game is not a result, and a `matches` row
  carries verification semantics (`submitted → pending_verification →
  verified`). Writing a half-finished score there would create matches that look
  submitted, feed the rating engine, and need verifying by players still on
  court.
- `events.match_format` (`singles`/`doubles`, default `doubles`). Tournaments
  answer this via `tournaments.match_type`; open play never asked, so the queue
  had to guess.
- Indexes including a partial one on `status = 'playing'`, which is the hottest
  read in the phase — every poll asks "is anything live here".
- RLS on `event_courts`: reads as open as the event itself; **no INSERT/UPDATE
  policy at all**, because scores are the one thing players must not write
  directly. Every write goes through the service-role client behind an
  organiser/club-staff check.

### Files changed

**New**
- `server/domains/event/repositories/event-court.repository.ts` —
  `ensureCourts` is idempotent, so starting, completing and restarting an event
  cannot produce two sets of courts.
- `server/domains/event/services/event-court.service.ts`
- `server/domains/event/services/mixup-scheduler.ts` — pure function.
- `server/utils/event-organizer.ts` — "organiser **or** club staff", mirroring
  `assertCanReviewRegistrations`: a club night is run by whoever is on the desk,
  not by whoever created the event a fortnight ago.
- `server/api/v1/events/[eventId]/{start,complete}.post.ts`
- `server/api/v1/events/[eventId]/courts/index.get.ts` and
  `courts/[courtId]/{start.post,score.patch,submit.post}.ts`
- `server/api/v1/events/[eventId]/queue/mixup.post.ts`
- `composables/useLiveScores.ts`
- `components/event/CourtCard.vue`
- `tests/unit/mixup-scheduler.spec.ts` — 15 specs.

**Modified** — `event.dto.ts` (live score types, court side DTOs,
`match_format`), `event.service.ts` (`startEvent`/`completeEvent`),
`event.repository.ts`, `pages/events/[eventId]/index.vue` (Start/End Event, a
Courts tab, the LIVE dot, the court start modal, the Queue/Mixup toggle and
preview), `pages/create-event.vue` (format choice, doubles first).

### The mixup scheduler, and the bug the tests caught

"Mixup" rotates partners **and** opponents so that, as far as possible, nobody
partners the same person twice. It is a pure function — players, courts, rounds
in, a schedule out — specifically so the hardest logic in the phase could be run
a thousand times in a unit test rather than against a live session.

The tests immediately caught a real inversion: sit-outs were sorted **ascending**
by sit-out count, and since the players *taken* are `slice(0, playersPerRound)`,
that benched the same two people every single round. Sorting descending is what
"fewest sit-outs first" actually requires when you are selecting from the front.

A single greedy pass reliably missed the canonical case (8 players, 2 courts, 7
rounds), because one early arbitrary choice rules it out. Adding **best-of-24
restarts** with derived seeds now produces a *perfect* rotation there — all 28
possible pairings exactly once, which is `C(8,2)`. Restarts stay deterministic,
so the preview an organiser approves is the schedule they get.

The schedule is a **preview and writes nothing**. People arrive late, leave
early and pull out with a bad ankle, so an evening's pairings committed to the
database at 7pm is a liability by 8. Courts are still started one at a time.

### Live scores: 30-second polling, not Realtime

Per your decision. Two guards are what make polling reasonable rather than
wasteful, and both live in `useLiveScores`:
1. It only polls while a court is actually `playing` — a session that has not
   started, or has finished, costs nothing.
2. It stops while the tab is hidden, so a phone in a pocket is not asking.

Everything goes through that one composable, so swapping to Realtime later is a
single-file change.

### Submit order, and why

`submit.post.ts` frees the court **first**, then creates the match, then pulls
the next pair on. If match creation fails the organiser is left with an empty
court they can restart rather than a court permanently stuck on a game nobody
can end. Failures are returned as `warnings` rather than swallowed, so the desk
finds out while the players are still standing there.

### Validation

`typecheck` clean, `eslint` 0 errors (same 8 pre-existing warnings), `prettier`
clean, **1007 unit tests passing** (was 992).

### Still to verify live

**`041` has not been applied to any database.**
- Start an event, confirm courts appear and check-in becomes usable (it has
  never been reachable before).
- Start a court, add points, submit — confirm a real `matches` row is created
  and the next queued pair loads automatically.
- Open the event in a second browser and confirm the LIVE dot and score update
  within 30 seconds, and that hiding the tab stops the polling.
- Generate a mixup rotation with 8 players and check nobody repeats a partner.
- End the event and confirm an unverified club can then publish another.

### Newly discovered architectural decisions

- **In-progress state does not belong in the result table.** A live score lives
  on the court, not in `match_scores`, because a `matches` row means "this
  happened and needs verifying". The same reasoning applies to the tournament
  live scores in Phase 5.
- **Running a session is a staff capability, not an ownership one.** Tying court
  control to the event's creator stalls the evening the moment they step away.
- **Pure functions for anything combinatorial.** The scheduler had a genuine
  inversion bug that only a test could have found; keeping it free of
  repositories and clocks is what made that test possible.

---

## Post-MVP Enhancement Plan — Phase 5: tournaments, fees, sponsors

Status: **COMPLETE** (code + automated checks). Migration authored but **not yet
applied to any live database**. This completes all five phases.

### The root causes

**1. Double elimination did not work.** `advanceWinner` bailed out with "the
losers bracket (100+) and grand final (200) are not routed" — so winners
advanced, **losers simply vanished**, and every losers-bracket match stayed a
pair of TBDs that could never be filled. A "double elimination" draw was in
practice a single elimination with an unreachable second half, and the grand
final never received either participant: the winners final fell through
`nextSlotFor` to a round that does not exist and was treated as "the final".

**2. `tournament_categories.status` was never enforced.** `'closed'` and
`'completed'` have always existed in the enum, but `EventService.register()`
checked tournament status, `registration_closes`, band, capacity and duplicates
— never the category's own status. The card's Open/Full/Complete label was
*derived from the bracket*, so an organiser could close a category, watch the UI
agree, and still take entries through a stale page or a direct call.

**3. The header Register button was event-level on a tournament.** It posted to
`/events/:id/register` for any `published|active` event regardless of type, so a
player could be "registered for the weekend" without being in any draw.

**4. The band warning replaced the Register button**, and the button only
appeared once a category opened. A player looking at a category that had not
opened could not tell whether they would even be *eligible* — and finding that
out on the morning registration opens is the worst possible time.

### Database changes

**`042-sponsors`**.

- `platform_sponsors` (label, `image_path`, `link_url`, `display_order`,
  `enabled`) plus `platform_config.sponsors_heading`. A table rather than more
  config columns because sponsors are many and ordered, where the hero is one —
  but the section *heading* is a single value, so it sits with the hero fields.
- Images as bucket-relative **paths**, per 025/026.
- `enabled` exists so a lapsed sponsor can be hidden without deleting the row
  and losing the image with it.
- RLS: public read of enabled rows; **no write policy at all** — writes go
  through the service-role client behind a SuperAdmin check.

### Files changed

**New** — `server/domains/platform/{dto/sponsor.dto.ts,repositories/sponsor.repository.ts,services/sponsor.service.ts}`;
`server/utils/sponsors.ts`; `server/api/v1/platform/sponsors.get.ts`;
`server/api/v1/admin/sponsors/*` (list, create, patch, delete, image upload);
`pages/admin/sponsors.vue`; `pages/events/[eventId]/matches.vue`;
`server/domains/event/services/registration-fee.ts`;
`tests/unit/{double-elimination,sponsor}.spec.ts`.

**Modified** — `bracket.service.ts` (losers/grand-final routing),
`event.service.ts` (category status enforced), `CategoryCard.vue`,
`CategorySection.vue`, `RegisterSummaryModal.vue`,
`pages/events/[eventId]/index.vue`, `pages/index.vue`, `layouts/default.vue`.

### The bracket fix

Two new routing functions, and one deletion of a bail-out:

- **`routeLoser`** — the half that was missing entirely. Round-1 losers pair into
  losers round 1 by parity; round *r* losers (r ≥ 2) drop into losers round
  `2r-2`, into slot 2. Slot 1 is reserved for whoever came *up* the losers
  bracket, so a card always reads "survivor vs the person who just lost".
- **`nextLosersSlot`** — the losers bracket alternates between a *minor* round
  (survivors play each other, the field halves) and a *major* round (same size,
  each survivor meets a winners-bracket dropdown), which is why one
  "round+1, position/2" rule cannot describe it. Rather than recompute the
  generator's arithmetic and risk the two drifting, it reads the **actual match
  counts** of both rounds and picks the mapping that fits.
- **`nextWinnersSlot`** — routes the winners finalist into the grand final.

Called from **both** `updateBracketMatch` (the organiser override) and
`recordMatchResult` (the real scoring path) — the second was easy to miss and is
the one players actually go through.

**Known limitation, deliberately not built:** a grand-final reset. A
losers-bracket player who wins the grand final has only lost once, so a strict
double elimination plays a decider — but the generator emits a single
grand-final match, and inventing a round the draw does not contain would put a
fixture on the schedule no view knows how to render.

### Fee waiver — display only, per your decision

`resolveFeeWaiver` runs **server-side** and the client renders what it is told.
A price the browser calculates is a suggestion, not a price, and the whole
reason `convenience-fee.ts` is shared is that the quote and the charge can never
disagree. `OWNER`/`ADMIN` only, not `MODERATOR`: a moderator reviews
registrations, they do not run the club's finances. Nothing is charged yet
(webhooks still throw 501); this decides what a player is *told* and is the hook
billing will read.

### Tests added

- `double-elimination.spec.ts` — 6 specs driving the **real service** against an
  in-memory bracket repository, because the bug was in the routing *between*
  matches, which no generator-shape assertion can see. Plays an 8-player draw to
  a champion and asserts every losers match ends up with both participants.
- `sponsor.spec.ts` — 10 specs, mostly on link safety: `javascript:`, `data:`,
  `file:` and relative URLs are all refused, because that value is rendered as an
  `href` on the public landing page.

### Two existing tests changed, both deliberately

- `event.service.spec.ts` — category fixtures gained `status: 'open'`. The
  column is NOT NULL with default `'open'` (018), so a real record always has
  one; the fixtures simply predated anything reading it.
- `category-card.spec.ts` — "replaces Register with the reason" became "shows
  the reason **and** a disabled Register". That test asserted the behaviour this
  phase intentionally changed.

### Validation

`typecheck` clean, `eslint` 0 errors (same 8 pre-existing warnings), `prettier`
clean, **1023 unit tests passing** (was 1007).

### Still to verify live

**`042` has not been applied to any database.**
- Generate a **double-elimination** draw and play it to completion. This is the
  highest-risk item in the whole plan: confirm losers land correctly, the grand
  final fills from both sides, and a champion is declared.
- Close a category and confirm the API refuses an entry, not just the UI.
- Check a not-yet-open category shows a disabled Register *and* the band warning.
- Register as a club owner for your own club's tournament and confirm ₱0 with
  "Waived — club organizer".
- Open `/events/:id/matches` on a second screen.
- Add a sponsor with a logo and a link; confirm it appears on the landing page,
  that hiding it removes it, and that a `javascript:` link is refused.

### Newly discovered architectural decisions

- **Read the data, don't re-derive the formula.** `nextLosersSlot` infers the
  mapping from the actual match counts rather than recomputing the generator's
  arithmetic. Any future format should route the same way — the alternative is
  two copies of a formula that must agree forever.
- **A status column that nothing reads is not a status.** `category.status` sat
  unenforced through several releases while the UI derived a label that happened
  to look right. Worth auditing the other status enums for the same pattern.
- **Prices are server-side facts.** The waiver joins the fee ladder as something
  the client displays rather than decides.

---

## Liquibase bookkeeping tables were world-writable (2026-08-30)

Supabase's linter reported "RLS Disabled in Public" for
`public.databasechangeloglock`. It is not a cosmetic finding. Verified against
dev with nothing but the publishable anon key:

- `GET  /rest/v1/databasechangeloglock` → `200 [{"id":1,"locked":false,...}]`
- `GET  /rest/v1/databasechangelog`     → `200` with the full changeset history
- `PATCH` and `DELETE` on the lock table → `204`

Liquibase creates both tables in `public` as `postgres`, so Supabase's default
privileges handed `anon`/`authenticated` full CRUD, and nothing had ever enabled
RLS on them. Anyone holding the public key could set `locked = true` and wedge
every future migration, or delete `databasechangelog` rows and make Liquibase
re-run applied changesets against a live database.

### Database changes

**`044-liquibase-table-lockdown`**. Next free prefix: **`045-`**.

- `REVOKE ALL` on both tables from `PUBLIC`, `anon`, `authenticated`,
  `service_role` — no client, server or edge code reads them.
- `ENABLE ROW LEVEL SECURITY` on both, with **no policies**: deny by absence, so
  a future default-privilege grant still exposes zero rows.
- Deliberately **not** `FORCE ROW LEVEL SECURITY`. Liquibase connects as the
  tables' owner and an owner bypasses ordinary RLS — that is what keeps
  migrations working. Under FORCE, the empty policy set would apply to the owner
  too and Liquibase's release-lock `UPDATE` would match zero rows, silently.

Moving the tables out of `public` via `liquibaseSchemaName` was considered and
rejected: the move would have to `ALTER` the very lock table the running
migration holds, so it cannot be done from inside a changeset, and doing it
outside Liquibase means hand-run SQL against production.

**Prod is still exposed until `db-migrate.yml` is dispatched against
`db-production`.** Dev picks this up automatically on merge to `main`.

---

## Post-MVP Enhancement Plan — Phase 6: closing the outstanding items

Status: **COMPLETE** (code + automated checks). Migration authored but **not yet
applied to any live database**. Nothing from the original request list is now
outstanding.

This phase exists because an audit of Phases 1-5 against the original request
found three items reported as done that were not, plus one limitation that had
been deliberately deferred and one piece of dead code left behind.

### What was actually still missing

**1. Team-up notifications had a type but no emitter.** `team_up.invited` and
`team_up.accepted` were added to `NotificationType` during the moderation work
in Phase 2, and **nothing ever fired them**. Being added to somebody's roster —
which lets them commit your evening by entering you for a session — announced
itself nowhere.

**2. Notifications were one undifferentiated stream.** Phase 2 fixed the broken
plumbing (the `is_read`/`read` contract mismatch, the missing bell badge, the
dead deep links) but did no filtering, so "did anyone ask to team up with me?"
still meant scrolling past every rating recalculation.

**3. Tournament live scoring did not exist.** Phase 5 fixed bracket
*progression* and added the big-screen matches page, but only final-result entry
(`result.post.ts`) was ever built. There was no way to show a score changing
during a draw match — the thing the red LIVE label was supposed to point at.

**4. Double elimination had no grand-final reset** (a known, documented
limitation from Phase 5).

**5. `ShoutoutService.getRecent()` / `findActiveWithPlayer()` were dead code** —
Phase 2 said delete or wire them and did neither.

### Database changes

**`043-tournament-live-score`**.

Note: `044-liquibase-table-lockdown` already exists in the tree from separate
work and is registered after this one, so the next free prefix is **`045-`**.

- `bracket_matches.live_score` (jsonb), `live_score_updated_at`, `started_at`.
  Same reasoning as `event_courts.live_score` in 041: an unfinished game is not
  a result, and writing a half-played score into `matches` would create rows
  that look submitted, feed the rating engine, and need verifying by a pair
  still on court.
- `started_at` is a separate column rather than a new `status` value, because
  `status` already carries the DRAW's state (pending/ready/completed/bye) and
  overloading it would make `ready` ambiguous.
- A partial index on live matches, which is what every poll asks about.

### Files changed

**New** — `utils/notification-categories.ts`;
`server/api/v1/bracket-matches/[bracketMatchId]/{start.post,score.patch}.ts`.

**Modified** — `players/[playerId]/team-up.post.ts` and
`team-ups/[teamUpId]/respond.post.ts` (emitters); `pages/notifications.vue`
(category tabs); `bracket.dto.ts`, `bracket.repository.ts`,
`bracket.service.ts` (live score + reset routing); `utils/bracket-rounds.ts`
(`GRAND_FINAL_RESET_ROUND`); `CategoryMatchRow.vue`, `CategoryMatches.vue`,
`CategoryCard.vue`, `CategorySection.vue` (live controls and the event chain);
`shoutout.{service,repository}.ts` (dead code removed).

### Notification categories

Four: Account, Clubs, Community, Warnings — derived from the type prefix rather
than stored on the row. `notifications` has no category column, and adding one
would mean a migration plus a backfill to express what the prefix already
encodes. An unrecognised type falls into `account`, so a new type shows up
somewhere rather than becoming silently unreachable.

`match.*` and `rating.*` sit under Account deliberately: they are things that
happened to *your record*, not social events. Filtering is client-side because
the page is already fetched — a round trip per tab would be slower than the
filter it replaces.

### Tournament live scoring

Mirrors the open-play court model exactly, including the ordering rule: starting
a match is **not** recording a result. A started match has no winner and no
`matches` row, so nothing has entered anybody's record; the result still goes
through `recordMatchResult` and its verification semantics. Recording a result
now also clears the live state, so a finished match stops claiming to be in
progress.

The per-point handler deliberately does **not** refresh the whole bracket: a
draw refetch on every tap would make the scoreboard lag behind the person
pressing the button.

### The grand-final reset

Round 201, generated with the draw rather than inserted when it becomes
necessary — a bracket is a fixed set of rows that views render and organisers
schedule, and materialising a fixture mid-tournament would mean every reader had
to cope with the shape changing underneath it. It stays empty, and therefore
renders as nothing, unless the losers-bracket entrant wins the grand final.

`finalMatchOf()` now prefers the decider **only once it has a winner**, so the
champion is read from the match that actually settled the title.

### Two extra defects found and fixed

- `NewBracketMatch` was spelled out inline in three places as
  `Omit<BracketMatchRecord, 'id' | 'created_at'>`. Adding columns broke all of
  them; the shape is now declared once in the DTO and shared by the repository
  and the generators.
- A JSDoc block in `bracket.repository.ts` had been orphaned from its
  declaration by an earlier edit.

### Validation

`typecheck` clean, `eslint` 0 errors (the same 8 pre-existing warnings in
`PlayerCard.vue`/`Skeleton.vue`), `prettier` clean, **1027 unit tests passing**
(was 1023). The four new specs cover the reset: empty when the unbeaten finalist
wins, seeded with both players when the challenger wins, settled on the decider,
and exactly one decider slot per draw.

### Still to verify live

**`043` has not been applied to any database.**
- Send a team-up request and accept it; confirm both notifications arrive and
  that a *decline* sends nothing.
- Check the notification tabs, including the per-tab unread counts.
- Start a draw match, add points, and confirm a second browser sees the red LIVE
  label and the running score. Submit the result and confirm the live state
  clears.
- Play a double elimination where the **losers-bracket** entrant wins the grand
  final, and confirm the decider appears and settles the title. This is the
  single highest-value manual check in the whole plan.

### Newly discovered architectural decisions

- **An enum value with no emitter is not a feature.** Two notification types sat
  in the union for a whole phase looking implemented. Worth grepping the rest of
  `NotificationType` for the same pattern before adding more.
- **Derive categories from the type, not a column.** The prefix already encodes
  the grouping; a column would need a migration, a backfill, and a second place
  to keep in step.
- **Declare "insert shape" types once.** `NewBracketMatch` broke in three files
  the moment the table gained columns.

---

## Demo data seeding (2026-08-31)

Backlog item "3. Dummy Data Seeding" in `/docs/10-IMPLEMENTATION-BACKLOG.md`,
which had been on hold. The dev database was near-empty, so the surfaces that
are supposed to feel like a community — the feed, `/community`, `/events`,
`/clubs`, `/rankings`, event detail — all rendered as empty states, and there
was no way to tell whether geo-priority ranking, registration slot bars, the
event roster or the rankings podium actually looked right.

**Scope, deliberately larger than the backlog line asked for**: 100 players
(not 10-20), 12 clubs, and **100 events — 20 in every one of the five
`event_type` categories** — because the point was to see the app full, not
merely non-empty.

### Files

- `scripts/demo/demo-users.mjs` — `--seed` creates 100 real Supabase auth users
  (`demo.playerNNN@demo.dinkandladder.test`) plus their `public.users` rows;
  `--purge` removes them. Refuses to run unless `SUPABASE_URL` contains
  `DEMO_EXPECTED_PROJECT_REF`, the same shape of guard as the "Confirm target
  database" step in `.github/workflows/db-migrate.yml`.
- `database/seeds/demo/00-config.sql` — helper function/views.
- `database/seeds/demo/01-players.sql` … `06-brackets.sql` — the seed.
- `database/seeds/demo/99-rollback.sql` — the teardown.
- `database/seeds/demo/README.md` — run order, env vars, safety notes.
- **Deleted** `database/seeds/test-data.sql`.

### Reversibility is the design

Every demo row's primary key is `public.fn_demo_id(<text key>)`, which lands in
a reserved namespace `deadbeef-xxxx-4000-8000-xxxxxxxxxxxx`. That single choice
buys three properties at once: teardown is an exact `id::text LIKE 'deadbeef-%'`
with no bookkeeping table and no risk to real rows; the seed is idempotent and
re-runnable, since ids are a pure function of their key; and child rows can
reference parents without a `RETURNING` round-trip, so the whole thing is
`generate_series` + arrays rather than thousands of literal rows.

Auth users are the one thing SQL cannot own, so they are namespaced by a
reserved email domain instead and torn down by it.

This is data, not schema, so it is **not** a Liquibase changeset — the precedent
set by `scripts/find-email-derived-display-names.mjs`. Nothing goes near
`databasechangelog`, which `044` locked down.

### Why the old seed had to go

`database/seeds/test-data.sql` could not run against the current schema. It
referenced ~12 columns that do not exist (`player_profiles.skill_level`,
`is_public`, `player_ratings.wins`/`losses`, `clubs.contact_email`,
`clubs.created_by`, `tournaments.scoring_type`, `tournament_categories.entry_fee`
and more), used lowercase membership roles against an UPPERCASE CHECK, used an
`open_play` event type that `ck_events_event_type` rejects, omitted the NOT NULL
`clubs.slug`, and inserted `player_profiles` with no matching `users` row. It was
referenced by nothing.

### Constraints the seed is written around

- `events.start_date`/`end_date` are `DATE` — `CURRENT_DATE + n`, never
  `NOW() + INTERVAL`; `chk_event_time_order` needs `end_time > start_time` on a
  single-day event.
- `club_memberships.role` is UPPERCASE; `status` is lowercase.
- `player_ratings.provisional` is `GENERATED ALWAYS AS (matches_played < 5)` —
  never inserted. The cluster-10 players belong to no club and so play no
  matches, which is what produces provisional rows.
- `trg_tournament_registrations_one_per_category` (032) raises `23505` if a
  player *or their partner* already holds a live slot in the same
  `(tournament_id, category_id)`; the pairing gives each roster member exactly
  one appearance per category.
- `idx_shoutouts_single_active` allows one active shout-out per player, and
  `expires_at` must be in the future or the hourly `fn_sweep_expired_shoutouts()`
  pg_cron job deletes them.
- `fn_feed_for_player` (039) only returns `activities.visibility = 'public'`, and
  scores geography on `lower(btrim(...))` equality — so profiles, clubs and
  events all draw their province/city/barangay from one shared cluster list.
- A match with no `match_scores` rows is silently skipped by the event
  leaderboard, so every generated match gets its sets.

### Two findings worth recording

1. **The app writes two activity types the feed can never show.**
   `social.started_following` is written with `visibility = 'followers'` and
   `club.member_joined` with `'club'`, but `fn_feed_for_player` filters
   `visibility = 'public'`. They are seeded as `'public'` here so their rendering
   can be reviewed, but the live app will never surface them as written. Worth a
   decision: widen the feed function, or change what the writers store.
2. **Three activity types have no writer at all.** `achievement.earned`,
   `profile.updated` and `club.announcement` are rendered by
   `formatActivityText()` but never produced by any handler.

### Remaining work

- [ ] Run `--seed` + `00`..`05` against the dev database and walk the surfaces.
- [ ] Rollback drill: `99-rollback.sql` + `--purge`, confirm the verification
      counts are all zero, then re-seed.
- [ ] Decide what to do about the two findings above.
- [ ] Production cleanup / data wipe (after go-live dry run).

### Brackets and open play (added after the first pass)

The first cut skipped `bracket_matches` on the grounds that the app generates
draws itself. That left the Matchups view and the round-robin standings empty,
which is precisely one of the things the seed exists to show, so `06-brackets.sql`
was added.

It draws and plays tournaments **10..17**, in the only two formats it can
reproduce byte-for-byte as `bracket.service.ts` emits them — `single_elimination`
(`buildFirstRound` + empty later rounds, winners advanced by `nextSlotFor()`) and
`round_robin` (the circle method from `generateRoundRobinBracket`, entrant 0
fixed and the other seven rotating one place per round). Eight entrants per
category, a power of two, so there are no byes and no empty slots. Completed
events play through to a champion; the three active ones stop mid-draw with one
slot `in_progress` carrying a live score.

**`double_elimination` and the two staged pool→playoff formats are deliberately
not seeded.** Their losers-bracket routing (`routeLoser`'s major/minor
alternation, the grand-final reset) and pool seeding are intricate enough that a
hand-written draw that is subtly wrong renders as a *broken* bracket, which is
worse than an empty one. Those three sit on the published tournaments (1..9)
with 8 confirmed entrants and `max_participants = 8` so `generateBracket` will
accept them — the draw is produced in-app by the real generator.

Three constraints found while wiring this up, all of which changed the seed:

1. **`generateBracket` refuses a category that is not full** (`CATEGORY_NOT_FULL`)
   whenever `tournament_categories.max_participants` is set. The first cut had
   capacity 16 against 4 entries, so every draw would have been undrawable.
   Capacity is now exactly the entry count.
2. **Entrants had to come from the global player pool, not the club roster** —
   the smaller clubs have 12 active members and a category needs 16 people for 8
   doubles pairs. They are taken from 16 consecutive pool indices, which is also
   what satisfies the `032` one-entry-per-category trigger.
3. **`event_courts.live_score` is `LiveGameScore[]`, a JSON array of
   `{game_number, team1_score, team2_score}` — not an object**, and one
   `event_queue` row is one *side* of a court (the courts endpoint builds a side
   from `[player_id, partner_id]`), not one person. The first cut had both wrong,
   which would have rendered an empty board rather than an error. The open-play
   sessions now seed 8 sides, courts 1 and 2 in play with `team1_queue_id` /
   `team2_queue_id` set and a running score, and the rest waiting to fill
   "Up next".

The rollback was changed to match: brackets and matches are now cleaned by their
**tournament and event**, not by the id namespace. Anything created through the
app on top of the seed — generating a draw, recording a result, finishing a game
on a court — gets a random UUID, and a namespace filter alone would have stranded
those rows and blocked the event deletes.
