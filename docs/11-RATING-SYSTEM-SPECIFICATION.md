# Rating System Specification

## Status

Business algorithm is NOT YET LOCKED.

This is intentional.

## What Is Locked

The system must support:
- current rating,
- rating history,
- rating transactions,
- rating type/category,
- provisional/confidence state,
- calculation versioning,
- match linkage.

## Rating Interface

The RatingService should expose a domain-level contract similar to:

- calculateMatchRating(...)
- applyRatingResult(...)
- getCurrentRating(...)
- getRatingHistory(...)

The implementation must be isolated so the algorithm can be replaced without rewriting Match or Ranking domains.

## Rating Types

At minimum, the schema should support distinct rating categories so singles and doubles can evolve independently.

Exact production categories require final product decision.

## Provisional Players

The system should distinguish:
- established rating,
- provisional rating,
- confidence level.

Do not invent a numeric confidence formula.

## Historical Integrity

Every applied rating change must create an immutable rating transaction linked to the source match when applicable.

Never mutate historical transactions to “fix” the past. Corrections should create compensating/corrective records.

## Algorithm Decision Gate

Before MVP rating calculations are released:
- compare candidate models,
- choose algorithm,
- define constants,
- define doubles treatment,
- define provisional behavior,
- define upset behavior,
- define no-show/withdrawal handling,
- define invalid/disputed match behavior.

Record decision in an ADR.

Until that ADR exists, Claude should implement the architecture, storage, interfaces, fixtures, and tests for deterministic examples, but must not invent a production algorithm.
