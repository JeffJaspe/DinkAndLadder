# Match Verification Specification

## Goal

Only eligible match results should affect player ratings and rankings.

## Match Lifecycle

Suggested lifecycle:

DRAFT
→ SUBMITTED
→ PENDING_VERIFICATION
→ VERIFIED
or
→ REJECTED
or
→ DISPUTED

Exact dispute resolution rules can evolve, but lifecycle state must prevent ratings from being applied to unverified matches.

## Submission

A match submission includes:
- match type,
- participants,
- team assignments,
- scores,
- played date/time,
- venue/event if applicable.

## Verification

Participants or designated authorized verifiers confirm the result.

A verification record records:
- verifier,
- decision,
- response timestamp,
- optional note.

## Rating Trigger

Rating calculation is triggered only when the match reaches the defined eligible state.

Rating application must be idempotent.

The same match must never apply a rating change twice.

## Disputes

A disputed result must not silently affect rankings.

Corrections must be auditable.

## Security

Only authorized participants/admins can perform verification decisions.

Club administration must not automatically imply authority to fabricate player results.
