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

**BLOCKED sub-item**: initial/unrated-player self-assessment questionnaire (content + answer-to-starting-rating scoring formula) is pending from the user — do not draft placeholder content, wait for the real question set. See ADR-001.

## MVP-007 Rankings
Deliver:
- ranking query/service
- ranking API
- ranking UI
- eligibility rules
- tests

---

# Phase 2

- Events
- Tournament registration
- Brackets
- Notifications
- Player search
- Club discovery

# Phase 3

- Social relationships
- Activity feed
- Achievements
- Club announcements

# Phase 4

- Payments
- Subscriptions
- Sponsorships

# Phase 5

- Analytics
- Reporting
- Historical trend dashboards

# Phase 6

- Push optimization
- Offline synchronization
- QR check-in
- mobile-first workflows

# Phase 7

- Provincial/regional/national ranking expansion

# Phase 8

- Federation integration

# Phase 9

- Public API
- API keys
- Webhooks

# Phase 10

- Multi-tenancy
- Advanced auditing
- Data warehouse/BI integration
