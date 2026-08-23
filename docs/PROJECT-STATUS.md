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
