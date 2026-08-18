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
