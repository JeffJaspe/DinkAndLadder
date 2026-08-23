# Implementation Backlog

## Execution Rule

Complete tasks in order unless a dependency or documented ADR changes the order.

---

# Phase 0 — Foundation

### P0-001 Project Repository Bootstrap
Create:
- web app structure
- mobile project placeholder if not yet initialized
- shared documentation structure
- testing structure

### P0-002 Liquibase Bootstrap
Create:
- Liquibase configuration
- master changelog
- domain migration folders
- local development connection strategy

### P0-003 Core Tooling
Configure:
- TypeScript
- lint
- formatting
- Vitest
- Playwright

### P0-004 CI Skeleton
Configure validation pipeline.

---

# Phase 1 — MVP

## MVP-001 Authentication
Deliver:
- auth integration
- user profile provisioning
- session handling
- authenticated API calls
- login/register UI
- tests

## MVP-002 Player Profiles
Deliver:
- player profile schema
- DTOs
- repositories
- services
- controllers/API
- profile UI
- privacy foundation
- tests

## MVP-003 Club Management
Deliver:
- clubs
- memberships
- roles
- create/view/join/admin flows
- tests

## MVP-004 Match Submission
Deliver:
- match entities
- participants
- teams
- scores
- submission workflow
- tests

## MVP-005 Match Verification
Deliver:
- verification workflow
- decision state
- rejection/dispute foundation
- audit events
- tests

## MVP-006 Rating Engine
Deliver:
- rating abstraction
- current ratings
- rating transactions
- calculation versioning
- production algorithm only after ADR finalization
- exhaustive unit tests

**COMPLETED sub-item**: initial/unrated-player self-assessment questionnaire implemented with user-provided question bank (31 questions across 5 categories: Experience, Skill, Strategy, Competition, Self-Assessment). See `apps/web/server/domains/rating/data/question-bank.ts` and ADR-001.

## MVP-007 Rankings
Deliver:
- ranking query/service
- ranking API
- ranking UI
- eligibility rules
- tests

---

# Phase 2 ✓ COMPLETE

- ✓ Events — `006-event.changelog.xml`, `apps/web/server/domains/event/`
- ✓ Tournament registration — `tournament_registrations` table, register/withdraw endpoints
- ✓ Brackets — `bracket_matches` table, single elimination bracket generation
- ✓ Notifications — `007-notification.changelog.xml`, `apps/web/server/domains/notification/`
- ✓ Player search — `GET /api/v1/players/search`
- ✓ Club discovery — `GET /api/v1/clubs/search`

# Phase 3 ✓ COMPLETE

- ✓ Social relationships — `009-social.changelog.xml`, follow/block endpoints
- ✓ Activity feed — `010-activity.changelog.xml`, personalized feed
- ✓ Achievements — `011-achievement.changelog.xml`, 16 seed achievements
- ✓ Club announcements — `012-announcement.changelog.xml`, draft/publish/archive workflow

# Phase 4 — FOUNDATION COMPLETE

- ✓ Payments domain (database, DTOs, repositories, services)
- ✓ Subscription plans + feature gating
- ✓ Sponsorships domain

**Live payments deferred** — Stripe + GCash integration is priority AFTER full app flow is working. Payment providers are free to set up when ready.

# Phase 5 ✓ COMPLETE

- ✓ Analytics — `014-analytics.changelog.xml`, player/club/platform stats
- ✓ Reporting — stats endpoints with aggregated data
- ✓ Historical trend dashboards — rating history endpoint

# Phase 6 — DEFERRED (Mobile)

Requires Flutter mobile app:
- Push optimization
- Offline synchronization
- QR check-in
- mobile-first workflows

# Phase 7 ✓ COMPLETE

- ✓ Provincial/regional/national ranking expansion — `015-regions.changelog.xml`, PH regions + provinces

# Phase 8 — DEFERRED

- Federation integration (requires external federation API specifications)

# Phase 9 ✓ COMPLETE

- ✓ Public API — `016-api-keys.changelog.xml`, API key management, public endpoints
- ✓ API keys — SHA-256 hashed keys, rate limits, permissions
- ✓ Webhooks — subscription management, delivery tracking

# Phase 10 — LATER

- Multi-tenancy
- Advanced auditing
- Data warehouse/BI integration

---

# Current Sprint — Event-Centric Match System

## Priority Order

### 1. Match & Event System Enhancement
Per `docs/31-MATCH-EVENT-SYSTEM-SPECIFICATION.md`:
- [x] Database: Enhance events table (event_type, queue settings)
- [x] Database: Add event_registrations table
- [x] Database: Link matches to events (event_id required)
- [x] Database: Add event_queue and event_courts tables
- [x] Database: Update RLS policies for visibility rules
- [x] API: Event registration endpoints (register/check-in/withdraw/list)
- [x] API: Event content endpoints (matches, players/registrations)
- [x] API: Event rankings endpoint — event-scoped wins/losses/matches-played leaderboard from
      verified matches only; deliberately excludes rating change (rating_transactions is
      "select own" RLS, no documented reason to bypass it for a shared leaderboard)
- [x] API: Match agreement flow — reuses the existing MVP-005 confirm/reject/dispute
      verifier flow (`/matches/{id}/verification*`) for agree/dispute; counter-proposal is
      scoped to singles matches only and moves the match straight to `disputed` for
      organizer review rather than a multi-round negotiation loop (see the scoping note on
      `MatchService.proposeCounterScore` — full turn-based negotiation is blocked on the
      unresolved "exact match verification policy" decision, CLAUDE.md section 7)
- [x] API: Queue endpoints (join/leave/match/skip)
- [x] UI: Event page tabs (Info, Matches, Players, Rankings, Queue)
- [x] UI: Match agreement flow (existing Confirm/Reject/Dispute on match detail page)
- [x] UI: Score counter-proposal ("Propose Different Score" on match detail page, singles only)

### 2. Dashboard Wiring
Per `docs/32-DASHBOARD-SPECIFICATION.md`:
- [x] Remove podium from player dashboard
- [x] Wire player rank position (top-100 lookup in the player's own province; shows "Unranked"
      if not found rather than fabricating a position)
- [x] Wire rating chart to real data (`players/me/rating-history`)
- [x] Add "My Recent Matches" section (new `players/me/matches` endpoint)
- [x] Add "Pending Actions" section (pending match verifications + the player's own pending
      club join requests — no invite-to-club feature exists in this codebase, so this reports
      real pending state rather than inventing "invitations")
- [x] Add "My Upcoming Events" section (new `players/me/upcoming-events` endpoint)
- [x] Wire club dashboard podium (top members) — new `clubs/{id}/rankings` endpoint
- [x] Add club matches section — new `clubs/{id}/matches` endpoint
- [x] Add club events (previous + upcoming) — reuses the existing public events search endpoint

### 3. Dummy Data Seeding
- [ ] Seed test players (10-20)
- [ ] Seed test clubs (2-3)
- [ ] Seed test events (5-10)
- [ ] Seed test matches with ratings
- [ ] Seed rankings data

### 4. Production Cleanup (Later)
- [ ] Wipe all test data
- [ ] Fresh production start

---

## Audit Follow-ups (deferred from the 2026-08-22 remediation pass)

A full-codebase audit produced 37 findings. The 6 critical and 13 high ones were
fixed in that pass (see PROJECT-STATUS.md "Phase 9"). These 18 were deliberately
deferred — none block the MVP. IDs match the audit report.

### Promote next
- [ ] **F-34 — Testing gap.** `tests/integration/` is empty (`vitest.config.ts`
      is already wired to run it). Seven services have no unit test: analytics,
      badge, partnership, sponsorship, platform-admin, shoutout, webhook. The
      seven e2e specs total ~160 lines and only assert signed-out redirects and
      401s — no authenticated journey is covered. **Every Correctness finding in
      that pass would have been caught by an integration test**, and CLAUDE.md's
      Definition of Done already requires them.
- [x] **Lint is red on `main`.** DONE (2026-08-22) — 66 → 0 errors. `pnpm --filter web run lint` fails with 66
      pre-existing errors (mostly `no-explicit-any` and unused vars in specs).
      CI runs lint, so the pipeline cannot go green until this is cleared.
      Confirmed pre-existing, not introduced by the remediation pass.

### Correctness
- [x] F-22 — DONE (2026-08-22): winners now advance (single elim + double-elim winners side); first-round byes propagate at generation; winner validated as a participant; 7 new tests. Losers-bracket routing still open — see below. Original note:  Bracket winners never advance. `updateBracketMatch` writes the
      winner but nothing populates the next round, so tournaments stall after
      round one.
- [ ] F-23 — `confirmedRegs` in `bracket.service.ts` also includes `pending`
      registrations. Decide the rule, then make the name match it. The adjacent
      category filter also treats `undefined` and `null` differently from
      `deleteByTournamentId`.
- [x] F-24 — DONE (2026-08-22): reads created_at from auth.users via the Admin API instead of JWT claims, degrading gracefully. Original note:  `/api/v1/me/auth-info` returns `created_at: undefined`.
      `serverSupabaseUser` returns JWT claims, which have no `created_at`.
      Either drop the field or read it from the `users` table.
- [ ] F-25 — Verification roll-up race. `recordVerificationDecision` recomputes
      match status from an in-memory snapshot, so two simultaneous confirmations
      can leave a match `pending_verification` — and it never gets rated.
- [ ] F-26 — `highest_singles_rating` / `highest_doubles_rating` return the
      *current* rating. Compute from `rating_transactions`.
- [ ] F-27 — Feed params unvalidated: `types` is cast without a membership
      check, a malformed `since` 500s instead of 400ing, `offset` accepts
      negatives, and `getCirclePlayerIds` builds an unbounded `.in()` that will
      eventually exceed the request URL limit.
- [x] F-28 — DONE (2026-08-22): the query is skipped for a memberless club instead of sending 'none'; the error is now checked. Original note:  `getClubStats` sends the literal `'none'` where a uuid is expected
      when a club has no members; the error is swallowed. Skip the query instead.
- [ ] F-29 — `events_select_public` uses `status != 'draft'`, which is NULL-unsafe.
      Use `IS DISTINCT FROM` (forward-only changeset).
- [x] F-32 — DONE (2026-08-22): get_club_match_stats is now called; tournaments_hosted counted via events; member_growth_rate computed. Original note:  `getClubStats` hardcodes `matches_this_month`, `tournaments_hosted`
      and `member_growth_rate` to 0, and `active_members` duplicates
      `total_members`. Cheap win: `get_club_match_stats` already exists in
      `014-analytics.changelog.xml` and is currently unused.

### Security (low severity)
- [x] F-11 — DONE (2026-08-23): the deploy-topology question is now answered by
      configuration instead of by a hardcoded guess. `server/utils/trust-proxy.ts`
      resolves whether `X-Forwarded-For` may be believed —
      `TRUST_PROXY_HEADERS` when set, Vercel auto-detected otherwise, untrusted
      everywhere else — and it is surfaced as `runtimeConfig.trustProxyHeaders`
      (overridable at runtime as `NUXT_TRUST_PROXY_HEADERS`).
      `server/utils/client-ip.ts` reads the header only when that is true.
      11 tests. Original note:  `getRequestIP` is called without
      `{ xForwardedFor: true }`, so
      Turnstile receives the proxy's IP. Decide based on the deploy topology —
      trusting the header when not behind a proxy makes it spoofable.
- [x] F-12 — DONE (2026-08-22): shared escapeLikePattern in server/domains/shared, applied to player and club search, 5 tests. Original note:  `%` and `_` are not escaped before reaching `ilike` in the player
      and club search repositories.

### Hygiene
- [ ] F-31 — Onboarding validates `account_type` and then ignores it (no column
      backs it). Either persist the choice or drop the parameter.
- [ ] F-33 — `components/EmptyState.vue` and `components/ui/EmptyState.vue` are
      two different unused implementations. `PlatformStatsDto` is now unreferenced
      after the platform endpoint was deleted.
- [ ] F-35 — Three error conventions coexist. Remaining raw `createError` callers
      return a body the app-wide `fetchError.data?.message` convention cannot read.
- [ ] F-36 — `serverSupabaseUser`'s result is named `claims` in most handlers and
      `user` in others. The `user` naming is what invited F-24.
- [x] F-37 — DONE (2026-08-22): all 52 `no-explicit-any` and 12 unused vars cleared; PSGC console.logs removed; shared `utils/api-error-message.ts` and typed Supabase join rows introduced. Original note:  `catch (e: any)` and `data: any[]` across pages despite
      `typescript.strict`; concentrated in `pages/events/[eventId]/index.vue`.
- [ ] Nuxt config drift: `@nuxtjs/supabase` warns that
      `~/types/database.types.ts` is missing, so `Database = unknown` and no
      query is type-checked against the real schema. Generating it would have
      caught F-17 (`follower_id` is not a column) at compile time.

### Opened by the 2026-08-22 follow-up pass

- [ ] **Double-elimination losers-bracket routing.** F-22 implemented advancement
      for single elimination and the winners side of double elimination. Losers
      are still not routed: correct placement depends on the round-by-round drop
      pattern, and the current generator only approximates the losers structure
      (`Math.max(1, matchesInRound)` in `generateDoubleEliminationBracket`).
      A wrong route is worse than an empty one, so it was left explicit rather
      than guessed. Fixing it means designing the losers bracket properly first.
- [ ] **Pool-play playoff seeding.** Pool rounds and playoff rounds are both
      generated, but nothing computes pool standings or seeds the playoff from
      them, so playoff slots stay empty. Same shape of gap F-22 closed for
      knockout.
- [ ] **Bracket cards show registration ids, not names.** `BracketMatchCard`
      renders `registration_id.slice(0, 8)` because the bracket endpoint does not
      join player names. Needs the join, then the card can show real names.

### Opened by the 2026-08-23 UI pass

- [ ] **Public index routes redirect to login while their data is public.**
      `/events` sends a signed-out visitor to `/login`, but `/events/:id` renders
      fine and `GET /api/v1/events` returns the same data unauthenticated. The
      landing page advertises "Browse everything free — sign up to compete", so
      the redirect contradicts both the API and the stated product intent.

      Cause: the globs in `supabase.redirectOptions.exclude` (`nuxt.config.ts`)
      are `/events/*`, `/players/*`, `/clubs/*` — and a trailing `/*` does not
      match the bare index route. So the *detail* pages are public and the
      *list* pages are not.

      Affected: `/events`, `/players`, `/clubs`. Confirmed by loading `/events`
      signed out: HTTP 200, final URL `/login`.

      Fix is to add the bare paths to the exclude list. Nothing is protected by
      the current behaviour — the endpoints those pages call are already public,
      and RLS is the real boundary — so this is an oversight rather than a
      security control. It was left alone because changing auth configuration is
      a product decision, not a styling one.

      Worth checking the whole exclude list at the same time for the same
      trailing-glob mistake, and worth an E2E test asserting each intended-public
      route renders signed out, so the next addition cannot regress silently.

      Side effect while it stands: the events list cannot be verified in a
      headless browser, so the capacity bar added on 2026-08-23 is covered by
      unit tests and a live API check rather than a screenshot.

### Opened and closed by the 2026-08-23 card-elevation pass

All three were reported as open on 2026-08-23 and resolved the same day.

- [x] **The light-theme axe e2e failures were Nuxt DevTools — DONE (2026-08-23).**
      `tests/e2e/theme.spec.ts` reported one serious `color-contrast` violation
      in light mode on `/`, `/rankings`, `/login` and `/register`. The node was
      `nuxt-devtools-frame .nuxt-devtools-label-secondary` — the dev toolbar's
      timing pill, #888888 on #FFFFFF at 9.6px, 3.54:1. No app element involved.

      **Root cause, corrected:** this was not a repo defect. `playwright.config.ts`
      starts `pnpm run preview` (a production build, no devtools) but sets
      `reuseExistingServer: !process.env.CI`, so whenever a `pnpm dev` server
      happens to be listening on :3000 the whole suite silently runs against
      *that* instead — devtools toolbar included. The earlier note in this file
      claiming it reproduced "on a clean `main`" was measured with a stray dev
      server still running, which is why stashing the changes did not clear it.
      With :3000 free, all 39 e2e tests passed before any fix was made.

      Fixed anyway, because a suite whose result depends on what the developer
      left running is not trustworthy: the axe scan now carries
      `.exclude('nuxt-devtools-frame')`. Verified both ways — 39/39 against
      `preview`, and 8/8 axe tests against a deliberately started dev server,
      which is the case that used to produce the four failures.

- [x] **`prettier --check` red repo-wide — DONE (2026-08-23).** 209 files failed
      on a clean `main`; `apps/web` now reports "All matched files use Prettier
      code style."

      Two independent causes, and fixing either alone would have left it red:

      1. **Real formatting debt.** The repo had never been formatted
         consistently — genuine reflows, not cosmetic noise (`watch(...)` bodies
         inlined, `{ a: string, b: number }` where Prettier writes `;`, long
         chains unwrapped). `prettier --write .` fixed these.
      2. **Line endings.** `core.autocrlf=true` checks files out as CRLF while
         Prettier's `endOfLine` default is `lf`, so *every* file fails on a
         fresh clone regardless of its content. Confirmed by taking a passing
         file, converting it to CRLF, and watching the check fail. A new
         root `.gitattributes` pins the working tree to `eol=lf`, which changes
         no committed content — the index was already LF.

      `types/database.types.ts` was added to `.prettierignore`: it is generated
      by `supabase gen types`, so formatting it only creates a diff against the
      next regeneration.

- [x] **`pages/dev/components.vue` Prettier/Vue deadlock — DONE (2026-08-23).**
      Prettier split `@confirm="destructiveModalOpen = false; toast.info(…)"`
      across lines and dropped the `;`, which the Vue compiler then rejected
      (`Error parsing JavaScript expression: Unexpected token, expected ","`)
      and the build failed; re-adding the `;` was formatted straight back out.
      Extracted to a named `confirmDestructive()` in the script block, which is
      the one form both tools accept. It was the only multi-statement inline
      handler in the codebase — checked, not assumed.

### Opened by the 2026-08-23 sidebar regression

- [ ] **The mobile drawer has no account switcher.** Club mode is reachable only
      from the desktop sidebar. This predates the `d985f6c` regression — the
      switcher was desktop-only before it too — so it was left alone rather than
      widening a restoration into a new feature. On a phone there is currently
      no way to enter club mode at all.

- [ ] **Nothing guards a component being orphaned.** `AccountSwitcher.vue` sat
      unmounted from `d985f6c` until it was reported, while still compiling,
      still passing lint, and still being referenced by four code comments.
      `components/EmptyState.vue` and `components/ui/EmptyState.vue` are in the
      same state today (F-33). A lint rule or a build-time check for components
      that nothing renders would have caught both.

### Opened by the 2026-08-23 account-mode pass

- [x] **Account switcher on mobile — DONE (2026-08-23).** Club mode was
      unreachable on a phone; the switcher now renders in the mobile drawer's
      footer as well as the desktop sidebar, and the drawer closes on the
      settled route so the switcher's own async navigation closes it too.
- [x] **Drafts hidden from player mode — DONE (2026-08-23).** Filtered from the
      events list, dropped from the status filter, filter reset on mode change,
      and a deep-linked draft renders an explanatory panel instead of an error.
- [x] **Event modification confined to club mode — DONE (2026-08-23).**
      `canManageEvent` / `canManageTournament` / `canManageAnnouncements` =
      role or ownership AND `isClubMode`. Player mode keeps register, the player
      list, the bracket, the matches, the rankings. "Publish" no longer appears
      in player mode anywhere.

- [ ] **Should club member management follow the same mode rule?** Announcement
      authoring is now club-mode-gated, but member approvals, role changes and
      club verification on `pages/clubs/[clubId].vue` still go by role alone. It
      is the same shape of inconsistency the event work just removed. Left as a
      question because it decides who can act on a pending join request — a
      product call, not a styling one.

- [ ] **The mode gates are client-side only.** `canManageEvent` hides controls;
      it does not stop the corresponding API call. The endpoints still authorise
      by ownership alone, so a request made outside the UI in player mode would
      still succeed. That is no worse than before this pass — the gate is a UI
      affordance, and ownership remains the real boundary — but if account mode
      is meant to be a genuine permission rather than a navigation concept, it
      has to reach the service layer. Note that no DB column backs account mode
      today (see `useAccountMode`'s header comment), so this would need one.

### Opened by the 2026-08-23 club-roles pass

- [x] **Role-change UI — DONE (2026-08-23).** The API and permission matrix
      existed since `003-club`; nothing ever called them, so every member was a
      MEMBER for life. Member rows now carry a role control mirroring
      `ClubService.updateMember`, with 12 tests pinning the mirror.
- [x] **Option C club-hat split — DONE (2026-08-23).** Approvals work in both
      hats; roles, removals, verification and club create-actions need it.
- [x] **Acting-as-the-wrong-club hole — DONE (2026-08-23).** All club-hat gates
      now require `activeClubId` to be the club on screen, not merely club mode.

- [ ] **MODERATOR grants nothing.** It can now be assigned, and carries no
      permissions — `ClubService` says so explicitly. Either give it powers
      (announcements is the natural fit; `isStaff` already includes MODERATOR) or
      remove it from the assignable list. Assigning a role that does nothing
      implies authority that does not exist.

- [ ] **No ownership transfer.** The OWNER row is unmodifiable by anyone,
      including the owner, so a club cannot change hands and an owner cannot
      leave. Fine while clubs are new; it becomes a support burden the first time
      someone abandons one.

### Opened by the 2026-08-23 moderator-permissions pass

- [x] **MODERATOR now carries permissions — DONE (2026-08-23).** Reviews club
      join requests (`APPROVAL_ROLES` in club.service.ts) and event
      registrations (`assertCanReviewRegistrations` in event.service.ts).
      Announcements already admitted the role. Supersedes the "MODERATOR grants
      nothing" item above.
- [x] **Registration approval UI — DONE (2026-08-23).** `PATCH
      /api/v1/registrations/{id}` had no caller; the tournament page showed a
      pending count with no way to act on it. Approve/Reject added per entry.

- [ ] **`waitlisted` has no UI.** The endpoint accepts it, nothing offers it, and
      `bracket.service.ts` does not consider it when seeding. Either build the
      waitlist properly (what promotes someone off it, and when) or drop the
      status from the endpoint's accepted values so it cannot be set into a
      state nothing understands.
- [ ] **Moderator powers are UI + service, never RLS.** Both new permissions are
      enforced in the service layer over the service-role client, consistent with
      how club writes already work — but it means the permission matrix lives in
      TypeScript, not in the database. Worth a look during the next security
      review pass alongside F-29.

### Opened by the 2026-08-23 discovery / duo / rankings pass

- [x] **`027-default-partner` applied — DONE (2026-08-23).** All four
      changesets ran against the live Supabase project; `status` reports up to
      date at 199 total. Connection had to go through the session pooler
      (`aws-0-ap-northeast-1.pooler.supabase.com:5432`, user `postgres.<ref>`)
      because `db.<ref>.supabase.co` is IPv6-only — see PROJECT-STATUS for the
      detail. The README's "direct connection" instructions do not work from an
      IPv4-only machine and are worth amending.
- [ ] **Rollback for `027-default-partner` is untested.** Every changeset has an
      explicit `<rollback>`, but exercising it means dropping and recreating the
      table on the live database. Safe while the table is empty; do it before it
      holds anything.
- [ ] **`database/liquibase/README.md` documents a connection that cannot work
      here.** It says to use the direct host; that is IPv6-only. Add the session
      pooler form, and the warning that the transaction pooler (6543) is not
      usable for Liquibase.
- [ ] **Duo pre-fills are client-side only.** The server does not consult a
      player's duo when a doubles request arrives without a partner; it still
      returns `PARTNER_REQUIRED`. That is deliberate — the decision taken was
      pre-fill only, so no player is entered into anything without acting — but
      it means a non-web client gets no benefit from the setting.
- [ ] **`GET /api/v1/verified-clubs` now has no caller.** `/verified-clubs`
      redirects to `/clubs?verified=1` and the directory filters through
      `clubs/search`. The endpoint and `ClubService.listVerifiedClubs` are left
      in place (public, harmless, and a plausible mobile-client dependency), but
      they are dead from the web app's point of view — worth deleting if the
      Flutter client does not want them.
- [ ] **`clubs/search` and `players/search` are unbounded browses now.** Both
      dropped their "supply at least one filter" 400 so "All Provinces" lists
      everyone. Results are still capped at `MAX_LIMIT` (100) and still
      restricted to public+active rows, but neither endpoint paginates in the
      UI — the pages request `limit: 50` and stop there. A directory that grows
      past 50 needs real paging, the way `/rankings` already has it.
- [ ] **`pages/community.vue` still has a hand-rolled podium** (lines ~253–353):
      emoji crown, `Math.round()` on ratings, and no podium at all below three
      players. It was excluded from this pass by choice. Swapping it to
      `RankingBoard` is now a two-line change.
- [ ] **`components/cards/PlayerCard.vue` appears orphaned.** It is the only
      `UiRankBadge` consumer and no page renders it. Either wire it into the
      players directory (which currently rounds ratings with `Math.round` and
      shows no rank) or delete it.

## Scale Readiness (plan: docs/34-SCALE-READINESS-PLAN.md)

Found while sizing the Supabase Free plan for a 10k-user first month. None of
these are bugs at the current volume (5 profiles, 8 matches) and none can be
caught by the existing test suite — a sequential scan of 5 rows and of 200,000
rows are the same code and the same green test.

### Phase 1 — one migration, do before the next deploy

- [ ] **`028-scale-indexes`.** 13 tables have no index beyond their PK. The seven
      that matter:
      1. `player_profiles (user_id)` — looked up on essentially every
         authenticated request; currently a full scan each time.
      2. `player_ratings (rating_type, rating_value DESC) WHERE rating_value IS NOT NULL`
         — the rankings query scans ~200k rows, sorts them all, and keeps 50.
         This is the single highest-value index in the schema.
      3. `player_ratings (player_id, rating_type)`
      4. `player_profiles USING gin (display_name gin_trgm_ops)` + `CREATE EXTENSION pg_trgm`
         — `ilike '%x%'` cannot use a B-tree at all.
      5. `player_profiles (province, city)`
      6. `match_scores (match_id)` — missing FK index
      7. `player_profiles (profile_visibility)` partial on `'public'`
      Use `<sql>` (Liquibase's `<createIndex>` cannot express partial, DESC or
      `gin_trgm_ops`), and `CREATE INDEX CONCURRENTLY` with
      `runInTransaction="false"`.

### Phase 2 — application

- [ ] Debounce the player search (~300 ms). No debounce today: `useFetch` with a
      reactive query refetches on **every keystroke**, each one a full scan.
- [ ] Minimum 2-character search query.
- [ ] Bound `getCirclePlayerIds` (F-27) — unbounded `.in()` exceeds the URL limit
      at scale. Correctness, not just speed.
- [ ] Consolidate the club page's six on-mount `$fetch` calls (largest measured
      egress item).
- [ ] Consolidate the dashboard's six.
- [ ] Keyset pagination for rankings — `OFFSET 10000` still scans and sorts
      10,050 rows. Not urgent until the ladder is that deep.

### Phase 3 — needs a product decision

- [ ] Retention policy for `activities`, `notifications`,
      `notification_deliveries`, `audit_logs`. Nothing prunes today. How long
      should a notification stay readable?
- [ ] Accept `rating_transactions` growth (one row per player per match, forever,
      unprunable without destroying rating history) or design a rollup.

### Verification — none of the above is meaningful without this

- [ ] Seed a realistic dataset (50k profiles, 100k ratings, 20k matches) —
      scale up the existing "Dummy Data Seeding" item.
- [ ] `EXPLAIN ANALYZE` the three named queries before and after Phase 1.
- [ ] Enable `pg_stat_statements` and rank by total time — it will probably
      surface something not on this list.
