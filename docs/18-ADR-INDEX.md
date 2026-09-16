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
- Initial rating for a brand-new/unrated player: the Initial Skill Rating questionnaire
  (content: `apps/web/server/domains/rating/data/question-bank.ts`; model:
  `apps/web/server/domains/rating/services/initial-rating.service.ts`,
  `INITIAL_RATING_ALGORITHM_VERSION = 2`, replacing the v1 7-of-31 random-draw average on
  2026-09-16). It is a *provisional* starting estimate, never presented as an official rating.
  - 20 fixed questions: 17 skill statements across 8 weighted dimensions
    (serve/return 10%, groundstrokes 10%, dinking 15%, third shot 15%, net game 15%,
    positioning 10%, strategy 15%, consistency 10%) plus 3 calibration questions
    (playing history, competitive experience, self-reported competitive level).
  - Every skill statement is answered on ONE frequency scale — Never / Rarely / Sometimes /
    Usually / Always — scored by statement tier directly on the rating scale: core
    (basic competence) 2.0 / 2.4 / 3.0 / 3.8 / 4.5, advanced 2.0 / 2.6 / 3.4 / 4.5 / 5.5.
    Each dimension carries one core statement and one advanced one, which is what separates
    the levels. Statements describe execution in a real game, never knowledge of a term.
  - Rating = weighted mean, then bounded by: execution cap `mean(consistency, strategy) + 0.5`;
    playing-history cap (3.0 / 3.5 / 4.5 / 5.5); competition cap (4.5 without organised play,
    5.0 with, 5.5 with open/regional medals or pro results, which also add +0.25 / +0.5 once
    the technical score is already ≥ 4.75); self-reported level blended at 15% when it agrees
    (±0.5), ignored and flagged when higher, blended at 25% when lower. Clamped to 2.0–5.5,
    rounded to 0.1.
  - Reliability (high / medium / low) from dimension spread, playing history, self-report
    agreement and competition; seeds `player_ratings.confidence_score` at 0.85 / 1.0 / 1.2
    (the variance parameter — 1.0 is the pre-existing default). UNCONFIRMED placeholder
    constants, same standing as the K-factor values below.
  - Every submission is stored in `rating_assessments` (064) with answers, dimension scores,
    flags and version, so the initial estimate stays distinguishable from the match-derived
    rating and can be re-scored. Transition to match evidence is the existing provisional
    K-factor schedule; nothing in the match algorithm changed.
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
Status: DECIDED 2026-09-14 — the organiser's record is the verification.

Decision: players do not submit results. A result is recorded by the event's
creator (`events.created_by_player_id`) from the event, and is `verified` the
moment it is written — the same rule the bracket path already applied. There
is no opponent confirmation round. `POST /api/v1/matches` refuses anyone but the
organiser with `ORGANIZER_ONLY`; `MatchService.recordOrganizerResult` stores the
row verified; `server/utils/settle-verified-match.ts` applies feed rows, the
rating move and notifications for both this path and the legacy decision path.

Co-organisers (061, 2026-09-14): the creator may appoint friends — duo partners
and accepted team-ups, nobody else — as co-organisers, at any time. A
co-organiser is an organiser for every purpose except owning the event: they
record results, edit, publish, start, complete, cancel, run brackets, courts and
the queue; they cannot delete it or change the co-organiser list. Enforced in
`EventRepository.isCoOrganizer` (read by every organiser check),
`EventCoOrganizerService` (creator-only + friend-only rules) and
`assertCanRunEvent`.

The interim implementation below remains in the code only for rows that were
submitted under the earlier rule and are still in flight (the decision, counter
and dispute endpoints and the match-page verification panel). No new row can
enter `submitted` or `pending_verification`. Remove it once those rows are
settled. Player disputes of an organiser's record are not designed; if wanted,
that is a new ADR.

Superseded interim implementation (MVP-005):
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
Status: PARTIALLY ACCEPTED (2026-08-25)

Context:
CLAUDE.md §7 lists "tournament rule variations" as a business decision that was
deliberately not finalised, and this ADR was reserved for it. Two parts of it had
to be settled to ship per-category formats (Liquibase 031-tournament-format),
because the code cannot draw a bracket without them. The rest stays FUTURE.

DECIDED — the format vocabulary.
Five formats, and only these five:

  round_robin                      Everyone plays everyone
  single_elimination               One loss and you're out
  double_elimination               Two losses and you're out
  round_robin_single_elimination   Group stage then knockout
  round_robin_double_elimination   Group stage then double-elim playoffs

`pool_play` was renamed to `round_robin_single_elimination`. It always was that;
the vague name only became actively misleading once the double-elim variant sat
beside it. The list lives in `apps/web/utils/tournament-formats.ts` and is
mirrored by a CHECK constraint on both `tournaments.format` and
`tournament_categories.format`.

King of the Court was considered and EXCLUDED. It cannot be pre-drawn as a fixed
bracket — who plays next depends on who just won — so it needs a progressive
generator that appends a match per recorded result. That is its own piece of
work, not a fifth entry in a switch statement.

DECIDED — format is a property of the CATEGORY, not the tournament.
`tournament_categories.format` is nullable, meaning "inherit from the
tournament", exactly as `match_type` does since 030. One weekend routinely runs
an open round robin alongside a 4.5 knockout, and those are two categories of one
event, not two events. `resolveFormat(category, tournament.format)` is the single
resolution point.

DECIDED — pool → playoff qualification.
The top TWO of every pool qualify, ranked by:
  1. wins, descending
  2. point difference, descending
  3. head-to-head, where the two actually met
  4. registration id, so the draw does not wander between renders

Pool winners are seeded ahead of every runner-up, which puts the two qualifiers
out of one pool on opposite halves of the playoff draw rather than meeting again
in the first round. `QUALIFIERS_PER_POOL` and the comparator are exported from
one place each (`utils/bracket-rounds.ts` and `bracket.service.ts`) so a
different rule replaces them without touching the generator.

This was a real gap, not a refinement: before it, a staged format generated its
playoff skeleton and nothing ever filled it — an organiser could play every pool
fixture and the knockout stayed a column of TBDs forever.

STILL OPEN:
- Losers-bracket ROUTING for both double-elimination formats. The draw is
  generated but not routed; correct loser placement depends on a round-by-round
  drop pattern the current generator only approximates, and a wrong route is
  worse than an empty one. Organisers place losers by hand today.
- Seeding method beyond rating-descending (no snake seeding, no protected seeds).
- Consolation/plate draws, third-place playoffs.
- Whether a bye should count toward standings (currently it does not — see
  `computeCategoryStandings`).
- Retirements and walkovers as distinct outcomes from an ordinary result.

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

---

## ADR-006: How the entry fee and the convenience fee settle

Status: **OPEN** — data model and quoting built; no money moves.

Context:
A player entering a tournament pays two things at once: the club's entry fee,
and the platform's convenience fee. The intent is that the entry fee goes
DIRECT to the organising club, through the club's own PayMongo link, and the
platform collects only its convenience fee into its own account. The platform
never holds club funds — holding them would make DinkAndLadder a money service
business, with the licensing that implies.

The unresolved question is how that lands mechanically. Two shapes are
possible and they are not equivalent:

1. **Two charges.** The payer is sent to the club's checkout for the entry fee,
   then to the platform's for the convenience fee. Works on any PayMongo
   account, needs no special onboarding, and is two checkout steps for the
   payer — with a real failure mode where the first succeeds and the second
   does not.
2. **One split charge.** A single payment is split at the provider between the
   club's account and the platform's. One step for the payer and no partial
   state, but it depends on PayMongo marketplace/split support being available
   on the account, which is a commercial arrangement rather than an API call.

This is a provider and commercial question, not a code one, so it is recorded
rather than guessed.

What has been built (034-platform-fees):
- `platform_fee_rules` — the ladder: percentage or fixed, banded on the base
  amount, with a floor and cap for percentages. Publicly readable so the
  registration screen can quote a total before a player commits.
- `club_payment_accounts` — the club's OWN public link reference. There is
  deliberately no column for a club secret: the platform never charges on the
  club's behalf, it only sends the payer there.
- `utils/convenience-fee.ts` — the maths, shared by the quote and by whatever
  eventually charges, so the fee a player is shown is the fee they are charged.
- A Super Admin console at `/admin/fees` with a live preview.

What has NOT been built:
No charge, no checkout session, no webhook handling. Both gateway webhooks
remain deliberate 501s (see ADR-004 above). The registration dialog quotes the
total and says plainly that online payment is not switched on and the organiser
will say how to pay.

Consequences:
Choosing shape 1 means a `payment_transactions` row per leg and a reconciliation
job for the half-paid case. Choosing shape 2 means onboarding every verified club
into the platform's PayMongo marketplace before they can collect at all, which
makes verification a hard gate on taking money rather than a soft one.

Secret keys stay in server environment variables (`nuxt.config.ts` runtime
config) and are never stored in the database, whichever shape is chosen: a
DB-stored secret is readable by anything holding the service-role key and ends
up in backups.

Decide before enabling payments. Do not let the quoting code imply either shape.

**Addendum (2026-09-15, planning only, not yet decided):** a third shape was put
on the table — DinkAndLadder collects the whole ₱520 into its own PayMongo
wallet, holds it, and disburses the organiser's share after the event completes
(refund on cancellation). It is the best player experience of the three and the
one PayMongo's own guidance sketched (Wallet + a `send_money` Workflow), but it is
*escrow*: the platform holds club funds, which this ADR's context said to avoid.
If chosen it must be recorded here as a conscious reversal, with the settlement-
lag, refund-fee and payout-destination-verification consequences written down.
Two-factor authentication (ADR-009) was built first as its precondition.


## ADR-009: Two-factor authentication is TOTP-only; a recovery code is a reset

Status: **DECIDED** (2026-09-15) — implemented; see `/docs/15-AUTHENTICATION-SPECIFICATION.md`.

Context:
The payment design puts money movement behind the SuperAdmin (approving payouts)
and club owners (setting where payouts go). Both needed more than a password.

Decisions:
1. **Authenticator app (TOTP) only.** No SMS: it costs money on Supabase, needs a
   phone number we otherwise never collect, and is defeated by SIM swap — the
   attack a second factor exists to stop. No email codes: email is what resets
   the password, so it would be one factor twice.
2. **A recovery code is a self-service reset, not a login.** Supabase has no
   recovery codes and nothing but a real factor can raise a session to `aal2`.
   Rather than build a parallel verifier, presenting a code (with the password)
   deletes every factor and the owner re-enrols. Same power as "turn 2FA off",
   so: hashed, shown once, single-use, behind Turnstile, one generic error.
3. **Enforcement is server-side, per request.** A redirect is not a control;
   `server/middleware/mfa-gate.ts` refuses the API to an `aal1` session on an
   enrolled account, and to any session on `/api/v1/admin/**`.
4. **Mandatory for the SuperAdmin now; for paying club owners when the payout
   form exists.** Optional for everyone else. `MfaService.status().required` is
   the single policy point.
5. **Session-level assurance for v1.** The code at sign-in makes the whole
   session `aal2`. Re-prompting for money actions within a session is deferred:
   Supabase's `currentAuthenticationMethods` carries per-method timestamps, so
   a "verified within N minutes" step-up is buildable when the payout endpoints
   are, without a schema change.

Consequences:
- `users.mfa_enrolled_at` is denormalised from Supabase and re-synced at every
  sign-in; the gate reads it via a 30-second per-user memo that the writers
  invalidate. Across instances, enrolling can lag up to 30 s for *other*
  instances (fails open for the person who just signed in with the password
  moments ago); unenrolling can only make the gate stricter (fails safe).
- The enrolment verify runs in the browser, not the server, because the
  session being upgraded lives in the browser's cookies. The server confirms
  from Supabase's factor list, never from the client.
- The e2e suite plays the authenticator (`tests/e2e/helpers/totp.ts`, pinned to
  the RFC vectors) and runs the MFA journey in its own Playwright project after
  every other authed spec, because an enrolled test account refuses `aal1`.


## ADR-010: Achievement placement rules — OPEN

Status: **OPEN**. Two seeded achievements were retired in
`065-achievement-integrity` rather than guessed at, because neither has an
evaluable source in this schema and inventing one would mean a badge that claims
a result the product never determined.

- **`tournament_third` ("Third Place").** Single elimination produces two losing
  semi-finalists and no ordering between them. Awarding third place requires a
  consolation-match rule, which is part of the unfinalised tournament rule
  variations (CLAUDE.md §7). First and second ARE derived — from the highest
  bracket round's `winner_registration_id` and the other side of that match —
  so only third is blocked.
- **`open_play_leader` ("Open Play Leader").** Open play records scores but
  publishes no final standing; there is no standings table and no defined
  tiebreak.

Decision deferred. Both definitions are `is_active = false`, which removes them
from the gallery and the evaluator without touching `player_achievements`
history. Reactivating is one `UPDATE` plus a rule in
`achievement-requirements.ts`; the evaluator reports any active definition with
no rule behind it (`unmappedKeys`), surfaced on the SuperAdmin recalculation
panel, so a definition can never again be added without the code that grants it
and go unnoticed.

Consequences:
- The executable rule lives in `achievement-requirements.ts`, not in the
  `achievement_definitions.criteria` jsonb. That column is the human-readable
  record of intent; three of its rows use shapes no evaluator could execute, and
  interpreting it would silently award nothing for the rows it failed to parse.
- `multi_champion` (win 5 tournaments) is live and reads the same derived
  first-place count, so it inherits whatever the final bracket says.


## ADR Rule

Do not silently turn an OPEN ADR into an assumed permanent business rule.

Once decided, update:
- ADR
- relevant specification
- implementation backlog
- tests
