---
name: DinkAndLadder
description: A calm, measured record for Philippine pickleball — verified ratings, clubs that run play, and a token system built to clear AA in both themes.
colors:
  canvas: "#F7F9F8"
  surface: "#FFFFFF"
  surface-2: "#F2F4F7"
  surface-3: "#E8F7EE"
  border: "#E3E8E5"
  border-strong: "#CBD5D0"
  fg: "#0F1A15"
  fg-secondary: "#4F5D57"
  fg-muted: "#63706A"
  primary: "#0A7F45"
  primary-hover: "#0FA55B"
  primary-soft: "#E8F7EE"
  on-primary: "#FFFFFF"
  accent: "#A7E3C1"
  on-accent: "#0B3B24"
  success: "#0A7F45"
  warning: "#B45309"
  warning-fill: "#F5A623"
  danger: "#D01E1E"
  info: "#2563EB"
  coach: "#0369A1"
  ranked: "#6D28D9"
  rating-gold: "#B7791F"
  rating-silver: "#78716C"
  rating-bronze: "#9A5B22"
  rating-iron: "#6B6B6B"
  on-art: "#17233A"
  on-art-muted: "#4A5568"
  plinth: "#6FBF95"
  canvas-dark: "#0B0D09"
  surface-dark: "#1E2E2A"
  surface-2-dark: "#2E4540"
  border-dark: "#2E4540"
  fg-dark: "#FFFFFF"
  fg-secondary-dark: "#B6BBB7"
  fg-muted-dark: "#A2B2AC"
  primary-dark: "#4DB175"
  primary-soft-dark: "#1A3325"
  on-primary-dark: "#06170F"
  accent-dark: "#B5B9F0"
typography:
  display:
    fontFamily: "Lexend, Inter, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 6vw, 3.75rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  heading-1:
    fontFamily: "Lexend, Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
  heading-2:
    fontFamily: "Lexend, Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.3
  heading-3:
    fontFamily: "Lexend, Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.4
  body-1:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-2:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.1em"
  stat-xl:
    fontFamily: "Lexend, Inter, system-ui, sans-serif"
    fontSize: "4rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  stat-court:
    fontFamily: "Lexend, Inter, system-ui, sans-serif"
    fontSize: "5rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  stat-md:
    fontFamily: "Lexend, Inter, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.1
    fontFeature: "tnum"
rounded:
  badge: "6px"
  button: "8px"
  card: "12px"
  pill: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.5rem"
  band: "3.5rem"
  band-lg: "5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-2}"
    rounded: "{rounded.button}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-lg:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-1}"
    rounded: "{rounded.button}"
    padding: "12px 24px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    typography: "{typography.body-2}"
    rounded: "{rounded.button}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.fg}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg-secondary}"
    typography: "{typography.body-2}"
    rounded: "{rounded.button}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.body-2}"
    rounded: "{rounded.button}"
    padding: "8px 16px"
  input-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    typography: "{typography.body-2}"
    rounded: "{rounded.button}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "16px"
  status-pill:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.success}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  ledger-row:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    typography: "{typography.body-1}"
    rounded: "0"
    padding: "20px 0"
---

# Design System: DinkAndLadder

## Overview

**Creative North Star: "The Ruled Ledger and the Lit Court"**

DinkAndLadder is a record before it is an app. A rating here is a number two
people agreed on, and the visual system's whole job is to look like something
you could point at in an argument and win. That means measured, quiet, and
legible before it means expressive: flat inks, a single brand green spent
sparingly, tabular figures everywhere a number is a fact, and a hairline
structure you can follow with a finger. The system is warm rather than clinical
— the green is a court green, the light canvas is off-white rather than glaring,
the dark canvas is near-black rather than blue-grey — but it never raises its
voice.

Two compositions live in the shipped build, and both are current. The **card
composition** is the app: roughly forty-eight product surfaces built from
12px-radius panels on an off-white canvas, separated by a real shadow because a
white card on a #F7F9F8 canvas separates by only 1.06:1 and the shadow is doing
all of the work. The **ruled-ledger composition** is one surface — the landing
page — built entirely from horizontal rules at three declared weights, with no
card, no panel, no tile and no gradient anywhere on it. The ledger is not a
replacement for the cards and nothing has deprecated them; it is recorded here
so a second marketing or record-shaped surface can be built in the same
language deliberately rather than by accident.

What is genuinely app-wide, and binding on both compositions: the token system
(every color is a semantic name backed by a per-theme custom property, never a
literal hex in a template), the light/dark peerage, the AA contrast floor, the
Lexend/Inter pairing, and the type ramp. Light is the product default and needs
no class and no script to render correctly. Dark is not an afterthought skin: it
reaches the same contrast by opposite routes, lifting surfaces by lightness
where light mode leans on shadow, and labelling saturated fills with dark ink
where light mode labels them white.

**Key Characteristics:**
- Semantic tokens only; no literal color in any template.
- Light and dark are peers, each measured to WCAG AA independently.
- One brand green, spent on what is confirmed or actionable.
- Tabular figures on every rating, score, rank and date.
- Humanist display type at 500/600, never 700 in headings.
- Two live compositions: layered cards (the app), ruled hairlines (the landing page).

## Colors

A calm court-green identity over a warm neutral ground, with every value chosen
against a measured contrast ratio rather than picked from a mockup.

### Primary
- **Court Green** (`#0A7F45` light / `#4DB175` dark): the brand, and the only
  hue in the system that means *confirmed or actionable*. Primary buttons,
  verified state, the confirmed step of the verification loop, active
  navigation. The two themes carry genuinely different greens because one green
  cannot clear AA in both roles: the dark theme's green is only ~2.3:1 on white,
  and in dark mode no single green can both read as text on a near-black canvas
  and carry white text on a fill — so dark mode labels its green fills with
  near-black ink (`on-primary` `#06170F`), the same light-surface/dark-label
  pattern Material 3 uses.
- **Green Hover** (`#0FA55B` light / `#5FC287` dark): the direction of the hover
  flips per theme — light brightens, dark lightens — which is exactly why it is
  a token and not a filter.
- **Mint Wash** (`primary-soft`, `#E8F7EE` light / `#1A3325` dark): the solid
  tint behind an active nav item or a highlighted rankings row. A solid, never
  an alpha wash; alpha read washed out on white, and the dark value is dark
  enough that danger text inside a highlighted row still clears AA.

### Secondary
- **Court Mint / Periwinkle** (`accent`, `#A7E3C1` light / `#B5B9F0` dark): the
  accent deliberately changes family between themes. It carries decorative fills
  and the accent button; it is never a substitute for the primary green on an
  action.

### Tertiary
- **Coach Sky** (`#0369A1` light / `#7DD3FC` dark) and **Ranked Violet**
  (`#6D28D9` light / `#C4B5FD` dark): event taxonomy. A lesson is neither open
  play nor a competition, and open play splits into a casual half (`info`) and a
  ranked half, so each commitment type owns a hue. Both were darkened from their
  natural ramp position until they cleared AA as text and as a fill label.
- **Rating tiers** (`rating-gold` `#B7791F`, `silver` `#78716C`, `bronze`
  `#9A5B22`, `iron` `#6B6B6B` in light; the metallics only in dark): tier
  identity on rating badges. Real silver (`#C0C0C0`) is ~1.6:1 on white, so
  light mode uses a warm stone instead of the literal metal.

### Neutral
- **Court Chalk** (`canvas`, `#F7F9F8` light / `#0B0D09` dark): the page ground.
  Near-white rather than white so a white card still reads as raised.
- **Card White / Deep Pine** (`surface`, `#FFFFFF` light / `#1E2E2A` dark): the
  panel face in the card composition.
- **Sidebar Grey / Pine** (`surface-2`, `#F2F4F7` / `#2E4540`): secondary fill,
  sidebar, hover ground, and the tinted band on the ledger page.
- **Hairline** (`border` `#E3E8E5`, `border-strong` `#CBD5D0`): panel edges and
  resting input strokes in the card composition.
- **Ink / Secondary Ink / Muted Ink** (`fg` `#0F1A15`, `fg-secondary` `#4F5D57`,
  `fg-muted` `#63706A`): the three-step text ramp. Muted was deliberately
  darkened from `#77857F`, which measured only 3.65:1 on the canvas and failed
  AA at caption size.

### Named Rules
**The Semantic-Only Rule.** No template ever writes a color. It writes intent
(`bg-surface`, `text-fg-muted`, `border-fg-muted`) and the theme resolves it. A
literal hex in a component is a bug, because it is a value that cannot follow
the visitor into dark mode.

**The Measured-Both-Ways Rule.** A color pair ships only when both themes have
been measured against their own ground. Light and dark reach the same contrast
by opposite routes — light lifts with shadow because it cannot go darker without
reading as a hole; dark lifts by going lighter — so a token that works in one is
not evidence for the other.

**The Confirmed-Or-Actionable Rule.** Court Green marks the primary action and
things a person has actually confirmed. It is not decoration, not a section
accent, and not a way to make a heading feel branded. On the landing page green
appears on the two buttons, on link hover, and exactly once in the body — on the
step where an opponent agreed.

**The Operator Wash Rule.** When a SuperAdmin supplies hero artwork, the page
lays one flat `canvas/0.92` wash over it — never a gradient ramp, never a fixed
dark slab. Because the wash is the theme's own canvas, the ordinary `fg` ink on
top keeps exactly the contrast it has everywhere else, in both themes, whatever
image and overlay opacity the operator picked. The fixed-white `on-scrim` token
still exists for the event artwork, but the landing page no longer needs it.

## Typography

**Display Font:** Lexend (with Inter, then system-ui, sans-serif)
**Body Font:** Inter (with system-ui, sans-serif)

Both are self-hosted variable woff2 files from `public/fonts`, latin subset
only, `font-display: swap`. No CDN request sits on the critical path, and the
app stays portable off any single host.

**Character:** Lexend is humanist rather than geometric — open apertures, a
narrower cap, gentler curves, and designed for reading ease rather than impact.
It replaced Poppins app-wide this session because Poppins' near-perfect circles
and wide, high-energy cap read as sporty rather than calm at heading size. Inter
carries every line of body text and, critically, every number: its tabular
figures are what keep `numeric(5,3)` ratings and ranking columns from shifting
column to column.

### Hierarchy
- **Display** (Lexend 500, `2.25rem` mobile → `3.75rem` at `sm`, line-height
  1.1, tracking tight): the landing claim only. Set on the page itself with a
  `19ch` measure — there is no hero box behind it.
- **Heading 1** (Lexend 600, 32px, 1.2): page titles. On the landing page's
  band headings this role is set at weight 500 and scaled up to `2.25rem` at
  `sm`.
- **Heading 2** (Lexend 500, 24px, 1.3): section titles.
- **Heading 3** (Lexend 500, 20px, 1.4): subsection and list-item titles.
- **Body 1** (Inter 400, 16px, 1.5): lead paragraphs and primary rows. Measures
  are capped in the ledger composition — `62ch` for lead copy, `48ch` for band
  claims, `40ch` for a column's supporting line.
- **Body 2** (Inter 400, 14px, 1.5): supporting copy, table cells, secondary
  rows. The densest legible step.
- **Caption** (Inter 400, 12px, 1.4): metadata, hints, timestamps, the sample-
  data disclaimer.
- **Label** (Inter 600, 12px, `tracking-widest`, uppercase): a column or band
  heading standing over ruled content — "Next on the schedule", "Our sponsors".
  It is a heading in its own right, sitting above the content it names on its
  own rule.
- **Stat** (Lexend 600–700, 1.5rem → 4rem, line-height 1): the large figure on
  a dashboard tile in the card composition. This is the one place the system
  still sets 700.
- **Stat Court** (Lexend 700, 5rem, line-height 1): one step above `stat-xl`,
  and the ramp's only use outside a tile. It is the live score on the per-court
  scoring page, where the number *is* the interface — read across a desk while
  standing, with two +1 targets beneath it that have to stay hittable without
  looking. 4rem left the score fighting the buttons for the card; 3rem did not
  carry across the desk. It belongs to that one surface and nothing else.

### Named Rules
**The Quiet Heading Rule.** Headings set 500 and 600. The ramp dropped a full
step this session (`heading-1` 700→600, `heading-2` and `heading-3` 600→500)
and the lighter weight is most of what makes the product read calm. New
headings use the ramp roles; do not reach for `font-bold` to add emphasis to a
heading.

**The Tabular Number Rule.** Every rating, score, rank, seed, date and time
renders with `tabular-nums`. A number that moves horizontally when it changes is
a number people stop trusting.

**The Sample-Data Rule.** Any number shown as an illustration of a mechanism
rather than as a recorded fact carries a caption saying so, in muted ink,
beneath the block it explains. Pre-launch, an unlabelled number is a claim.

## Layout

Content sits in a centred column of `max-w-6xl` (72rem) with `1rem` gutters
rising to `1.5rem` at `sm`. That container is shared by both compositions —
header, every band, and the footer align to the same edges, which is what lets
the ledger's rules run full-bleed while their content stays in column.

Vertical rhythm is band-scale, not component-scale: a section is `3.5rem` of
padding on mobile and `5rem` from `sm`, and the space between a heading and its
lead is `1.25rem`, lead to content `2.5–3rem`. Within a ruled list, rows are
`1.25rem` of padding above and below a hairline.

The responsive model is a genuine two-device design, not a scaled-down desktop.
Below `sm` the ledger collapses every grid to a single column, the verification
loop's connector rotates from a horizontal rule between columns to a vertical
one running down a `1.75rem` left gutter, the header's browse links and both
actions move into a teleported right-hand sheet with a scrim, Escape handling
and focus return, and the action rule under the claim takes a solid canvas
ground because operator artwork ghosts through the 0.92 wash at phone width.
Desktop bands are a 12-column grid split 5/7: claim left, evidence right.

**The Claim-Left, Evidence-Right Rule.** In the ledger composition a band states
its claim in the narrow left column and proves it in the wide right one — a
ruled list, a real schedule, a drawn mechanism. Nothing floats between them.

## Elevation & Depth

The system is a hybrid and is explicit about which half applies where. The card
composition is **layered**: depth is a real cast shadow, deliberately strong in
light mode because a white card on the off-white canvas separates by only
1.06:1 and the shadow is doing all of the work, and deliberately understated in
dark mode because those surfaces already separate by lightness. The ledger
composition is **flat**: no shadow, no gradient, no panel anywhere on it, and
structure is carried entirely by rule weight and by the tinted `surface-2/60`
band behind the verification loop.

### Shadow Vocabulary
- **Card** (`--dnl-shadow-card`: `0 1px 2px rgb(16 24 20 / .06), 0 4px 12px rgb(16 24 20 / .1)` light; `0 2px 8px rgb(0 0 0 / .3)` dark): the resting elevation of every panel in the card composition.
- **Card Hover** (`--dnl-shadow-card-hover`): the lift on an interactive card, usually paired with a `ring-1 ring-primary/50`.
- **Raised** (`--dnl-shadow-raised`): a block standing *on* the page rather than floating in it — the podium plinth, with an inset white hairline along its top edge so the cap and face read as two surfaces meeting.
- **Glow** (`glow-primary`, `glow-accent`, `glow-gold`, `0 0 20px` at 30–40% alpha): celebratory only — an achievement unlock, a gold-tier badge. Never structural.

### Named Rules
**The Shadow-Is-Separation Rule.** A shadow exists to separate a surface from
its ground, not to decorate it. If two surfaces already separate by lightness —
which is the dark theme's normal case — the shadow gets quieter, not louder.

**The One-Depth-Per-Surface Rule.** A surface picks layered or flat and stays
there. The landing page carries no shadow at all; a card page does not
substitute hairlines for its cards. Mixing the two on one screen reads as an
unfinished migration.

## Shapes

The card composition's form language is gently rounded and closed: 12px on
panels and images (`rounded-card`), 8px on buttons and inputs
(`rounded-button`), 6px on badges (`rounded-badge`), and a full pill on status
chips, count bubbles and avatars (`rounded-pill`). Panels are closed shapes —
a face, an optional 1px border, and a shadow.

The ledger composition's form language is the opposite and is stated as an
invariant on that surface: **square**. Nothing is a box. Structure is horizontal
rule, and there are exactly three weights, each measured visible in both themes:

- **Hairline** — 1px `border-fg-muted`: row separators, list items, footer,
  header, the rule under a label. Measured 4.90:1 light, 8.83:1 dark.
- **Section rule** — 2px `border-fg-muted`: the rule that closes a column
  heading and the connector drawn through the verification loop.
- **Structural rule** — 2px `border-fg`: the page's heaviest line. It closes the
  claim band's browse index and opens the closing action band, and nothing else.

The only radii on the ledger page are the ones on the buttons themselves
(`rounded-button`) and the 12px dot markers of the verification loop
(`rounded-pill`, 2px `border-fg` on a canvas fill).

**The Visible-Line Rule.** Every rule on a ruled surface must be measurably
visible in both themes. `border-border` — the card composition's panel edge — is
too faint to carry structure on its own on a flat page; the ledger uses
`border-fg-muted` as its lightest structural line precisely because it was
measured, not assumed.

**The Three-Weights Rule.** A ruled surface gets three rule weights and no
more. A fourth weight is not a new level of hierarchy; it is the point at which
the reader stops being able to tell the levels apart.

## Components

### Buttons
- **Shape:** softly rounded (8px, `rounded-button`); sizes `sm` 12/6px padding at caption, `md` 16/8px at body-2 (40px tall, which clears a 44px touch target once the surrounding gap is counted), `lg` 24/12px at body-1.
- **Primary:** solid Court Green with `on-primary` ink, weight 600. Hover moves to `primary-hover`.
- **Secondary:** transparent with a 1px `border-strong` stroke and `fg` ink; hover fills `surface-2`. On the ledger page the same button takes a `border-fg-muted` stroke so it matches the page's own line vocabulary.
- **Accent / Ghost:** accent fill with `on-accent` ink; ghost is `fg-secondary` text that fills `surface-2` on hover.
- **Danger:** an *outline*, never a solid fill. Disputing a match is legitimate but must not be the visually easiest thing on the screen.
- **Focus:** `ring-2 ring-primary` with `ring-offset-2 ring-offset-canvas` on every variant. Focus is never removed, only restyled.
- **Behavior:** a button given `to`/`href` renders as a real link, so middle-click and open-in-new-tab keep working. Loading state swaps in a spinning SVG and sets `aria-busy`; disabled drops to 50% opacity.

### Chips / Status Pills
- **Style:** full pill, a 20%-alpha status fill under solid status text, with a 16px stroked icon at the left. Pending amber, verified/open/active green, disputed/cancelled red, draft/closed/inactive muted.
- **State:** the pill states a fact about a record; it is never an interactive control.

### Cards / Containers
- **Corner Style:** 12px (`rounded-card`).
- **Background:** `surface` on the `canvas` ground; `surface-2` for secondary fills.
- **Shadow Strategy:** `shadow-card` at rest, `shadow-card-hover` plus a `ring-1 ring-primary/50` when the whole card is a link.
- **Border:** optional 1px `border-border`; a status-carrying card may take a tinted stroke (`border-warning-fill/40`).
- **Internal Padding:** 16px, rising to 24px on a page-level panel.

### Inputs / Fields
- **Style:** `surface` fill, 1px `border-strong` stroke, 8px radius, body-2 text, `fg-muted` placeholder, with an optional stroked icon inset at the left.
- **Focus:** `ring-2` in the brand green; the border color shifts with it.
- **Error / Disabled:** error swaps the stroke and the helper line to `danger` and wires `aria-describedby` to the message; disabled drops to 50% opacity with a not-allowed cursor.
- **Label:** caption weight 500 in `fg-secondary` above the field; a required field marks with a `danger` asterisk.

### Navigation
- **App chrome (card composition):** a sidebar on `surface-2` with the active item on `primary-soft`; a bottom bar on mobile that clears the iOS home indicator via a `safe-b` spacing token.
- **Marketing header (ledger composition):** sticky, `bg-canvas`, closed by a 1px `border-fg-muted` — no shadow and no blur. Brand mark left; theme toggle, a text log-in and the primary action right. Below `sm` those collapse into a teleported right-hand sheet, 18rem wide capped at 85%, over a `black/60` scrim, with ruled rows, Escape to close, and focus returned to the control that opened it.
- **Browse index:** four destinations as a full-width strip closed by the heaviest rule, hairline-separated as stacked rows on mobile and separated by vertical hairlines as a 4-column grid from `md`. Each row is a title in `fg` over a muted descriptive line; both turn green on hover.

### Icons
Stroked SVG paths from a shared registry, drawn in `currentColor` at 20px
default with a 1.5 stroke, raised to 2–2.4 at small sizes where 1.5 thins out.
They inherit color from their context and carry none of their own. Decorative by
default (`aria-hidden`); an icon that is a control's only content carries a
label. No icon font, and no glyph or emoji standing in for an icon.

### The Verification Loop (signature)
Three stops — Submitted, Confirmed, Rating moves — showing one match travelling
three states rather than three captions in a row. Each stop is a 12px ringed dot
on a connecting rule, a Lexend heading-3 numbered with a muted tabular figure, a
`40ch` supporting line, and a record row pushed to the bottom of the column
above a hairline so all three record rules land at the same height. Green
appears on exactly one stop, with a check icon, because that stop is the
confirmation.

Its motion is the page's one authored moment: the connecting rule advances stop
by stop as the band enters the viewport, 700ms on `cubic-bezier(0.16, 1, 0.3, 1)`
with 120ms/820ms stagger. **The finished state is the CSS default.** Only a
client-side handler winds the rule back, and only when `prefers-reduced-motion`
is not set and an `IntersectionObserver` exists; a 2.5s failsafe releases it if
the observer never fires. The dots never animate — they are structure, not
motion, and fading them in made the mechanism vanish whenever the trigger
missed.

**The Recoverable-Motion Rule.** An entrance animation is something a page opts
into, never something it recovers from. The complete state is the default in
CSS, so the surface is correct with no JS, on a failed hydration, and under
reduced motion; the animation only ever winds it back and releases it, and it
carries a timeout that releases it anyway.

## Do's and Don'ts

### Do:
- **Do** write semantic token names in templates (`bg-surface`, `text-fg-muted`, `border-fg-muted`) and let the theme resolve them.
- **Do** measure a new color against both themes' own grounds before shipping it, and record the ratio in `tokens.css` next to the value. WCAG AA is the enforced floor here, not an aspiration.
- **Do** set headings from the ramp roles at weight 500/600, in Lexend.
- **Do** put `tabular-nums` on every rating, score, rank, date and time.
- **Do** spend Court Green on the primary action and on confirmed state, and let its rarity do the work.
- **Do** pick one depth model per surface: cards with `shadow-card`, or flat with ruled hairlines.
- **Do** cap measure — `62ch` on lead copy, `48ch` on a band claim, `40ch` on a supporting column.
- **Do** design the empty state as the honest default. Pre-launch, an empty schedule is the real state, and it should read as an invitation rather than as a failure.
- **Do** ship an entrance animation whose finished state is the CSS default, gated on `prefers-reduced-motion`, with a failsafe.
- **Do** label any number that illustrates a mechanism rather than records a fact.

### Don't:
- **Don't** write a literal hex, rgb, or Tailwind palette color (`bg-green-600`) in a component. It cannot follow the visitor into dark mode.
- **Don't** use `border-border` as the only structure on a flat, card-less surface; it is a panel edge and is too faint to carry a page on its own.
- **Don't** reach for `font-bold` on a heading. The ramp dropped a weight step deliberately, and 700 now belongs to large stat figures only.
- **Don't** put a fourth rule weight on a ruled surface.
- **Don't** lay a gradient ramp over operator-supplied artwork to buy legibility; use the flat `canvas/0.92` wash so the theme's own ink stays correct in both themes.
- **Don't** invent traction. No counts, testimonials, partner logos, press, prices, or plan names may be rendered as fact while the product is pre-launch and pricing is unsettled.
- **Don't** treat dark mode as a filter over light. Its surfaces, its green's label ink, and its shadow strength are separate decisions that were measured separately.
- **Don't** animate a structural element into existence. If a failed trigger would remove meaning, the element is structure and must be present at rest.
