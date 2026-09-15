# Mobile Audit — 2026-09-15

Every screen at phone width (390×844, Chromium Pixel 7 emulation, DPR 3) against
the **dev** Supabase project, signed in as the test owner and signed out for the
guest pages. Run through Playwright against the running dev server.

Run: `cd apps/web && npx playwright test --project=mobile`.

The new `mobile` project (`tests/e2e/authed/mobile-audit.spec.ts`,
`tests/e2e/helpers/mobile.ts`) records for each route: document overflow in px,
every element hanging past the right viewport edge (intentional `overflow-x:
auto` scrollers excluded), the scrollers that actually scroll, interactive
elements under 40px, and a full-page screenshot in
`apps/web/test-results/mobile-audit/`. Sideways scroll and edge overflow are
soft assertions, so one bad page never hides the next.

**First run: 41 routes, 35 passed, 6 failed.** All six failures are real
sideways-scroll defects, listed as P1 below. Nothing was fixed in this pass —
this is the audit; the fix commands are at the end.

## Audit Health Score

| # | Dimension                | Score | Key finding                                                                 |
|---|--------------------------|-------|-----------------------------------------------------------------------------|
| 1 | Accessibility            | 3     | Bottom-nav buttons and header icons are 36px; 40px is the floor elsewhere   |
| 2 | Performance              | 3     | `/events` renders every event (25k px tall page) with no paging on a phone  |
| 3 | Responsive Design        | 2     | 4 pages scroll sideways; rankings and scoresheet hide the number that matters |
| 4 | Theming                  | 4     | No literal colours found; token system holds on every mobile screen         |
| 5 | Implementation Integrity | 4     | Detector: 17 advisory (off-ramp font sizes in cover art and nav labels), 0 errors |
| **Total** |                    | **16/20** | **Good — address the weak dimension**                                   |

### Implementation Integrity verdict — PASS

The mobile build is the same product as the desktop build: the app shell, card
composition, tokens, tabular figures and status pills all carry through, and the
landing page's ledger composition collapses correctly (single column, vertical
verification-loop gutter, sheet menu). The detector's only findings are advisory
`text-[10px]` labels on the bottom bar and the generated cover art's fluid
sizes, both intentional. The defects below are layout mechanics — flex/grid
`min-width:auto`, a `min-w` on a table, a stacking-context miss — not drift.

## Findings

### P1 — fix before release

**[P1] Club directory cards push the page 70px past the viewport**
- Location: `apps/web/pages/clubs/index.vue:226-238` (also reached via `/verified-clubs`, which forwards here)
- Category: Responsive
- Impact: `/clubs` and `/verified-clubs` scroll sideways on every phone; the Verified badge on each card is cut off and the whole page wobbles when the user scrolls. This is the first screen a signed-out visitor is likely to open from the landing page's browse index.
- Cause: `<h2 class="truncate">` sits inside `<div class="flex items-center gap-1.5">` with no `min-w-0`, so the flex item refuses to shrink below the club's full name; the grid item inherits the width (`min-width:auto`) and the card ends at x=460 on a 390px screen.
- Recommendation: add `min-w-0` to the h2 (or the inner flex div). One class.
- Evidence: `test-results/mobile-audit/390--clubs.png`, `390--clubs.json` (`overflowPx: 70`, 12 offenders).

**[P1] Club dashboard leaderboards push the page 95px past the viewport**
- Location: `apps/web/pages/club/[clubId]/dashboard.vue:207-232`, root cause in `apps/web/components/ui/DataTable.vue` (empty slot rendered inside a `<td>`) and `apps/web/components/ui/EmptyState.vue:39` (`max-w-sm`)
- Category: Responsive
- Impact: The organiser's own club dashboard scrolls sideways; the Doubles "no rated members" message and the Singles rating column are clipped.
- Cause: The empty state renders inside a table cell, and the table's auto layout sizes that cell to the `max-w-sm` (384px) paragraph, so the table is 427px wide inside a 318px card. Both grid items then take that width. Verified with a DOM probe: `div.grid w=358`, card `w=469`, `table w=427`, `p.max-w-sm w=361`.
- Recommendation: DataTable should render the empty state as a block below the table rather than inside a `<td>`, and the grid items on this page (and `/clubs/[clubId]`) need `min-w-0`. `RankingBoard` compact mode already drops the Matches column; consider dropping Trend too on phones so the rating is always the right-most visible cell.
- Evidence: `390--club-…-dashboard.png/.json` (`overflowPx: 95`).

**[P1] Rankings table hides the rating on a phone**
- Location: `apps/web/components/RankingBoard.vue:105-123`, `apps/web/components/ui/DataTable.vue:55`
- Category: Responsive
- Impact: `/rankings` — the product's headline surface — shows `#`, avatar and name, then cuts off. The Rating and Trend columns are off-screen inside the `.scroll-x` wrapper with no affordance that it scrolls (table 493px wide in a 356px scroller). A player checking their number courtside cannot see it without a sideways drag they do not know exists. Also visible: the "Provisional" pill truncates to "Pro".
- Recommendation: On `< sm`, hide Trend (it already hides Matches), give the Player cell `min-w-0` + `truncate`, and let the rating column be the last visible column. If the table must still scroll, pin the rating or add a right-edge fade so scrollability is discoverable.
- Evidence: `crop-rankings.png`, `390--rankings.json` (`scrollers: div.scroll-x 493/356`).

**[P1] Match scoresheet hides the Result column for singles**
- Location: `apps/web/components/match/ScoreSheet.vue:99` (`min-w-[22rem]`)
- Category: Responsive
- Impact: `/matches/[id]` — the courtside record — shows PLAYERS / SCORE and then a clipped RES… header with the WON/LOST pills cut in half. The `min-w-[22rem]` (352px) floor was set for best-of-five, but the card's inner width on a 390px phone is 318px, so even a one-game singles match scrolls.
- Recommendation: Apply the minimum only when `games.length > 1` (e.g. `:class="games.length > 1 ? 'min-w-[22rem]' : ''"`), or compute it as `players + 4rem × games + 4rem`. A one-game sheet fits in 318px once the floor is gone.
- Evidence: `390--matches-….png`, `.json` (`scrollers: div.overflow-x-auto 352/318`).

**[P1] Club profile: logo tile is painted under the cover and the stats row overflows**
- Location: `apps/web/pages/clubs/[clubId].vue:540-547` and `:617-640`
- Category: Responsive / Implementation Integrity
- Impact: (a) The club logo that is meant to overlap the banner is cut in half — only the bottom 32px shows below the cover. `UiCoverArt` is `relative` (a positioned box paints over its static, later sibling), so the `-mt-8` tile is behind it. This happens at every width, not just mobile. (b) "1 Members · 8 Matches · 14 Events" is a `flex gap-6` row with no wrap; "Events" is clipped at 390px (`overflowPx: 18`).
- Recommendation: add `relative` to the logo's `tile-class`; add `flex-wrap` (or `gap-x-6 gap-y-2`) to the stats row. Also give the `flex items-center gap-2` name row `min-w-0` + `flex-wrap` so a long club name with a Verified badge does not repeat the `/clubs` bug.
- Evidence: `crop-club-top.png`, `390--clubs-….json`.

### P2 — next pass

**[P2] Tab strips overflow with no scroll affordance**
- Location: `apps/web/components/ui/Tabs.vue:83` (used on `/players/[id]`: 552px in 358; `/events/[id]`: 474 in 358); `apps/web/pages/community.vue:139-149` and `/partners` (2px overflow, "Opponents" flush to the edge)
- Category: Responsive
- Impact: The fifth profile tab and the event's Players tab are invisible unless the user happens to drag the strip. Community's segmented control is 2px too wide and its "My Duo Partners 0" label wraps to two lines while its neighbours stay on one.
- Recommendation: In `UiTabs`, add a right-edge fade mask when `scrollWidth > clientWidth`, or allow wrapping to two rows on `< sm`. Community: shorten to "Duo · 0" style labels or allow `flex-wrap`.

**[P2] Player profile header leaves a dead column on phones**
- Location: `apps/web/pages/players/[playerId].vue:681`
- Category: Responsive / Layout
- Impact: Avatar + name sit top-left; RATING / Team Up / Report stack right-aligned beneath them, leaving a 150px empty block under the avatar. Reads as a broken two-column layout.
- Recommendation: On `< sm`, stack as: avatar+name row, then rating and actions in a left-aligned row (`sm:items-end sm:text-right` only from `sm`).

**[P2] Rating shown to 2 decimals on the profile, 3 everywhere else**
- Location: `apps/web/pages/players/[playerId].vue:717` (`toFixed(2)`), `components/community/DuoPartnersPanel.vue:249-324`
- Category: Implementation Integrity
- Impact: The same player is 3.37 on their profile and 3.366 in the feed, the rankings and the match timeline. For a product whose promise is "a number nobody disputes", two spellings of one rating is a trust leak. (`numeric(5,3)` is the column.)
- Recommendation: `toFixed(3)` with `tabular-nums`, matching `RankingBoard` and `VerificationTimeline`.

**[P2] Events list renders the entire catalogue on one page**
- Location: `apps/web/pages/events/index.vue`
- Category: Performance
- Impact: 40 event cards with cover art on a single 25,000px page at 390px; on mobile data courtside this is the slowest screen in the app and the filter controls scroll away immediately.
- Recommendation: page or "Load more" at 10–12 (the feed already does this), and make the search/filter block sticky under the header on `< sm`.

### P3 — polish

- **[P3] 36px tap targets in the app chrome**: "Open menu", the notifications bell, the feed refresh button (`layouts/default.vue:472,483`, `pages/feed.vue`). 40px is the floor set by `UiButton md`; the chrome should meet it. Also `Save URL` on club settings is 29px tall.
- **[P3] Cookie policy table scrolls (405/358)** on `/legal/cookies` — acceptable for a legal table, but a right-edge fade would say so.
- **[P3] Event detail tab strip renders the event's title card twice** (hero card then the summary card directly beneath it) — on a phone that is two screens of the same name before the tabs appear.
- **[P3] `rejected` status pill is lower-case** on `/matches` while every other pill is Title Case.

## Patterns

1. **`min-width: auto` on flex/grid children.** Every one of the four sideways-scroll pages is the same mechanism: a `truncate` heading or a table inside a flex/grid item with no `min-w-0`. The fix is one class each, but it will recur until `DataTable`, card list items and page-level grids set `min-w-0` by default.
2. **Tables that scroll to hide the key number.** `DataTable`'s `.scroll-x` wrapper correctly protects the page from sideways scroll, but on a 390px phone it now hides the rating (rankings, club dashboard) and the result (scoresheet) — the two numbers the product exists to show. Scrolling is the right fallback for a best-of-five; it is the wrong default for a three-column ladder.
3. **Scrollers without affordance.** `scroll-x` is used on tabs, tables and the cookie table; none of them signal that they scroll. One shared right-edge fade (`mask-image` when overflowing) would fix all of them.

## Positive findings

- **Zero sideways scroll on 35 of 41 routes**, including the dense forms (`/create-event` at 12,000px tall lays out cleanly), the feed, notifications, settings, 2FA, the auth pages and the whole landing page.
- The landing page's responsive model holds exactly as DESIGN.md describes: single column, vertical verification-loop gutter, sheet menu with scrim, solid action rule under the claim.
- The app shell is right: sticky top bar, bottom bar with `safe-area-inset-bottom`, the drawer teleported at `z-50` above the `z-30` bars, `pb-20` on `<main>` so the last card clears the bar.
- Every number that did render used `tabular-nums`; no literal colours or Tailwind palette classes surfaced in any screenshot or the detector run.
- The empty states (community, club leaderboards, rating history) read as invitations, per the product principle, rather than as failures.

## Recommended actions

1. **[P1] `/impeccable adapt`** — `pages/clubs/index.vue`, `pages/clubs/[clubId].vue`, `pages/club/[clubId]/dashboard.vue`, `components/ui/DataTable.vue`, `components/match/ScoreSheet.vue`, `components/RankingBoard.vue`: kill the four sideways scrolls (`min-w-0`, empty state out of the `<td>`, conditional `min-w-[22rem]`), keep the rating and result columns visible on `< sm`, fix the logo stacking.
2. **[P2] `/impeccable adapt`** — `components/ui/Tabs.vue`, `pages/community.vue`, `pages/players/[playerId].vue`: scroll affordance on tab strips, phone-first profile header.
3. **[P2] `/impeccable harden`** — rating precision to 3 decimals on the profile and duo panel; paging on `/events`.
4. **[P3] `/impeccable polish`** — 40px chrome targets, pill casing, event-detail duplicate title, cookie-table fade.

Re-run `npx playwright test --project=mobile` after each; the six failing tests
are the acceptance criteria for action 1.
