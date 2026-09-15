# Playwright Audit — 2026-09-12

Full-app browser audit against the **dev** Supabase project (`ycwgksyqvkoshdojujkz`),
production build (`nuxt build` + `nuxt preview`), Chromium.

Run: `cd apps/web && pnpm run build && pnpm run test:e2e`.

**Status: all findings fixed the same day. 113 passed, 0 failed** (two consecutive
clean runs); 54 routes audited with zero server errors, zero client errors, zero
serious/critical axe violations, a `<main>` landmark on every page, and no stray
4xx API calls. Unit 1369/1369, typecheck clean, lint 0 errors (8 pre-existing
warnings), build green.

The first run was 88 passed / 16 failed; every failure was an app defect,
recorded below with how it was fixed.

## What the suite now covers

| Project  | Session                          | Specs                                                                  |
| -------- | -------------------------------- | ---------------------------------------------------------------------- |
| `setup`  | —                                | Mints real sessions for both dev test accounts (`tests/e2e/auth/`)     |
| `public` | signed out                       | 12 public routes rendered + 14 guarded routes bounced to `/login`, plus the pre-existing specs |
| `owner`  | `claude-test-owner@example.com`  | 18 signed-in routes, club admin screens, profile edit round-trip, player search → profile → head-to-head, club discovery, events → detail → matches, matches → detail, rankings, notifications, theme persistence, guest-page and admin-page bounces |
| `owner`  | (same)                           | **Match chain** (`authed/match-chain.spec.ts`, serial): cancel leftovers → create Open Ranked singles event in club mode → publish → owner and member register → start → record 11–5 via the event picker → start verification → member confirms → match verified, member's singles rating changes → match in owner's list |
| `member` | `claude-test-member@example.com` | Dashboard, non-admin denied on club settings/members, API PATCH rejected, sign-out ends the session |

Per route the audit records: final URL, 5xx responses (hard fail), uncaught client
errors (hard fail), 4xx API calls (informational), `<main>` landmark (soft), axe
serious/critical (soft), and a full-page screenshot. Raw results:
`apps/web/test-results/audit/<project>--<route>.json`.

Sessions are minted with `@supabase/ssr` (the same cookie format the app reads),
not by driving the login form — Turnstile uses a real site key, so the form
cannot be automated. Each run sets a fresh throwaway password on the two test
accounts through the Admin API; the seeder refuses any project ref but dev.

## Findings (all resolved)

### F-A1 · `GET /api/v1/players/:id/stats` returns 500 on every profile — **bug**

`server/domains/analytics/services/analytics.service.ts:131` selects
`achievements(points)` from `player_achievements`, but the definitions table is
`achievement_definitions` (the achievement repository already uses that name).
PostgREST: _"Could not find a relationship between 'player_achievements' and
'achievements'"_. Every public player profile loads with a failed stats card.
**Fixed:** join renamed to `achievement_definitions(points)`.

### F-A2 · Non-UUID ids 500 instead of 404 — **input validation**

`/api/v1/players/some-id` and `/api/v1/events/some-id` → `500 Server Error`
(`invalid input syntax for type uuid`). `/api/v1/clubs/some-id` correctly
returns 404. **Fixed** once for all 107 id-taking handlers:
`server/plugins/postgres-errors.ts` maps an unhandled Postgres `22P02` to a
404 with the standard API error body. The event page also requested
`/players/null` for events without a coach — now only fetched when set.

### F-A3 · Colour contrast below WCAG AA on status pills — **a11y, serious**

Same token pairs recur across `/matches`, `/matches/:id`, `/clubs`,
`/verified-clubs`, `/clubs/:id`, `/events/:id`, `/create-event`:

| Element                                     | Ratio | Pair                            |
| ------------------------------------------- | ----- | ------------------------------- |
| `bg-accent/20 text-accent` "Ranked" pill    | 1.35  | `#a7e3c1` on `#edf9f3`          |
| `text-fg-muted` "Unclaimed" (12px)          | 1.73  | `#c1c6c3` on `#ffffff`          |
| `bg-primary/20 text-primary` status pill    | 3.67–3.83 | `#0a7f45` on `#c8e1d4`      |
| `bg-success/15 text-success` "Verified"     | 4.13  | `#0a7f45` on `#daece3`          |
| `bg-warning/15 text-warning` "Pending"      | 4.08  | `#b45309` on `#f4e5da`          |
| `bg-danger/15 text-danger` "Disputed"       | 4.21  | `#d01e1e` on `#f8dddd`          |
| `opacity-75` tab counts "(16)"              | 3.12  | `#8a948f` on `#ffffff`          |

The `/15` and `/20` soft backgrounds are the cause; the design tokens already
have `-soft` variants (`bg-primary-soft`, `bg-danger-soft`) that should replace
them, and the accent-on-accent "Ranked" pill needs a dark foreground.
**Fixed:** every `bg-*/15` and `bg-*/20` wash replaced by its `-soft` token
(28 files), accent pills now `bg-accent-soft text-primary`, tab counts no
longer at `opacity-75`, the podium "Unclaimed" label at full opacity, and the
dark landing loop band moved from `surface-2` to `surface` (3.85 → 5.3:1).

### F-A4 · `/create-club` selects have no accessible name — **a11y, critical**

Two `<select>` elements (province/city) have no `<label for>` or `aria-label`.
**Fixed:** `id`/`for` pairs on province, city and barangay.

### F-A5 · Auth layout has no `<main>` landmark — **a11y**

`layouts/auth.vue` (and the `/events/:id/matches` page) render without a
`<main>`. This is also why the pre-existing `auth.spec.ts:34` check-email test
fails: it queries `getByRole('main')`. **Fixed:** both wrap in `<main>`.

### F-A6 · Public pages call signed-in endpoints while signed out — **noise**

`/rankings`, `/clubs`, `/events`, `/players`, `/verified-clubs` fire
`GET /api/v1/players/me` and `/players/me/ratings` from `layouts/default.vue:51`
and get 401s. **Fixed:** the layout's three signed-in fetches and the rankings
page's "where am I" lookup run only when a user is present (and again on
sign-in).

### F-A7 · Record Match via the picker does not prefill the submitter — **bug**

`pages/matches/submit.vue:306` sets Team 1 / Player 1 to "me" in `onMounted`,
but arriving from the "Which event was this?" picker is a client-side
navigation: registrations load *after* mount, so the slot stays empty and the
player must search for themselves. A full page load of `?event=…` works.
**Fixed:** a watcher on the roster + profile fills the slot whenever both are
known.

### F-A8 · Event "Matches" page shows loading skeletons forever for open play — **bug**

`pages/events/[eventId]/matches.vue:112` uses `useLazyFetch(..., { immediate:
false })` for the bracket; with no tournament it is never fetched, and Nuxt
leaves `pending` true, so `v-if="bracketPending"` renders skeletons
indefinitely under the court board. **Fixed:** the draw section renders only
when the event has a tournament.

### Observations (not failures)

- The club plan's "1 live open play event" limit is enforced and surfaced as a
  toast on publish — good; the chain spec cancels its own leftovers to respect it.
- Create Event correctly rejects a registration close date after the start date.
- Record Match's **Date & Time** was required and empty; it now defaults to
  "now" (client-side, so the server's UTC clock never leaks in).

### Verified working (no finding)

The full MVP chain above (event → registrations → start → record → verify →
rating change); guards on all 14 protected routes; guest-only bounce for signed-in users;
super-admin bounce for non-admins; club admin screens denied to a member (UI and
`PATCH /api/v1/clubs/:id`); profile edit persists and reverts; player search;
club search empty/success states; theme choice survives reload; sign-out
invalidates the session; no uncaught client errors on any of 53 route loads.

## Not yet covered

- Doubles matches, disputes/rejections/counter-scores, court-board scoring.
- Tournament bracket screens, court scoring, onboarding, achievements (flag off).
- Mobile viewport pass (Desktop Chrome only).
