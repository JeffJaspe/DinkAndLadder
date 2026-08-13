# DinkAndLadder Master Plan

## 1. Purpose

This plan captures the agreed direction for DinkAndLadder and is intended to transfer project context to Claude Code.

DinkAndLadder is a real-world Philippine pickleball platform intended to serve web and mobile clients. The product must be maintainable, testable, auditable, and portable between PostgreSQL hosting providers.

---

## 2. Agreed Architecture Direction

### Application Style
Start as a modular monolith.

Do not prematurely split into microservices.

The code must be organized into domain boundaries so individual domains can later be extracted into independent services if scale justifies it.

### Backend Layering

Database
→ DTOs
→ Repositories
→ Services
→ Controllers
→ UI

Testing, security, and DevOps apply across all layers.

### Database Strategy

PostgreSQL-first.

Supabase is the initial platform/provider.

Liquibase is the source of truth for schema changes.

The project must remain portable to PostgreSQL infrastructure such as AWS RDS and AWS Aurora.

---

## 3. Why Liquibase

Liquibase was selected because schema changes need to be:

- version controlled,
- reviewable,
- repeatable,
- CI/CD friendly,
- portable across PostgreSQL hosts.

The Supabase dashboard is not the primary schema management mechanism.

---

## 4. Web and Mobile Direction

The same backend contracts must support:

- Nuxt 3 web client
- planned Flutter mobile client

API responses must therefore be explicit, stable, versionable, and DTO-based.

Do not expose internal database models directly.

---

## 5. Core Domains

### Identity
Authentication, OAuth accounts, devices, identity status.

### Player
Player profile, ratings view, statistics, preferences, privacy.

### Club
Clubs, memberships, roles, invitations.

### Match
Match lifecycle, participants, scores, verification.

### Rating
Rating calculation, rating history, ranking data.

### Event
Events, registrations, brackets, competition workflows.

### Notification
In-app notifications and delivery records.

---

## 6. Product Direction

The long-term platform can grow into:

- community features,
- tournaments,
- subscriptions,
- analytics,
- national rankings,
- federation integration,
- public API,
- enterprise-scale capabilities.

The MVP is deliberately narrower.

---

## 7. Strict Development Sequence

### Phase 0
Architecture and project foundation.

### Phase 1
MVP.

### Phase 2
Competitive play.

### Phase 3
Community.

### Phase 4
Monetization.

### Phase 5
Analytics.

### Phase 6
Mobile expansion.

### Phase 7
National rankings.

### Phase 8
Federation integration.

### Phase 9
Public ecosystem/API.

### Phase 10
Enterprise-scale capabilities.

---

## 8. Feature Build Sequence

For every feature:

1. Database/Liquibase
2. DTOs
3. Repositories
4. Services
5. Controllers
6. Web UI
7. Tests
8. Security review
9. DevOps review

This sequence is part of the project rules.

---

## 9. Quality Expectations

Production-oriented standards apply from the beginning:

- explicit domain boundaries,
- automated tests,
- secure data access,
- versioned migrations,
- auditability,
- deterministic business logic,
- mobile-compatible APIs.

---

## 10. Current Product Decisions

The following decisions are established:

- PostgreSQL is the database foundation.
- Supabase is the initial platform.
- Liquibase owns schema evolution.
- Web is Nuxt 3/Vue 3/TypeScript/Tailwind.
- Mobile is planned with Flutter.
- Modular monolith first.
- DTOs are mandatory.
- Repositories are mandatory.
- Controllers are thin.
- Services own business logic.
- Vitest and Playwright are part of the standard.
- National rankings are a future roadmap feature, not MVP.
- Player Profile Management is core product scope.

---

## 11. Decision Discipline

When a requirement is not documented:

1. Check all `/docs` specifications.
2. Check existing code and ADRs.
3. Prefer the smallest design consistent with the architecture.
4. If the choice affects product behavior materially, create an ADR instead of silently inventing a rule.
