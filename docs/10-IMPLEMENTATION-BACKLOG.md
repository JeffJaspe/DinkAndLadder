# Implementation Backlog

## Execution Rule

Complete tasks in order unless a dependency or documented ADR changes the order.

---

# Phase 0 — Foundation

### P0-001 Project Repository Bootstrap
Create:
- web app structure
- mobile project placeholder if not yet initialized
- shared documentation structure
- testing structure

### P0-002 Liquibase Bootstrap
Create:
- Liquibase configuration
- master changelog
- domain migration folders
- local development connection strategy

### P0-003 Core Tooling
Configure:
- TypeScript
- lint
- formatting
- Vitest
- Playwright

### P0-004 CI Skeleton
Configure validation pipeline.

---

# Phase 1 — MVP

## MVP-001 Authentication
Deliver:
- auth integration
- user profile provisioning
- session handling
- authenticated API calls
- login/register UI
- tests

## MVP-002 Player Profiles
Deliver:
- player profile schema
- DTOs
- repositories
- services
- controllers/API
- profile UI
- privacy foundation
- tests

## MVP-003 Club Management
Deliver:
- clubs
- memberships
- roles
- create/view/join/admin flows
- tests

## MVP-004 Match Submission
Deliver:
- match entities
- participants
- teams
- scores
- submission workflow
- tests

## MVP-005 Match Verification
Deliver:
- verification workflow
- decision state
- rejection/dispute foundation
- audit events
- tests

## MVP-006 Rating Engine
Deliver:
- rating abstraction
- current ratings
- rating transactions
- calculation versioning
- production algorithm only after ADR finalization
- exhaustive unit tests

**COMPLETED sub-item**: initial/unrated-player self-assessment questionnaire implemented with user-provided question bank (31 questions across 5 categories: Experience, Skill, Strategy, Competition, Self-Assessment). See `apps/web/server/domains/rating/data/question-bank.ts` and ADR-001.

## MVP-007 Rankings
Deliver:
- ranking query/service
- ranking API
- ranking UI
- eligibility rules
- tests

---

# Phase 2 ✓ COMPLETE

- ✓ Events — `006-event.changelog.xml`, `apps/web/server/domains/event/`
- ✓ Tournament registration — `tournament_registrations` table, register/withdraw endpoints
- ✓ Brackets — `bracket_matches` table, single elimination bracket generation
- ✓ Notifications — `007-notification.changelog.xml`, `apps/web/server/domains/notification/`
- ✓ Player search — `GET /api/v1/players/search`
- ✓ Club discovery — `GET /api/v1/clubs/search`

# Phase 3 ✓ COMPLETE

- ✓ Social relationships — `009-social.changelog.xml`, follow/block endpoints
- ✓ Activity feed — `010-activity.changelog.xml`, personalized feed
- ✓ Achievements — `011-achievement.changelog.xml`, 16 seed achievements
- ✓ Club announcements — `012-announcement.changelog.xml`, draft/publish/archive workflow

# Phase 4 — FOUNDATION COMPLETE

- ✓ Payments domain (database, DTOs, repositories, services)
- ✓ Subscription plans + feature gating
- ✓ Sponsorships domain

**Live payments deferred** — Stripe + GCash integration is priority AFTER full app flow is working. Payment providers are free to set up when ready.

# Phase 5 ✓ COMPLETE

- ✓ Analytics — `014-analytics.changelog.xml`, player/club/platform stats
- ✓ Reporting — stats endpoints with aggregated data
- ✓ Historical trend dashboards — rating history endpoint

# Phase 6 — DEFERRED (Mobile)

Requires Flutter mobile app:
- Push optimization
- Offline synchronization
- QR check-in
- mobile-first workflows

# Phase 7 ✓ COMPLETE

- ✓ Provincial/regional/national ranking expansion — `015-regions.changelog.xml`, PH regions + provinces

# Phase 8 — DEFERRED

- Federation integration (requires external federation API specifications)

# Phase 9 ✓ COMPLETE

- ✓ Public API — `016-api-keys.changelog.xml`, API key management, public endpoints
- ✓ API keys — SHA-256 hashed keys, rate limits, permissions
- ✓ Webhooks — subscription management, delivery tracking

# Phase 10 — LATER

- Multi-tenancy
- Advanced auditing
- Data warehouse/BI integration

---

# Current Sprint — Event-Centric Match System

## Priority Order

### 1. Match & Event System Enhancement
Per `docs/31-MATCH-EVENT-SYSTEM-SPECIFICATION.md`:
- [x] Database: Enhance events table (event_type, queue settings)
- [x] Database: Add event_registrations table
- [x] Database: Link matches to events (event_id required)
- [x] Database: Add event_queue and event_courts tables
- [x] Database: Update RLS policies for visibility rules
- [x] API: Event registration endpoints (register/check-in/withdraw/list)
- [x] API: Event content endpoints (matches, players/registrations)
- [x] API: Event rankings endpoint — event-scoped wins/losses/matches-played leaderboard from
      verified matches only; deliberately excludes rating change (rating_transactions is
      "select own" RLS, no documented reason to bypass it for a shared leaderboard)
- [x] API: Match agreement flow — reuses the existing MVP-005 confirm/reject/dispute
      verifier flow (`/matches/{id}/verification*`) for agree/dispute; counter-proposal is
      scoped to singles matches only and moves the match straight to `disputed` for
      organizer review rather than a multi-round negotiation loop (see the scoping note on
      `MatchService.proposeCounterScore` — full turn-based negotiation is blocked on the
      unresolved "exact match verification policy" decision, CLAUDE.md section 7)
- [x] API: Queue endpoints (join/leave/match/skip)
- [x] UI: Event page tabs (Info, Matches, Players, Rankings, Queue)
- [x] UI: Match agreement flow (existing Confirm/Reject/Dispute on match detail page)
- [x] UI: Score counter-proposal ("Propose Different Score" on match detail page, singles only)

### 2. Dashboard Wiring
Per `docs/32-DASHBOARD-SPECIFICATION.md`:
- [x] Remove podium from player dashboard
- [x] Wire player rank position (top-100 lookup in the player's own province; shows "Unranked"
      if not found rather than fabricating a position)
- [x] Wire rating chart to real data (`players/me/rating-history`)
- [x] Add "My Recent Matches" section (new `players/me/matches` endpoint)
- [x] Add "Pending Actions" section (pending match verifications + the player's own pending
      club join requests — no invite-to-club feature exists in this codebase, so this reports
      real pending state rather than inventing "invitations")
- [x] Add "My Upcoming Events" section (new `players/me/upcoming-events` endpoint)
- [x] Wire club dashboard podium (top members) — new `clubs/{id}/rankings` endpoint
- [x] Add club matches section — new `clubs/{id}/matches` endpoint
- [x] Add club events (previous + upcoming) — reuses the existing public events search endpoint

### 3. Dummy Data Seeding
- [ ] Seed test players (10-20)
- [ ] Seed test clubs (2-3)
- [ ] Seed test events (5-10)
- [ ] Seed test matches with ratings
- [ ] Seed rankings data

### 4. Production Cleanup (Later)
- [ ] Wipe all test data
- [ ] Fresh production start

---

## Audit Follow-ups (deferred from the 2026-08-22 remediation pass)

A full-codebase audit produced 37 findings. The 6 critical and 13 high ones were
fixed in that pass (see PROJECT-STATUS.md "Phase 9"). These 18 were deliberately
deferred — none block the MVP. IDs match the audit report.

### Promote next
- [ ] **F-34 — Testing gap.** `tests/integration/` is empty (`vitest.config.ts`
      is already wired to run it). Seven services have no unit test: analytics,
      badge, partnership, sponsorship, platform-admin, shoutout, webhook. The
      seven e2e specs total ~160 lines and only assert signed-out redirects and
      401s — no authenticated journey is covered. **Every Correctness finding in
      that pass would have been caught by an integration test**, and CLAUDE.md's
      Definition of Done already requires them.
- [x] **Lint is red on `main`.** DONE (2026-08-22) — 66 → 0 errors. `pnpm --filter web run lint` fails with 66
      pre-existing errors (mostly `no-explicit-any` and unused vars in specs).
      CI runs lint, so the pipeline cannot go green until this is cleared.
      Confirmed pre-existing, not introduced by the remediation pass.

### Correctness
- [x] F-22 — DONE (2026-08-22): winners now advance (single elim + double-elim winners side); first-round byes propagate at generation; winner validated as a participant; 7 new tests. Losers-bracket routing still open — see below. Original note:  Bracket winners never advance. `updateBracketMatch` writes the
      winner but nothing populates the next round, so tournaments stall after
      round one.
- [ ] F-23 — `confirmedRegs` in `bracket.service.ts` also includes `pending`
      registrations. Decide the rule, then make the name match it. The adjacent
      category filter also treats `undefined` and `null` differently from
      `deleteByTournamentId`.
- [x] F-24 — DONE (2026-08-22): reads created_at from auth.users via the Admin API instead of JWT claims, degrading gracefully. Original note:  `/api/v1/me/auth-info` returns `created_at: undefined`.
      `serverSupabaseUser` returns JWT claims, which have no `created_at`.
      Either drop the field or read it from the `users` table.
- [ ] F-25 — Verification roll-up race. `recordVerificationDecision` recomputes
      match status from an in-memory snapshot, so two simultaneous confirmations
      can leave a match `pending_verification` — and it never gets rated.
- [ ] F-26 — `highest_singles_rating` / `highest_doubles_rating` return the
      *current* rating. Compute from `rating_transactions`.
- [ ] F-27 — Feed params unvalidated: `types` is cast without a membership
      check, a malformed `since` 500s instead of 400ing, `offset` accepts
      negatives, and `getCirclePlayerIds` builds an unbounded `.in()` that will
      eventually exceed the request URL limit.
- [x] F-28 — DONE (2026-08-22): the query is skipped for a memberless club instead of sending 'none'; the error is now checked. Original note:  `getClubStats` sends the literal `'none'` where a uuid is expected
      when a club has no members; the error is swallowed. Skip the query instead.
- [ ] F-29 — `events_select_public` uses `status != 'draft'`, which is NULL-unsafe.
      Use `IS DISTINCT FROM` (forward-only changeset).
- [x] F-32 — DONE (2026-08-22): get_club_match_stats is now called; tournaments_hosted counted via events; member_growth_rate computed. Original note:  `getClubStats` hardcodes `matches_this_month`, `tournaments_hosted`
      and `member_growth_rate` to 0, and `active_members` duplicates
      `total_members`. Cheap win: `get_club_match_stats` already exists in
      `014-analytics.changelog.xml` and is currently unused.

### Security (low severity)
- [ ] F-11 — `getRequestIP` is called without `{ xForwardedFor: true }`, so
      Turnstile receives the proxy's IP. Decide based on the deploy topology —
      trusting the header when not behind a proxy makes it spoofable.
- [x] F-12 — DONE (2026-08-22): shared escapeLikePattern in server/domains/shared, applied to player and club search, 5 tests. Original note:  `%` and `_` are not escaped before reaching `ilike` in the player
      and club search repositories.

### Hygiene
- [ ] F-31 — Onboarding validates `account_type` and then ignores it (no column
      backs it). Either persist the choice or drop the parameter.
- [ ] F-33 — `components/EmptyState.vue` and `components/ui/EmptyState.vue` are
      two different unused implementations. `PlatformStatsDto` is now unreferenced
      after the platform endpoint was deleted.
- [ ] F-35 — Three error conventions coexist. Remaining raw `createError` callers
      return a body the app-wide `fetchError.data?.message` convention cannot read.
- [ ] F-36 — `serverSupabaseUser`'s result is named `claims` in most handlers and
      `user` in others. The `user` naming is what invited F-24.
- [x] F-37 — DONE (2026-08-22): all 52 `no-explicit-any` and 12 unused vars cleared; PSGC console.logs removed; shared `utils/api-error-message.ts` and typed Supabase join rows introduced. Original note:  `catch (e: any)` and `data: any[]` across pages despite
      `typescript.strict`; concentrated in `pages/events/[eventId]/index.vue`.
- [ ] Nuxt config drift: `@nuxtjs/supabase` warns that
      `~/types/database.types.ts` is missing, so `Database = unknown` and no
      query is type-checked against the real schema. Generating it would have
      caught F-17 (`follower_id` is not a column) at compile time.

### Opened by the 2026-08-22 follow-up pass

- [ ] **Double-elimination losers-bracket routing.** F-22 implemented advancement
      for single elimination and the winners side of double elimination. Losers
      are still not routed: correct placement depends on the round-by-round drop
      pattern, and the current generator only approximates the losers structure
      (`Math.max(1, matchesInRound)` in `generateDoubleEliminationBracket`).
      A wrong route is worse than an empty one, so it was left explicit rather
      than guessed. Fixing it means designing the losers bracket properly first.
- [ ] **Pool-play playoff seeding.** Pool rounds and playoff rounds are both
      generated, but nothing computes pool standings or seeds the playoff from
      them, so playoff slots stay empty. Same shape of gap F-22 closed for
      knockout.
- [ ] **Bracket cards show registration ids, not names.** `BracketMatchCard`
      renders `registration_id.slice(0, 8)` because the bracket endpoint does not
      join player names. Needs the join, then the card can show real names.

### Opened by the 2026-08-23 UI pass

- [ ] **Public index routes redirect to login while their data is public.**
      `/events` sends a signed-out visitor to `/login`, but `/events/:id` renders
      fine and `GET /api/v1/events` returns the same data unauthenticated. The
      landing page advertises "Browse everything free — sign up to compete", so
      the redirect contradicts both the API and the stated product intent.

      Cause: the globs in `supabase.redirectOptions.exclude` (`nuxt.config.ts`)
      are `/events/*`, `/players/*`, `/clubs/*` — and a trailing `/*` does not
      match the bare index route. So the *detail* pages are public and the
      *list* pages are not.

      Affected: `/events`, `/players`, `/clubs`. Confirmed by loading `/events`
      signed out: HTTP 200, final URL `/login`.

      Fix is to add the bare paths to the exclude list. Nothing is protected by
      the current behaviour — the endpoints those pages call are already public,
      and RLS is the real boundary — so this is an oversight rather than a
      security control. It was left alone because changing auth configuration is
      a product decision, not a styling one.

      Worth checking the whole exclude list at the same time for the same
      trailing-glob mistake, and worth an E2E test asserting each intended-public
      route renders signed out, so the next addition cannot regress silently.

      Side effect while it stands: the events list cannot be verified in a
      headless browser, so the capacity bar added on 2026-08-23 is covered by
      unit tests and a live API check rather than a screenshot.
