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
  questionnaire (implemented in `apps/web/server/domains/rating/data/question-bank.ts`).
  - Question selection: 1 Experience, 3 Skill, 1 Strategy, 1 Competition, 1 Self-Assessment
    (7 total, randomly selected from a bank of 31 questions per the user-provided spec).
  - Scoring: points per answer (1-6), normalized to a 2.0-6.0 rating range.
  - Tiers: Beginner (2.0-2.49), Novice (2.5-2.99), Intermediate (3.0-3.49), Advanced (3.5-3.99),
    Skilled (4.0-4.49), Expert (4.5-4.99), Pro (5.0-5.49), Elite (5.5-5.99), Champion (6.0+).
  - Both singles and doubles ratings initialized to the same questionnaire result.

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

Interim implementation (MVP-007, not a final decision — revisit here first if it changes): a
player appears in a rating type's ranking if they have a non-null `player_ratings.rating_value`
for that type AND their `player_profiles.profile_visibility` is `'public'` — the latter isn't a
new ranking-specific rule, it's the same public/private contract every other public-facing
surface (player profile pages, MVP-002) already respects. See `RankingService` in
`apps/web/server/domains/rating/services/ranking.service.ts`.

None of `/docs/16-RANKINGS-SPECIFICATION.md`'s required Eligibility decisions are implemented —
still open, not filtered on, and not to be invented:
- Minimum matches played.
- Provisional-rating treatment (a provisional player currently ranks the same as an established
  one).
- Inactive-player handling (no time-since-last-match cutoff).
- Verification requirement beyond what already gates `rating_value` existing (a rating only
  exists because a match reached `verified` — see ADR-002 — but there's no additional
  ranking-specific verification rule).
- Dispute handling (no special-cases a disputed/rejected match differently from one that was
  never submitted).
- Time window (rankings are the live current state, not a windowed/seasonal view).

`RankingQuery` (the service's query options) is intentionally structured to make adding these
filters later straightforward — a new optional field, not a redesign.

ADR-004 — Tournament/Bracket Rules
Status: FUTURE

ADR-005 — Out-of-MVP Surface Is Quarantined, Not Hardened
Status: ACCEPTED (2026-08-22)

Context:
A full-codebase audit found 37 defects. Nine of them — forgeable webhook secrets,
payment events silently discarded, a test-mode signature accepted in place of a
live one, a public API that 401s on every request, unenforced API-key scopes —
were all in the Payments and Public API surface. `/docs/03-MVP-SCOPE.md` lists
both under "Explicitly Out of MVP", and CLAUDE.md §6 forbids implementing them
before the backlog promotes them.

Decision:
Remove the out-of-scope surface rather than harden it.
- Stripe and PayMongo webhook handlers return 501. They previously returned 200
  after logging, so providers marked events delivered and never retried; 501
  keeps events queued upstream until the domain is actually built.
- `/api/public/**`, the API-key middleware, and the api-keys and webhooks
  endpoints are deleted.
- `apikey.service.ts` and `apikey.repository.ts` are KEPT, unwired. They are the
  correct implementation (randomBytes secrets, ownership checks, DTO mapping).
  The insecure duplicate in `webhook.service.ts` — which is what the endpoints
  actually imported — is the one that was deleted.
- No tables were dropped. `api_keys`, `webhook_subscriptions`,
  `webhook_deliveries` and the 013-payment tables remain, unused and
  RLS-protected, per CLAUDE.md §3 on avoiding destructive migrations.

Consequences:
Promoting Payments or the Public API means writing the handlers against the
retained domain code — not restoring the deleted endpoints. Note that
`webhook_deliveries` does not have the `status`, `attempts` or `response_code`
columns the deleted code assumed; it has `status_code`. Any future delivery
logging needs a forward-only changeset first.

Do not re-add these endpoints without a backlog item that promotes them.

## ADR Rule

Do not silently turn an OPEN ADR into an assumed permanent business rule.

Once decided, update:
- ADR
- relevant specification
- implementation backlog
- tests
