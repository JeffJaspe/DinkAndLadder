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
