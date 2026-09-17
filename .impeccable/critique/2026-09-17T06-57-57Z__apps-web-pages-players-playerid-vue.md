---
target: public player profile
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\Elbuff\\Documents\\GitHub\\DinkAndLadder\\apps\\web\\pages\\players\\[playerId].vue"
target_fingerprint: "sha256:72d460b5ced3ae8e227c1a3321490aaa0cb858513e38b14945cd9aea1aa3003c"
target_path: "C:\\Users\\Elbuff\\Documents\\GitHub\\DinkAndLadder\\apps\\web\\pages\\players\\[playerId].vue"
timestamp: 2026-09-17T06-57-57Z
slug: apps-web-pages-players-playerid-vue
---
Method: dual-agent (A: design review · B: detector + deterministic measurement). No browser inspection — the app needs an authenticated session and seeded data and no dev server was running. B substituted static analysis plus generated-CSS measurement (real Tailwind output, real tokens.css values, computed WCAG ratios). No user-visible overlay exists; responsive claims are computed, not observed.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2/4 | 15 of 16 useFetch calls have no pending state; header reflows as badge/trophies inject after hydration |
| 2 | Match System / Real World | 2/4 | Headline number is Math.max(singles, doubles), unlabelled, over a chart hardcoded to singles |
| 3 | User Control and Freedom | 3/4 | ?tab= deep-linking works, but Tabs.vue:53 uses router.replace while its docblock promises back-button stepping |
| 4 | Consistency and Standards | 1/4 | Same player reads 3.150 in the directory and 4.42 here; 35 raw radius utilities vs 6 token uses; status chips at two radii on one page |
| 5 | Error Prevention | 3/4 | Invite and duo guards well-reasoned; removing a duo partner is one untitled tap styled like the harmless Follow toggle |
| 6 | Recognition Rather Than Recall | 2/4 | A naked float on a 2.000-8.000 scale; provisional and matches_played fetched and discarded |
| 7 | Flexibility and Efficiency | 2/4 | Matches is a dead tab for every non-self visitor; head-to-head exists and is never linked |
| 8 | Aesthetic and Minimalist | 2/4 | "Not set" / "Not set" get two full shadow-card panels, equal weight to rating history |
| 9 | Error Recovery | 1/4 | Seven regions render failure as believable fact; five partner mutations have finally with no catch |
| 10 | Help and Documentation | 1/4 | Nothing explains what a rating is, what band it falls in, or where it came from |
| **Total** | | **19/40** | Below the usual 20-32 band |

## Design Specificity Verdict

Category-interchangeable. Avatar-left, stat-number-right, four-up strip, tab bar, stacked white cards. The product's one differentiator — ratings from organiser-recorded matches, with an audit trail — is absent from the page where it matters most. DESIGN.md's signature Verification Loop is never invoked; the profile shows the number and hides the argument.

Deterministic scan: detector returns 0 findings on the page, 1 advisory on Avatar.vue:29 (10px step) which this route never renders — false positive in scope. The zero is real (config carries only hook consent; a synthetic probe confirmed .vue scanning works). The detector being clean IS the finding: every drift here is of a kind no deterministic rule catches.

Disproven hypothesis: bg-danger-soft is NOT a dead class. B generated the real utility set and diffed all 158 classes — zero dead classes; bg-danger-soft renders at 4.61:1.

## Overall Impression

Engineering judgment is better than design judgment, and it is not close. The docblocks record bugs found by using the thing. What is missing is a point of view about what the page is for: built as a dashboard for the player, consumed by strangers. Biggest opportunity: make the rating tell the truth about itself — format, tier, provenance.

## What's Working

1. KudosCard is genuinely authored — six fixed rows, empty track always drawn, scaled to the player's own peak, with the reasoning recorded. Survives its own fetch failing by design. The only component here that could not be lifted into another product unchanged.
2. UiLineChart takes its axis and accessibility seriously — real-date placement, full series mirrored into a visually-hidden table, hover readout positioned for touch.
3. The token system holds up under measurement — zero literal colors across the page and all nine components; every prioritised text pair passes AA in both themes; tokens.css records the ratios and independent computation reproduced them.

## Priority Issues

[P0] The rating is three different numbers and none says which format it is.
displayRating = Math.max(singles ?? 0, doubles ?? 0) at :568, toFixed(2) at :806 under the bare label "RATING", above a chart hardcoded type:'singles' (:180, caption :988). players/index.vue:212 shows formatRating(singles_rating) at 3dp. One player reads 4.42 on their profile and 3.150 in the directory. provisional and matches_played are fetched at :179 and discarded.
Fix: both ratings labelled, doubles leading, each carrying tier and provisional state; chart follows a toggle. -> /impeccable polish

[P1] Seven data regions render their own failure as a believable fact.
Only profileQuery has an error branch. statsQuery failing renders "0 Matches / — / —". ratingHistoryQuery failing renders "Not enough rating history yet". kudosData has ignoreResponseError:true and renders six zeroes. Five partner mutations (:511, 522, 533, 544, 557) are try/finally with no catch. UiErrorState exists and is used zero times. -> /impeccable harden

[P1] Matches is a dead tab for everyone, and the page hides what the visitor came for.
Tab two renders "Match history is only visible to the player themselves" for every non-self visitor. pages/players/[playerId]/head-to-head.vue exists, works, and is linked only from community.vue. -> /impeccable shape

[P2] Eleven statements of nothing, zero actions — and the empty profile is the launch default.
DESIGN.md requires the empty state to read as an invitation. It reads as the player's failure, which is uniquely wrong because only an organiser can record a match. UiEmptyState exists and is used zero times. -> /impeccable onboard

[P2] Measured accessibility and layout defects.
- grid-cols-4 at :937 with no mobile fallback (~48px/tile at 320px); hardcodes 4 columns for a grid whose 4th child is v-if="achievementsEnabled".
- Avatar class conflict at :741 — size="xl" (h-24 w-24) vs passed class="h-20 w-20" on the same element; CSS source order wins, so it renders 96px, the markup does nothing, and the skeleton is 16px too small.
- h1 -> h3 skip on 5 of 6 tabs; "Rating History" (:985) is a span, not a heading.
- Tabs half-wired: correct role=tablist/aria-selected/roving tabindex, but the panels have no role=tabpanel/id/aria-labelledby and the tabs have no aria-controls.
- Emoji without aria-hidden at :750, :1111, :1133 — announced by CLDR name before every row. KudosCard.vue:69 does it correctly.
- Form-control borders :1221/:1240 measure 1.42:1 light / 2.47:1 dark against their fill — WCAG 1.4.11 needs 3:1. Modal error :1245 is 4.49:1 dark, missing AA by 0.01, using a raw bg-danger/10 instead of bg-danger-soft (5.89:1 in the same slot).
-> /impeccable adapt, then /impeccable harden

## Persona Red Flags

Courtside phone player (390px, one hand, bad signal): Math.max may size up a doubles opponent using a singles rating, then the chart says singles and the Stats tile says 2/40 — they leave less certain than they arrived. No tier, rank or anchor. statsQuery timing out makes the opponent read as a beginner. The header eats ~450-500px of a ~660px viewport, so the tab bar sits at the fold and "Clubs" is off-screen behind the overflow mask.

Club organiser at 1280px: cannot distinguish inactive from failed, and will decline an active player on a network error. `invited` is local state only (:87), so navigating away and back invites a duplicate send. The desktop layout is the phone layout with more air — max-w-6xl single column, 4-up strip at ~280px/cell for a 24px number.

New player on their own profile: isOwnProfile derives from a server:false fetch, so on first paint they see "Follow", "Request as Duo Partner" and "Report this player" pointed at themselves; the Matches tab flashes "only visible to the player themselves" on their own profile.

## Minor Observations

- :1136 capitalize on user-generated text — a shout-out renders as `Shouts: "Great Game Out There Today"`.
- Achievements: the header shows achievements_count, the tab shows slice(0,6) with no "show all".
- :722 has no v-else — profile null with no error renders an empty div.
- :1033 status chip is rounded-md where DESIGN.md specifies rounded-pill; the header chips (803, 818) use rounded-pill.
- championships and badgeData are server:false on a page whose comment says it renders server-side for SEO.
- Four separate date formatters now exist in this codebase.
- Not a defect: every avatar is the brand mark (USE_BRAND_DEFAULTS = true), documented at brand-assets.ts:20-31 as a deliberate choice with uploads intact. Its cost lands hardest here — the 96px ring is the largest element on a page whose job is telling people apart.

## Questions to Consider

1. If doubles is the sport, does anything else on the page still make sense once the premise changes?
2. What if the rating carried its receipt — "4.250 · Skilled · from 42 matches recorded by 3 clubs", tappable to the ledger?
3. Who is this page for? The opponent, the organiser and the player want three different pages.
4. Is "six tabs" hiding that there is about one screen of real content?
5. The empty profile is the truthful state of every account at launch. What if it were designed first?
