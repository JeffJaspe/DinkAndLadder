---
version: 1
slug: 'apps-web-pages-dashboard-vue'
primary_target: 'apps/web/pages/dashboard.vue'
related_targets: []
---

# Dashboard

Scope: `apps/web/pages/dashboard.vue`. Visitor mode: **Operate**.

Audience: a rated player, usually on a phone at or near the court, between games; the same page is read on a laptop later.
Job: know what is waiting on me, and know where I stand.
Action: clear what is pending — verify a result, answer an invitation, open the session I am registered for.
Proof: the player's own live data. Pre-launch: no invented counts, ratings, clubs or opponents; empty states are the honest default and are designed, not apologised for.

Constraints (user-pinned): calm and precise, not bold — the incumbent token system and Lexend/Inter ramp stand, no new visual world. Light and dark are peers. **No invisible lines** — rules use `fg-muted` or heavier, never `border/50`. Desktop and mobile both first-class. **Players no longer submit match scores** (club owners record them per event), so no submit action appears on this page; verification stays with the player until told otherwise.

Replaces a stack of ten equal `rounded-xl bg-surface shadow-card` panels in which nothing outranked anything.

## Direction contract

THESIS: The dashboard is ordered by time, not by data type. NOW, NEXT, DONE — refusing both arrangements this category ships: the KPI tile row over a chart, and the undifferentiated card stack this page is today.

OWN-WORLD: The settled calm palette. Five panels on the canvas - real surface, hairline border, the system shadow - carrying mass so the rules inside them can be quiet. Superseded 2026-09-03: the first build drew structure in rules alone with no surface or shadow, which the client rejected as pale and skeletal. Measured cause: light-mode canvas-to-surface is 1.06:1, and every darker canvas that would let tone separate pushes primary, warning and fg-muted under AA, so lines cannot be the only structure in light mode. Every number tabular. Court Green marks only what is confirmed or actionable; amber marks what is waiting.

STORY: I open this between games and know in one glance whether anything needs me, what I am registered for next, and whether my last result moved my number.

FIRST VIEWPORT: A thin standing line — rating, tier, rank — then NOW at full width: what is waiting on me, or the honest empty state saying nothing is. NEXT follows under a heavy rule.

FORM: The Court Day, candidate 7 of 7 on the ordered list, dealt and locked by the user; seed key ad4d5115, code-led.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

### Signature interaction

The NOW panel reports the page's state before a word of it is read. While anything is waiting it takes the warning edge and a filled count; clearing the last item returns it to an ordinary panel that says nothing is waiting. State is carried by the block rather than by a rule weight, because light mode can render a block and cannot render a 1.06:1 tone step.

### Unresolved

- Whether verification also leaves the player once club owners record scores. Built as staying.

### Resolved

- NOW leads the page even when empty, with a designed empty state (user, 2026-09-03). The page answers "does anything need me" in the first viewport; the empty case is the honest common one.
- The shout-out, badge and clubs sit below the day in a Standing arrangements band: they are identity, not schedule.
