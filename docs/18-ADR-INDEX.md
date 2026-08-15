# Architecture Decision Records

Create an ADR whenever a material product/architecture decision is unresolved.

## Required Early ADRs

ADR-001 — Final Rating Algorithm
Status: OPEN

ADR-002 — Match Verification Authority
Status: OPEN

Interim implementation (MVP-005, not a final decision — revisit here first if it changes):
required verifiers are every match participant except the one who submitted the match, no
distinction between teammate and opponent. A match becomes `verified` only once every required
verifier has independently `confirmed`; a single `rejected` or `disputed` decision immediately
finalizes the match into that state instead (fail-fast, does not wait for remaining responses).
See `resolveMatchStatus` in `apps/web/server/domains/match/services/match.service.ts`.

ADR-003 — Ranking Eligibility Rules
Status: OPEN

ADR-004 — Tournament/Bracket Rules
Status: FUTURE

## ADR Rule

Do not silently turn an OPEN ADR into an assumed permanent business rule.

Once decided, update:
- ADR
- relevant specification
- implementation backlog
- tests
