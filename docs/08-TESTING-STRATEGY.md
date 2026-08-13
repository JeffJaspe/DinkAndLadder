# Testing Strategy

## Goals

Testing must protect:
- rating correctness,
- match integrity,
- authorization,
- database integrity,
- critical user journeys.

## Unit Tests

Use Vitest.

Focus on:
- services,
- validation,
- mappers,
- pure utility functions,
- rating engine.

Highest coverage priority:
- Rating Domain
- Match Domain
- Authorization rules

## Integration Tests

Use a controlled PostgreSQL/Supabase test environment or equivalent integration database strategy.

Test:
- repositories,
- transaction/workflow behavior,
- RLS-sensitive operations,
- match → verification → rating flow.

## Component Tests

Use Vue Test Utils / Testing Library where behavior is worth isolating.

## Playwright

Critical journeys:
1. Registration/login
2. Create profile
3. Create club
4. Request/join club
5. Submit match
6. Verify match
7. View updated rating/ranking

## Test Data

Use deterministic fixtures.

Never depend on manually created production data.

## Definition of Done

A feature is not complete when only the happy-path unit test passes. Negative cases, authorization failures, invalid states, and persistence behavior must be covered.
