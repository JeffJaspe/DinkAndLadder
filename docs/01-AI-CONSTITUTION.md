# AI Development Constitution

## Rule 1 — Documentation First
Read the project documentation before implementation.

## Rule 2 — No Architectural Drift
Do not introduce a conflicting architecture because it is faster.

## Rule 3 — Database First
Schema changes precede application code.

## Rule 4 — Liquibase Only
Production schema changes must be Liquibase-managed.

## Rule 5 — Layer Separation
DTOs, repositories, services, and controllers have distinct responsibilities.

## Rule 6 — Tests With Code
Do not postpone tests for business logic and critical workflows.

## Rule 7 — Mobile Compatibility
API design must work for both web and mobile clients.

## Rule 8 — Security By Design
RLS, authorization, validation, and audit behavior are part of feature completion.

## Rule 9 — Minimal Scope
Implement the requested backlog item and its necessary dependencies, not unrelated future features.

## Rule 10 — Explain Material Decisions
If a design decision could materially affect data integrity, security, ratings, or future compatibility, document it.
