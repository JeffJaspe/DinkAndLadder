# Testing Structure

Layout follows `/docs/08-TESTING-STRATEGY.md`.

- `unit/` — Vitest tests for services, validation, mappers, and the rating engine.
- `integration/` — repository, transaction/workflow, and RLS-sensitive tests against a controlled PostgreSQL/Supabase test environment.
- `e2e/` — Playwright coverage for critical user journeys (registration/login, profile, club, match submission, verification, rankings).

Test runner configuration (Vitest, Playwright) is added in P0-003 Core Tooling. This structure is scaffolding only.
