# Architecture Decision Records

Create an ADR whenever a material product/architecture decision is unresolved.

## Required Early ADRs

ADR-001 — Final Rating Algorithm
Status: OPEN

Decided so far (not final until the remaining open items below are resolved):
- Base model: DUPR-inspired logistic expected-point-share, per-team average rating,
  variance-weighted delta distribution across doubles teammates (candidate formula supplied
  by the user, math-reviewed before adoption).
- Logistic scaling constant `s = 0.8305` (verified: a 0.50 rating-gap predicts exactly an 80%
  expected point share).
- No-show / withdrawal: the match is voided outright — zero rating impact for every
  participant, as if it never happened. (Exact mechanism for flagging a no-show in the Match
  Verification workflow is not yet designed — see MVP-005/MVP-006 boundary.)
- Initial rating for a brand-new/unrated player: determined via a self-assessment
  questionnaire, not a flat default. Question content and the answer-to-rating scoring formula
  are pending from the user — see the BLOCKED sub-item under MVP-006 in
  `docs/10-IMPLEMENTATION-BACKLOG.md`. Do not invent placeholder questions/scoring.

Interim implementation (MVP-006, not a final decision — revisit here first if it changes): see
`kFactorFor`/`distributeTeamDelta` in `apps/web/server/domains/rating/services/rating.service.ts`.
- K-factor and the confidence-weighted delta split both apply (compounding effect) — a newer,
  less-confident teammate absorbs proportionally more of the team's share of a match delta, on
  top of their own individually higher K-factor.
- Singles is the degenerate one-player-per-team case of the same doubles formula (team size 1,
  weight trivially 1) — no separate singles formula was written.
- Separate ratings per match format: `player_ratings`/`rating_transactions` are keyed on
  `(player_id, rating_type)`, `rating_type` is `'singles' | 'doubles'` — one player has up to two
  independent ratings, not a single universal one.
- "Matches played" counts only matches that reach `verified` (ADR-002's finalization state) —
  `applyMatchResult` is only ever invoked from the verification-decision endpoint when a decision
  finalizes a match to `verified`, never from submission or a non-`verified` outcome.

**UNCONFIRMED — invented placeholder constants, need real sign-off** (per
`/docs/11-RATING-SYSTEM-SPECIFICATION.md`'s "do not invent a numeric confidence formula" —
unlike `RATING_SCALE_S` above, these were NOT supplied or reviewed by the user; confirmed with
the user on 2026-08-16 that they were invented as placeholders in an earlier pass):
- `PROVISIONAL_MATCHES_THRESHOLD = 5`, `ESTABLISHED_MATCHES_THRESHOLD = 20` (the provisional →
  established transition window).
- `K_PROVISIONAL = 0.25`, `K_ESTABLISHED = 0.05` (how fast a rating moves per match).
- `CONFIDENCE_PROVISIONAL_DEFAULT = 1.0`, `CONFIDENCE_DECAY_FACTOR = 0.95`,
  `CONFIDENCE_FLOOR = 0.1` (the confidence/variance decay curve).
- `RECENCY_HALF_LIFE_DAYS = 180` (currently near-inert in practice — matches are rated
  immediately after verification — but still an invented number, not a reviewed one).

Do not treat these as decided. Get real values from the user before calling MVP-006's algorithm
locked; until then they're clearly-named exported constants (not buried literals) specifically
so they're cheap to replace without touching the calculation logic itself.

Still open:
- The specific placeholder constants immediately above.
- Everything else in this ADR not yet finalized is a concrete interim structural choice made so
  implementation could proceed, not an invented permanent business rule.

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
