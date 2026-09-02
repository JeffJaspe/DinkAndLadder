# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

<!-- Placed at the repo root, not in apps/web, so the planned apps/mobile Flutter
     client inherits the same product truth. apps/mobile is a README placeholder
     today (Flutter deferred to Phase 6 per docs/10-IMPLEMENTATION-BACKLOG.md),
     so `web` is the only shipping platform. A future Flutter client would make
     this `adaptive` — revisit then, not before. -->

## Users

Two primary users, both first-class, in two different physical situations:

- **Player — phone, at and around the court.** Submits a score after a game,
  verifies or disputes an opponent's submission, checks their rating and where
  they sit in the rankings, finds and registers for open play and tournaments.
  Often standing, one-handed, on mobile data, between games.
- **Club admin / organizer — laptop or tablet.** Creates and runs the club:
  open-play sessions and tournaments, brackets, courts, scoresheets, members,
  invitations, announcements, and (planned) entry-fee collection. Denser,
  longer-lived sessions on a larger screen.

Neither is secondary. A design that only works well on the phone fails the
organizer's bracket and member screens; one that only works on a laptop fails
the courtside score submission that produces every rating in the system.

A third role, **system admin**, exists in the codebase (`pages/admin/*`:
club verification, feature flags, fees, ratings, reports, sponsors, branding,
theme) for platform moderation and operations. It is an internal surface, not a
design priority.

## Product Purpose

DinkAndLadder is a Philippine pickleball platform. It gives players a rating
that comes from real, opponent-verified matches, and gives clubs the tools to
actually run their play — open play sessions, tournaments, brackets, members —
so that the rating falls out of real competition rather than self-report.

Success: a player's number is one they and their opponents both trust, and a
club can run a weekend tournament end to end inside the product instead of on
paper and in a group chat.

## Positioning

Four things together, none of which a neighboring product truthfully offers as
one system for this market:

1. **Ratings from verified matches.** Every result is confirmed, rejected, or
   disputed by a participant before it moves a rating. There is an audit trail.
2. **Easy access to open play.** Finding and joining a session near you is a
   first-class flow, not a Facebook post.
3. **Tournament accessibility, with online entry-fee payment.** Discovering,
   entering, and paying for a tournament online — replacing cash at a desk.
4. **Clubs as operators, not listings.** A club creates and runs its own open
   play and tournaments and manages its own membership.

Online payment is the load-bearing differentiator for clubs specifically
(see `docs/36-VERIFIED-CLUB-OFFERING.md`), because it is the one capability that
genuinely requires verification rather than merely being gated behind it.

## Operating Context

- **Courtside.** Phone, standing, short attention windows between games, often
  poor connectivity. Score submission and verification happen here.
- **Club operations.** Laptop or tablet, at a desk or a tournament check-in
  table. Brackets, court assignments, scoresheets, member approval, invitations.
- **Money today is cash in an envelope**, counted by hand at a check-in desk,
  with no record of who paid. That is the workflow online fee collection
  replaces, and the reason a verification tier is acceptable to clubs at all.
- **Philippines.** GCash/PayMongo is the local payment expectation alongside
  Stripe for international; mobile-first is a real constraint, not a preference.

## Capabilities and Constraints

**Shipped and live-verified** (per `docs/PROJECT-STATUS.md`): authentication,
player profiles, club management (membership, roles, requests, invitations),
match submission, match verification, rating engine, rankings. Beyond the MVP:
events and tournaments with brackets/courts/scoresheets, activity feed,
notifications, following, achievements, community/team-up, announcements,
account switching, verified clubs, an admin console, and a light/dark themed
design-token system.

**Stack.** Nuxt 3 / Vue 3 / TypeScript / Tailwind, Supabase Postgres, Liquibase
as the schema source of truth. Strict layering: Database → DTOs → Repositories →
Services → Controllers → UI. Flutter mobile is planned and must be able to
consume the same DTO-based API contracts.

**Not settled — do not invent production rules for these:**

- The final rating algorithm (an interim algorithm ships today; the initial
  rating questionnaire is blocked).
- The final match verification policy.
- Final ranking eligibility rules.
- Tournament rule variations.
- **Pricing and payment.** The payment domain is partially built (transactions,
  sponsorships, registration fees), but the tiers and prices in
  `docs/36-VERIFIED-CLUB-OFFERING.md` are an explicit proposal with placeholder
  prices. No price, plan name, or fee is a business rule until the backlog
  moves it. Never render one as fact.

**Terminology.** Player, club, member, open play, tournament, event, bracket,
match, verification, rating, ranking, verified club.

## Brand Commitments

- **Name:** DinkAndLadder.
- **Identity color:** green. The token system already carries a per-theme brand
  green (`#0A7F45` light, `#4DB175` dark) chosen for contrast, plus a mint
  accent on light and periwinkle on dark. Light is the product default.
- **No logo or wordmark asset exists yet** (`apps/web/public/` holds only a
  favicon, fonts, and event art). Do not present a fabricated logo as the mark.
- The existing design-token system in `apps/web/assets/css/tokens.css` and
  `docs/33-DESIGN-SYSTEM-AND-THEMING-SPEC.md` is the incumbent visual authority
  and was built deliberately; it is evidence, not a placeholder.

## Evidence on Hand

**Pre-launch. No real users yet.** Working, live-verified software against a
real Supabase database, but the data is seeded and test accounts only.

Nothing that implies traction may be shown or invented: no real club names, no
member or match counts, no testimonials, no partner or sponsor logos, no press,
no "trusted by" claims, no app-store ratings. Empty and first-run states are the
honest default state of this product right now, and designing them well matters
more than designing a populated dashboard.

Real assets that do exist: the shipped UI itself, the token system, event art in
`apps/web/public/event-art`, and the design/spec documentation in `/docs`.

## Product Principles

1. **A number nobody disputes.** Ratings are explainable and traceable to
   verified matches; the product should always be able to show its work.
2. **Two devices, one product.** The phone at the court and the laptop at the
   organizer's desk are both primary. Neither is a scaled-down version of the
   other.
3. **Clubs are operators.** Model a club as something that runs play, not
   something that appears in a directory.
4. **Say only what is true.** Pre-launch, with unsettled pricing and rating
   rules — invented numbers, prices, or social proof are product damage, not
   placeholder copy.
5. **The court is a hostile environment.** Short attention, one hand, sunlight,
   bad signal. The critical path — submit, verify, check — must survive it.

## Accessibility & Inclusion

WCAG AA contrast is an established, already-enforced standard here: the color
tokens were individually chosen and measured to clear AA, including deliberately
darkening the muted foreground and the brand green when the mockup swatches
failed. One known open exception is documented in
`docs/33-DESIGN-SYSTEM-AND-THEMING-SPEC.md` §11. Hold new work to the same bar.
