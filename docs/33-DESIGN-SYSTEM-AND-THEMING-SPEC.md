# 33 — Design System, Theming, and Mockup Parity Specification

Status: **Phases 1–6 implemented** (2026-08-22). Remaining gaps listed in §11.
Owner: UI/UX layer
Extends `17-UI-UX-ARCHITECTURE.md` and `30-UI-FUNCTIONALITY-MAP.md`.

---

## 1. Purpose

Two goals, in dependency order:

1. **Dual theme.** Ship a light theme alongside the existing dark theme, driven by
   semantic design tokens rather than literal colors.
2. **Mockup parity.** Implement the UI and UX shown in the approved mockups
   (5 desktop screens + 8 mobile screens + the design-system panel), mobile-first,
   expanding to full-width on desktop rather than a centered narrow column.

Goal 1 is a hard prerequisite for goal 2: rebuilding screens against hardcoded
hex values would double the work when the token migration lands.

---

## 2. Current state audit (measured, 2026-08-22)

| Fact | Value | Consequence |
| --- | --- | --- |
| Vue files in `pages/`, `components/`, `layouts/` | 55 | Migration surface |
| Arbitrary hex Tailwind classes (`bg-[#…]`, `text-[#…]`, …) | ~1,904 | No theming possible today |
| `text-white` occurrences | 472 | Ambiguous: some mean "primary text", some mean "label on a green button" |
| `tailwind.config.ts` named colors | dark-only literals | `darkMode: 'class'` is set but unusable |
| `components/ui/*` primitives | 10 exist, 7 unused | Design system exists on paper only |
| Poppins / Inter | declared in Tailwind, never loaded | Typography in the mockup does not render |
| Chart library | none | Rating Progress / Rating History charts unimplemented |
| Layout shell | `layouts/default.vue`, 375 lines | Sidebar + mobile bottom nav already close to the mockup |

Top hex offenders (occurrences): `#6B7B75` 364, `#1E2E2A` 217, `#A6ABA7` 170,
`#4DB175` 303 combined, `#3A5750` 151, `#0B0D09` 143, `#2E4540` 138.

**Conclusion:** the colors are already consistent — roughly 12 values cover 95% of
usage. That makes a mechanical codemod to tokens viable and low-risk.

---

## 3. Part A — Theming architecture

### 3.1 Token layer

Colors are declared once as CSS custom properties in `assets/css/tokens.css`,
as **space-separated RGB channels** so Tailwind can still apply opacity modifiers
(`bg-surface/50`) against them.

```css
:root {                 /* light is the base declaration */
  --dnl-canvas: 247 249 248;
  --dnl-surface: 255 255 255;
}
.dark {                 /* dark overrides only the tokens that differ */
  --dnl-canvas: 11 13 9;
  --dnl-surface: 30 46 42;
}
```

Tailwind consumes them semantically:

```ts
colors: {
  canvas:  'rgb(var(--dnl-canvas) / <alpha-value>)',
  surface: 'rgb(var(--dnl-surface) / <alpha-value>)'
}
```

**Why CSS variables and not Tailwind's `dark:` variant on every element:**
`dark:` would require touching all ~1,900 sites *and* would permanently double
every class string. Variables mean each element declares intent once
(`bg-surface`), and the theme switch is a single class on `<html>`.

### 3.2 Token table

Light values derive from the light mockup's palette strip
(#0B8D4D / #25AF6B / #A7E3C1 / #E8F7EE / #F2F4F7 / #FFFFFF); dark values are the
palette already in the codebase.

| Token | Role | Dark | Light | Justification |
| --- | --- | --- | --- | --- |
| `canvas` | page canvas | `#0B0D09` | `#F7F9F8` | The light mockup's canvas is near-white, not pure white — pure white beside white cards erases card separation |
| `surface` | card / panel | `#1E2E2A` | `#FFFFFF` | Cards must read as raised; dark raises with lighter green, light raises with pure white + border |
| `surface-2` | sidebar, secondary fill | `#2E4540` | `#F2F4F7` | Direct from both palette strips |
| `surface-3` | hover / tinted fill | `#3A5750` | `#E8F7EE` | The light mockup's "Background #E8F7EE" is used as a *tint*, not the canvas |
| `border` | hairline | `#2E4540` | `#E3E8E5` | Dark separates by lightening, light by darkening |
| `border-strong` | input border, focus track | `#3A5750` | `#CBD5D0` | Inputs need a visible resting border in light mode |
| `primary` | brand action | `#4DB175` | `#0A7F45` | #4DB175 on white is ~2.3:1 and fails AA. The mockup swatch #0B8D4D measures 4.03:1 — still short — so the token is the nearest darker hue that clears both roles: 4.80:1 as text, 5.08:1 under a white label |
| `primary-hover` | hover | `#5FC287` | `#0FA55B` | Dark lightens on hover, light brightens — the direction flips per theme, which only a token can express |
| `primary-soft` | brand wash (active nav, highlight row) | `#4DB175` @ 20% | `#E8F7EE` | An alpha wash reads correctly over dark; over white it reads washed out, so light uses a solid tint |
| `on-primary` | text on brand fill | `#06170F` | `#FFFFFF` | **Deviates from the mockup in dark mode.** No single green can both read as text on #0B0D09 (needs luminance ≥0.195) and carry white at 4.5:1 (needs ≤0.183). Keeping #4DB175 vivid with a dark label gives 6.9:1; the mockup white label is 2.7:1. Material 3 uses the same light-fill/dark-label pattern in dark themes |
| `fg` | primary text | `#FFFFFF` | `#0F1A15` | Replaces the 472 `text-white` uses that actually mean "body text" |
| `fg-secondary` | secondary text | `#A6ABA7` | `#4F5D57` | From both palette strips |
| `fg-muted` | captions, meta | `#8A9A94` | `#63706A` | **Dark raised from `#6B7B75`** (4.0:1, failing AA at the 12px caption size the mockup uses) to 6.6:1. Light lowered from #77857F (3.65:1) to 4.90:1 |
| `accent` | highlight (your row, accent button) | `#B5B9F0` | `#A7E3C1` | The two mockups deliberately differ — periwinkle on dark, mint on light. The token absorbs the divergence |
| `on-accent` | text on accent | `#0B0D09` | `#0B3B24` | Both accents are light fills and need dark text |
| `warning` | Pending pill, gold | `#F5A623` | `#B45309` text / `#F5A623` fill | Amber text on white fails AA; fills keep brand amber with dark text |
| `danger` | Disputed, Dispute button, loss | `#FF6B6B` | `#DC2626` | Same contrast reason |
| `info` | info toast | `#60A5FA` | `#2563EB` | Dark raised from #3B82F6, which is 3.86:1 on a dark card |
| `rating-gold` | 1900+ | `#F5A623` | `#B7791F` | Rating badges must stay legible on both canvases |
| `rating-silver` | 1700–1899 | `#C0C0C0` | `#78716C` | `#C0C0C0` on white is ~1.6:1 |
| `rating-bronze` | 1400–1699 | `#CD7F32` | `#9A5B22` | |
| `rating-iron` | <1400 | `#8B8B8B` | `#6B6B6B` | |
| `switch-track` / `switch-thumb` | theme switch | `#14201C` / `#5A7A70` | `#E3E8E5` / `#FFFFFF` | The thumb must read as raised above the track, which is opposite directions per theme. Reusing surface/surface-2 gave a 1.05:1 thumb in light mode that vanished at the control's real 56×32px size |
| `gradient-from` / `gradient-to` | stat/hero card gradients | `#1a2a24` / `#14201c` | `#FFFFFF` / `#F2F4F7` | The 39 gradient usages are decorative depth; light mode expresses depth with a near-flat gradient plus shadow |
| `shadow-card` | elevation | `0 2px 8px rgb(0 0 0 / .3)` | `0 1px 3px rgb(16 24 20 / .08)` | A dark-tuned shadow is invisible on dark and crushing on light |

### 3.3 The `text-white` problem

472 occurrences, three distinct meanings. A blind replace would break every
button. The codemod classifies by the element's own background class:

| Context | Replace with | Share (est.) |
| --- | --- | --- |
| Element also carries `bg-[#4DB175]`, `bg-primary`, or a brand gradient | `text-on-primary` (white on light, near-black on dark — see the §3.2 note) | ~15% |
| Element carries a **bright** fill — `bg-rating-*`, `bg-warning-fill`, `bg-accent` | `text-on-accent` (dark label; white on `rating-bronze` is 2.6:1 in dark) | ~1% |
| Element carries a deep red — `bg-danger`, `bg-red-*` | keep literal `text-white` | ~1% |
| Everything else — headings, stat numbers, body copy | `text-fg` | ~80% |

Any occurrence the codemod cannot classify with certainty is **left untouched and
written to a report file** for manual review. No silent guesses.

### 3.4 Theme selection and persistence

Three-state preference: `light` (**default**) · `dark` · `system`.

**Decision (2026-08-22):** new users start in **light**; dark is opt-in. `system`
remains selectable for users who want OS-following behavior. Because `:root` holds
the light values, the default costs zero work at first paint — no class, no script.

- `composables/useTheme.ts` exposes `theme` (preference), `resolvedTheme`
  (`light`/`dark` after resolving `system`), and `setTheme()`.
- Persisted in a **cookie** (`dnl-theme`) via `useCookie`, **not** `localStorage`.
  Nuxt renders on the server; `localStorage` is unreadable there, so the server
  would emit the wrong `<html>` class and the page would flash the wrong theme on
  every reload. A cookie is readable during SSR.
- `system` resolution needs the client (`prefers-color-scheme`). For that state
  only, a **small blocking inline script** in `app.head` sets the class before
  first paint. This is the standard no-FOUC pattern and the only inline script
  we add.
- `<meta name="color-scheme">` is set to match, so native controls (scrollbars,
  date pickers, autofill) follow the theme.
- The `main.css` rule that force-inverts native date-picker glyphs must become
  theme-conditional — under light mode, inverting makes them invisible again.

### 3.5 Where the user changes it

| Surface | Control | Justification |
| --- | --- | --- |
| `pages/settings/index.vue` → new **Appearance** section | 3-way segmented control: System / Light / Dark, with a live preview swatch | Settings is where a durable preference belongs, and the mockup's sidebar already lists Settings |
| Desktop sidebar footer, beside the user card | `UiThemeToggle` — sun/moon sliding switch, sun left, moon right | The mockup reserves that footer strip for user-scoped controls, and a one-press switch is what users actually reach for. A slider shows current state and destination at once, which a cycling icon button cannot |
| Mobile Profile screen header | `UiThemeToggle size="sm"` | Mobile has no persistent sidebar; the mockup's Profile screen is the user-scoped surface |

**The quick switch is binary by design.** Two positions cannot express the third
`system` preference, so the switch resolves against what is *on screen* — a
`system` user seeing dark gets light on the first press rather than a no-op — and
`system` stays reachable from the Appearance section in Settings. `useTheme()`
keeps all three states regardless of which control is driving it.

Transitions on background/color are capped at `150ms` and **disabled** under
`prefers-reduced-motion`.

### 3.6 Migration mechanics

1. Add `tokens.css` plus the semantic Tailwind color names. **Old hex classes keep
   working** — nothing breaks mid-migration.
2. Run the codemod (`scripts/theme-codemod.mjs`) file by file, committing in
   batches by route group so any regression is bisectable.
3. Add a CI guard that **fails the build on any new `-[#hex]` class** in
   `pages/`, `components/`, `layouts/`. Without it the codebase re-drifts within weeks.
4. Playwright screenshots both themes for each critical route; a Vitest test
   asserts every token declared in `:root` also exists in `.dark`.

---

## 4. Part B — Design-system components (mockup right-hand panel)

Every item in the mockup's design-system panel becomes a real component in
`components/ui/`. Seven of these files already exist but are unused — they get
rewritten against tokens and then **adopted** across the pages. A design system
nobody imports is not a design system.

| Mockup panel item | Component | Spec detail from the mockup | Justification |
| --- | --- | --- | --- |
| Heading 1/2/3 | `assets/css/typography.css` + Tailwind sizes | Poppins 32 Bold / 24 SemiBold / 20 SemiBold | Already in the Tailwind config but the font never loads — self-host Poppins + Inter in `public/fonts` with `font-display: swap`. Self-hosted rather than the Google CDN to avoid a third-party request on every page load and keep the app portable |
| Body 1/2/Caption | same | Inter 16 / 14 / 12 Regular | The two-family split is deliberate: Poppins for identity, Inter for dense tables |
| Primary Button | `UiButton variant="primary"` | solid brand fill, white label, 8px radius | |
| Secondary Button | `UiButton variant="secondary"` | outlined, transparent fill | Used for Share / View Stats on Match Details |
| Accent Button | `UiButton variant="accent"` | accent fill, dark label | Non-destructive secondary CTAs |
| — (implied) | `UiButton variant="danger"` | red outline | The mockup's **Dispute** button needs its own variant, not an ad-hoc class |
| Status Pills | `UiStatusPill` | Pending (amber) · Verified (green) · Disputed (red) · Draft (grey), 6px radius | Status is the most repeated signal across Matches, Events and Clubs — it must be one component |
| Rating Badges | `UiRatingBadge` | Gold 1900+ · Silver 1700–1899 · Bronze 1400–1699 · Iron <1400, each with a medal glyph | Thresholds belong in one exported constant, not scattered `v-if` chains |
| Input Field | `UiInput` | leading icon slot, placeholder "Search players…" | The mockup shows leading-icon inputs on Rankings, Submit Match and Clubs |
| Table Sample | `UiDataTable` | header row, no zebra, right-aligned numerics, trend column | New component. Rankings / Members / Matches all repeat this shape |
| Player Card | `cards/PlayerCard.vue` | avatar, name, rating, city, Follow button | |
| Club Card | `cards/ClubCard.vue` | logo, name, "256 Members", "#3 Club Rank" | The mockup adds a **club rank** line the current card lacks |
| Event Card | `cards/EventCard.vue` | title, date range, venue, status pill; cover image on mobile | Mobile Events shows a cover-image variant, the club page a compact one — one component with a `dense` prop |
| Icons row | `components/ui/Icon.vue` + sprite | home, trophy, paddle, people, calendar, bell, chat, settings, search | The layout currently inlines ~15 raw `<svg>` blocks; one registry kills the duplication |
| Loading state | `UiSkeleton` | bars shaped like the content they replace | |
| Empty state | `UiEmptyState` | paddle glyph, "No matches yet", "Play your first match to start your journey!", **Submit Match** CTA | The mockup's empty states always carry an action — copy and CTA are required props, not optional |
| Error state | `UiErrorState` | error glyph, "Something went wrong", "Please try again later.", **Try Again** | New component; the retry handler is a required prop |
| Toasts | `UiToast` + `useToast()` | success "Match submitted successfully!" · info "Rating updated! +12 points" · error "Failed to submit match" | Three variants with leading icons, driven by a queue composable |
| Modal | `UiModal` | "Confirm Verification", body question, Cancel (secondary) + Confirm (primary) | Focus trap, ESC to close, backdrop click, `aria-modal`. The mockup implies a confirm pattern for every irreversible action |

---

## 5. Part C — Screen-by-screen parity

**Action** legend: `NEW` build from scratch · `EXTEND` add to an existing page ·
`RESTYLE` markup exists, needs token/layout work.

### 5.1 Global shell (`layouts/default.vue`)

| Mockup detail | Action | Justification |
| --- | --- | --- |
| Desktop left sidebar: logo, nav, bottom utility group | RESTYLE | Already exists and matches; needs tokens + `UiIcon` |
| Sidebar **user card at the footer**: avatar, name, rating 1854, "Advanced" tier | EXTEND | The mockup pins identity and current rating to the shell so the user's standing is visible on every screen — that is the product's core loop |
| Sidebar nav: Dashboard, Rankings, Matches, Clubs, Events, Feed, Achievements, Stats | EXTEND | The current nav has 10 player items and no **Stats**; the mockup's set is tighter. Reconcile by keeping account-mode switching while aligning labels and order |
| Bottom utility group: Notifications, **Messages**, Settings | EXTEND | Messages is outside MVP scope (`03-MVP-SCOPE.md`) — render only if the messaging backlog item is in scope, otherwise omit rather than ship a dead link |
| Mobile top bar: hamburger, wordmark, bell | RESTYLE | Exists |
| Mobile bottom tab bar: Home, Rankings, **Matches (raised FAB)**, Events, Profile | RESTYLE | Exists and the raised centre FAB already matches. Add `env(safe-area-inset-bottom)` padding — currently missing, so the bar sits under the iOS home indicator |
| Active state = brand text on a soft brand background | RESTYLE | Already the behavior; move to the `primary-soft` token |

### 5.2 Dashboard — desktop 1 / mobile 1

| Mockup detail | Action | Justification |
| --- | --- | --- |
| "Welcome back, John Doe! 👋" / "Let's climb the ladder today." | EXTEND | Desktop copy; mobile uses the shorter "Hello, John! 👋 / Keep climbing!" — same component, responsive copy |
| **Share** and **Get the App** buttons, top right | NEW | Share drives the growth loop; "Get the App" is the Flutter client hand-off named in `CLAUDE.md` §2. Gate it behind a config flag until that app exists |
| **RATING** card: 1854, "Advanced", "↑12 from last 7 days" | EXTEND | Delta-over-7-days is the mockup's chosen unit of progress; it must come from real rating history, not a computed guess |
| **RANK** card: #12, Cebu City, "Top 2%", "PH Singles" + trophy art | EXTEND | The percentile and scope label tell the user *which* ladder the rank belongs to — without it the number is ambiguous once doubles and regional ladders exist |
| **Rating Progress** chart, range toggle 7D · 1M · 3M · 6M · 1Y · ALL | NEW | The single largest missing piece. See §5.8 |
| **Recent Activity**, "View all (3)", rows of avatar + sentence + relative time | EXTEND | The mockup mixes the user's own events and others' into one stream, matching the existing feed domain |
| Mobile: **Pending Actions** block (Verify Match · 2h, Club Join Request · 1d) | NEW | Mobile replaces desktop's Recent Activity with **actionable** items. On mobile the user is triaging, not browsing — surfacing the two blocking actions is the difference between a match getting rated today and next week |

### 5.3 Rankings — desktop 2 / mobile 2

| Mockup detail | Action | Justification |
| --- | --- | --- |
| Title + "The official rankings of pickleball players in the Philippines." | RESTYLE | Positioning statement; sets the authority tone the product is built on |
| **Singles / Doubles** tabs | EXTEND | Two separate ladders per `16-RANKINGS-SPECIFICATION.md` |
| **All Regions** and **Cebu City** dropdowns + **Search players** input | EXTEND | Three-axis filtering, URL-query-backed so a filtered ranking is shareable |
| **Podium**: #2 left, #1 centre raised with crown, #3 right — avatar, name, rating | NEW | Top-3 celebration is the emotional payoff of a ranking page; a flat table buries it |
| Table columns `#`, Player, Location, Rating, **Trend** (↑/↓, colored) | RESTYLE | Trend is the retention hook — it turns a static list into movement |
| **Current user's row highlighted** (accent fill) | NEW | "Where am I?" is the first question every user asks on a rankings page. Also auto-scroll to self when the user falls outside page 1 |
| Pagination `1 2 3 … 25` | EXTEND | Server-side paging with a deep-linkable page param |
| Mobile: podium + table, region dropdown only | RESTYLE | Mobile drops the search/region/skill triple to one dropdown — screen budget |

### 5.4 Player Profile — desktop 3 / mobile 8

| Mockup detail | Action | Justification |
| --- | --- | --- |
| Back link | EXTEND | |
| Avatar, name + **verified check**, location, "Advanced Player" tier | RESTYLE | `VerifiedBadge.vue` already exists |
| **Follow** button + overflow `…` menu | EXTEND | The overflow holds Report / Block / Share — low-frequency actions kept out of the primary row |
| Rating card: 1854, "RATING", "↑12 from last 7 days" | EXTEND | Mirrors the dashboard card exactly, so it is the same component with no divergence |
| Stat strip: **Matches 124 · Win Rate 68% · W-L 84-40 · Titles 8** | EXTEND | Four metrics in a fixed order. `Titles` requires tournament results from the event domain |
| Tabs: Overview · Matches · Stats · Achievements · Activity | EXTEND | Each tab must be a route query (`?tab=`) so tabs are linkable and the back button works |
| **Rating History** chart with the same range toggles | NEW | The same chart component as the dashboard |
| Side panel: **Favorite Shot** (Dink), **Playing Style** (Defensive Baseline), **Skill Level** (4.0–4.5) | EXTEND | Self-declared identity fields — what makes a profile feel like a person rather than a row. Each needs profile-edit support |
| **Recent Matches**: opponent avatar + name, "21-18, 21-16", Win/Loss pill, relative time, "View all matches" | RESTYLE | The `21-18, 21-16` comma-separated-games string becomes the canonical score format across the app |
| Mobile: same, plus **Edit Profile** on your own profile | EXTEND | Own-profile vs other-profile is a prop on one page, not two pages |

### 5.5 Club Page — desktop 4 / mobile 5

| Mockup detail | Action | Justification |
| --- | --- | --- |
| **Cover photo** with the club logo overlaid | NEW | Clubs are identity-heavy; a cover image is the difference between a directory entry and a home |
| Name, location, "Est. 2022", one-line description | EXTEND | |
| **Join Club** primary button + `…` overflow | EXTEND | Overflow: Share, Report, Leave (for members) |
| Tabs: About · Members · Events · Announcements | EXTEND | Mobile shows only About · Events · Members — Announcements folds into About on small screens |
| About: checkmark bullets ("All skill levels welcome", "Weekly socials & tournaments", "Focused on sportsmanship and fun") | NEW | Structured club *values* rather than free text — scannable and comparable when browsing clubs |
| **Upcoming Events**: two event cards side by side + "View all events" | EXTEND | The two cards carry different status pills (Registration Open vs Open Play), which proves the pill is data-driven |
| **Recent Announcements**: avatar, title, body, relative time | EXTEND | `25-CLUB-ANNOUNCEMENTS-SPECIFICATION.md` exists; this is the card treatment |
| Mobile: "256 Members · #3 Rank" beneath the name | NEW | Club rank is new derived data — a club-level ranking computed from member ratings |

### 5.6 Match Details — desktop 5

| Mockup detail | Action | Justification |
| --- | --- | --- |
| Back link + **Verified** pill top right | RESTYLE | Verification status is the page's headline fact |
| Header: city, date/time, venue | RESTYLE | |
| **Versus block**: two avatars, names, ratings, game scores `21-18 / 21-16`, series `2-0` | RESTYLE | Symmetric layout with the winner emphasized. On mobile it stacks vertically with the score column centred |
| Tabs: Timeline · Overview · Stats · Comments | EXTEND | |
| **Timeline**: Match Submitted (by X) → Under Review (club staff) → Verified by club (admin) → Ratings Updated (+12 / −12), each timestamped | NEW | **The most important UX element in the mockups.** Match verification is the trust mechanism of the whole platform (`12-MATCH-VERIFICATION-SPECIFICATION.md`); an auditable, visible chain of who did what and when is what makes a disputed result resolvable |
| Ratings Updated shows **both** deltas (John +12, Mark −12) | NEW | Zero-sum transparency — users must be able to see the rating engine is symmetric, which pre-empts most disputes |
| Actions: **Share** (secondary), **Dispute** (danger outline), **View Stats** (secondary) | EXTEND | Dispute is danger-*outline*, not danger-solid: legitimate, but it should not be the visually easiest action on the page |

### 5.7 Remaining mobile screens

| Screen | Mockup detail | Action | Justification |
| --- | --- | --- | --- |
| **3. Matches** | Filter chips: All · Pending · Verified · Disputed | EXTEND | Status filtering is how a player finds the match blocking their rating update |
| | Rows: opponent, score, status pill, relative time | RESTYLE | |
| **4. Submit Match** | Singles / Doubles segmented control | EXTEND | |
| | **Opponent** field with player lookup | RESTYLE | |
| | **Date & Time** side-by-side pickers | RESTYLE | Native pickers; the theme-conditional glyph fix from §3.4 applies here |
| | **Score steppers**: per game, `−` / value / `+` for you and the opponent | NEW | Typing scores on a phone, courtside, is the app's highest-friction moment. Steppers make it thumb-operable in seconds and eliminate invalid input at the source |
| | Full-width **Submit Match** CTA near the bottom | RESTYLE | |
| **6. Events** | **All Status** / **All Regions** dropdowns | EXTEND | |
| | Event cards with **cover image**, title, date, venue, status pill | EXTEND | Image-led cards because events are discovered visually |
| **7. Notifications** | "Mark all read" | EXTEND | |
| | Grouped headers **Today** / **Yesterday** | NEW | Recency grouping beats raw timestamps for triage |
| | Row: type icon, sentence, relative time, **unread dot** | RESTYLE | |
| | Types shown: match verified, rank movement, club approval, new follower, tournament reminder | EXTEND | All five must exist in `21-NOTIFICATION-SPECIFICATION.md` |

### 5.8 Charts (Rating Progress / Rating History)

Appears on Dashboard (desktop + mobile) and Player Profile (desktop + mobile).

- **No new dependency.** Build `UiLineChart.vue` as inline SVG: polyline, area
  fill, gridlines, axis labels, hover dot. `CLAUDE.md` §9 forbids unjustified
  libraries, the mockup's chart is a single smoothed series with no zoom or brush,
  and a charting library would add 40–90KB for one shape. Inline SVG also inherits
  the theme tokens for free.
- The range toggle `7D · 1M · 3M · 6M · 1Y · ALL` maps to an API range parameter —
  aggregation happens server-side rather than by fetching all history and slicing.
- Accessibility: the chart renders an adjacent visually-hidden `<table>` of the
  same series, so it is not a data black hole for screen readers.
- Empty state: fewer than two data points renders "Play a match to start your
  rating history", not a broken axis.

---

## 6. Part D — Responsive strategy

Requirement: **mobile-first authoring, full use of wide screens.**

| Breakpoint | Shell | Content |
| --- | --- | --- |
| `<640` | top bar + bottom tab bar | single column, 16px gutters |
| `640–1023` | same | 2-column card grids wherever the mockup pairs cards |
| `≥1024` | fixed 208px sidebar, no bottom bar | multi-column: Dashboard 2-up stat cards beside the chart; Profile main + side panel |
| `≥1536` | sidebar | `.page-shell` widens to 1536px (already implemented in `main.css`) |

Rules:

1. Author the mobile layout first in every component, then add `md:`/`lg:` to expand.
2. **No per-page `max-w-*`.** They are why a 1080p window currently renders a
   ~900px column — `.page-shell` owns width.
3. Wide content (brackets, rankings table) scrolls inside `.scroll-x`, never the
   document (already implemented).
4. Touch targets ≥44px; the bottom bar respects `env(safe-area-inset-bottom)`.
5. Desktop is not "mobile stretched": Player Profile gains its side panel, the
   Club Page shows 2-up event cards, the Dashboard puts stat cards beside the chart.

---

## 7. Part E — Cross-cutting UX rules

| Rule | Detail | Justification |
| --- | --- | --- |
| Four states, always | Every data surface implements loading (skeleton), empty (icon + copy + CTA), error (icon + copy + Try Again), success | `CLAUDE.md` §8 requires it, and the mockup panel specifies all three non-success states |
| Skeletons, not spinners | The skeleton matches the final layout | Prevents layout shift; the mockup shows bar skeletons, not spinners |
| Optimistic + toast | Follow, mark-read and join-club apply optimistically, then toast | The mockup's toasts ("Rating updated! +12 points") are outcome confirmations |
| Confirm the irreversible | `UiModal` for verify, dispute, leave club, delete | The mockup's "Confirm Verification" modal establishes the pattern |
| Relative time everywhere | "2h ago", "1d ago"; absolute on hover/tap | Every timestamp in the mockups is relative |
| Focus visible | 2px `primary` ring on every interactive element, both themes | Keyboard users; the mockup's inputs already show a focus treatment |
| Reduced motion | All animation gated on `prefers-reduced-motion` | The rating-up/down and achievement-unlock animations are vestibular triggers |
| Contrast | Every token pair validated ≥4.5:1 (≥3:1 at ≥24px) in both themes | See §3.2 — three current colors fail |
| Copy tone | Second person, encouraging, no jargon ("Keep climbing!", "Play your first match to start your journey!") | Taken verbatim from the mockups; it is the product's voice |

---

## 8. Phasing

Each phase is independently shippable and leaves the app working.

### Phase 1 — Token foundation
- [x] `assets/css/tokens.css` with the §3.2 table: light in `:root`, dark in `.dark`
- [x] `tailwind.config.ts` rewritten to semantic `rgb(var(--…))` colors
- [x] `composables/useTheme.ts` + cookie persistence + no-FOUC inline script + `color-scheme` meta
- [x] Theme-conditional native date/time picker glyph fix in `main.css`
- [x] Self-hosted Poppins + Inter in `public/fonts` with `@font-face` and `font-display: swap`
- [x] Vitest: every `:root` token has a `.dark` counterpart; contrast assertions on the pairs
- [x] `pages/dev/theme.vue` — dev-only token preview so the layer is reviewable before the codemod (404s in production)

### Phase 2 — Codemod
- [x] `scripts/theme-codemod.mjs` — hex → token, with the §3.3 `text-white` classifier
- [x] Run across all 59 files; unclassified sites reported, not guessed
- [x] CI guard: `npm run check:tokens` fails on any new `-[#hex]` class or stray `text-white`
- [ ] Playwright dual-theme screenshots for the critical routes

### Phase 3 — Design-system components
- [x] Rewrite and adopt `UiButton` (primary/secondary/accent/danger/ghost), `UiInput`, `UiModal`, `UiSkeleton`, `UiEmptyState`, `UiErrorState`, `UiToaster` + `useToast()`, `UiStatusPill`, `UiRatingBadge`, `UiTrendIndicator`
- [x] New: `UiDataTable`, `UiTabs`, `UiSegmented`, `UiSelect`, `UiAvatar`, `UiIcon` (registry), `UiLineChart`, `UiPodium`, `UiStepper`
- [x] Replace the ~15 inline `<svg>` blocks in `layouts/default.vue` with `UiIcon`
- [x] Component unit tests (26) — Vitest now mounts SFCs via `@vitejs/plugin-vue`
- [x] Dev-only component gallery rendering every variant in both themes (`/dev/components`)

### Phase 4 — Shell and responsive
- [x] Sidebar user card (avatar / name / rating / tier)
- [x] Nav reconciliation with the mockup; safe-area inset on the bottom bar
- [ ] Remove per-page `max-w-*`, adopt `.page-shell` everywhere
- [x] `components/ui/ThemeToggle.vue` — sun/moon sliding switch, `role="switch"`, reduced-motion aware
- [x] Appearance settings section (3-way System/Light/Dark), toggle mounted in the sidebar footer, mobile drawer and public header

### Phase 5 — Screen parity (one backlog item per screen)
- [ ] Dashboard (desktop + mobile: Pending Actions, chart, Share / Get the App)
- [x] Rankings (podium, **real** trend column, self-row highlight, filters, **real** pagination)
- [x] Player Profile (route-query tabs, rating history line chart, recent matches)
- [x] Club Page (generated cover, overlapping logo) — values bullets and club rank still open, see §11
- [x] Match Details (verification timeline with named actors and symmetric rating deltas)
- [x] Matches list (new page, status chips), Submit Match (score steppers), Events (status filter + image-led cards), Notifications (day grouping)

### Phase 6 — Verification
- [x] Playwright: 39 tests covering dual-theme behaviour, token resolution and persistence
- [x] Axe (wcag2a/2aa/21a/21aa) over every public route x both themes, plus the whole component gallery — zero serious violations
- [x] `vue-tsc`, lint and build clean
- [x] `docs/PROJECT-STATUS.md` updated

---

## 9. Open decisions

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | Default theme for new users | **Resolved 2026-08-22 — light by default**, dark opt-in, `system` selectable |
| 2 | Light-mode accent | Follow the mockups' divergence (periwinkle dark / mint light) rather than forcing one hue |
| 3 | "Messages" nav item | Omit until the messaging backlog item is in scope — no dead links |
| 4 | "Get the App" button | Ship behind a config flag; the Flutter client does not exist yet |
| 5 | Club rank ("#3 Club Rank") | A new derived metric needing its own backlog item and a defined formula, not an invented one (`CLAUDE.md` §7) |
| 6 | "Titles: 8" on the profile | Sourced from tournament results; blocked on tournament result finalization |
| 7 | Dark-mode primary button label | **Shipped as near-black** for 6.9:1. The mockup shows white at 2.7:1, which fails AA and cannot be fixed without giving up the vivid green. One-token reversal if brand fidelity wins |

---

## 10. Definition of done for this spec

Per `CLAUDE.md` §8, each phase item is complete only when tokens and components are
typed, unit tests cover logic, Playwright covers the critical journey in **both
themes**, contrast is validated, `vue-tsc` and the build pass, and
`docs/PROJECT-STATUS.md` is updated.

---

## 11. Known gaps after Phases 1–6

These are deliberately unbuilt, not overlooked.

| Gap | Why it is not done |
| --- | --- |
| **Cover photos and club logos** | No `cover_image_url`, `logo_url` or any image column exists on events, clubs, or anywhere in the schema. Real covers need a Liquibase changeset, a Supabase Storage bucket and an upload flow — a feature, not a styling pass. `UiCoverArt` generates a stable gradient and monogram from the entity name meanwhile, and already accepts a `src` for when the column lands. |
| **Club rank ("#3 Club Rank")** | A derived metric with no defined formula. CLAUDE.md §7 forbids inventing production business rules; this needs a decision and its own backlog item. |
| **Club "values" bullets** | The mockup's checkmark list ("All skill levels welcome", …) is structured data the club record does not hold. Needs a column or related table, so it is a schema change rather than markup. |
| **"Titles: 8" on the profile** | Depends on tournament results being finalised. |
| **"Get the App"** | The Flutter client does not exist. |
| **"Messages" nav item** | Messaging is outside MVP scope; a nav item that goes nowhere is worse than none. |
| **Authenticated screens are visually unverified** | Headless Chromium cannot sign in and no seeded account with a known password exists. Dashboard, Profile, Match Details, Submit Match, Matches, Notifications and Club Page are typecheck/test/build clean and were reviewed by reading, but have not been *seen* rendered. This is the largest remaining risk. |
| ~~Events status filter is client-side~~ | **Closed.** The endpoint already accepted `status` and the repository already filtered on it; the UI now sends the param. |
| ~~Rankings search is client-side~~ | **Closed.** `q` added through DTO → repository (`ilike` on both the page query and the count) → controller → debounced input. Verified live: `q=claude` returns 2 of 5 with a matching total. |
