# Demo data seed

Populates a **development** database with a full-looking community:

| | |
|---|---|
| Players | 100, each a real loginable Supabase auth user |
| Clubs | 12 (8 verified, 2 pending, 2 unverified), with rosters and announcements |
| Events | **100 — 20 in every one of the five categories**, spread across all five statuses |
| Registrations | ~1,030 (960 live + 70 withdrawn), so 25 events sit at capacity, some part-full, some nearly empty |
| Tournaments | 20, with rating-banded categories and confirmed entries |
| Matches | ~600 (~80% verified) with participants, scores, verifications and rating transactions |
| Brackets | 560 bracket slots across 32 draws — completed draws played to a champion, live ones mid-round |
| Open play | 3 live sessions with 8 queued sides, 2 courts in play and a running score |
| Feed | 280 activities covering every activity type the feed can render |

Everything is reversible. See [Rollback](#rollback).

---

## Safety

- **Development only.** `demo-users.mjs` refuses to run unless `SUPABASE_URL`
  contains `DEMO_EXPECTED_PROJECT_REF`, mirroring the "Confirm target database"
  guard in `.github/workflows/db-migrate.yml`.
- **Not a Liquibase changeset.** This is data, not schema — the same reasoning
  as `scripts/find-email-derived-display-names.mjs`. Nothing here touches the
  changelog, and CI never applies it.
- **Namespaced.** Every row the seed creates has a primary key of the form
  `deadbeef-xxxx-4000-8000-xxxxxxxxxxxx`, so the rollback is an exact match and
  cannot delete anything real.
- **Run with the service role** (the Supabase SQL editor, or `psql` as the
  database owner). RLS is bypassed there; the CHECK constraints, foreign keys,
  unique indexes and the `tournament_registrations` trigger still apply, and the
  files are written to satisfy all of them.

---

## Run

### 1. Auth users

```bash
export SUPABASE_URL=https://<dev-project-ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service role key>
export DEMO_EXPECTED_PROJECT_REF=<dev-project-ref>
export DEMO_PASSWORD='DemoPickle!2026'      # optional

node scripts/demo/demo-users.mjs --seed
```

PowerShell:

```powershell
$env:SUPABASE_URL = 'https://<dev-project-ref>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<service role key>'
$env:DEMO_EXPECTED_PROJECT_REF = '<dev-project-ref>'
node scripts/demo/demo-users.mjs --seed
```

Note the variable names differ from the web app's. `apps/web/.env` uses
`NUXT_PUBLIC_SUPABASE_URL` and `NUXT_SUPABASE_SECRET_KEY`; the root scripts use
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the convention set by
`scripts/find-email-derived-display-names.mjs`). Same values, different names.

The script uses the global `fetch` against the Auth Admin and PostgREST
endpoints rather than `@supabase/supabase-js`. That is not stylistic: this is a
pnpm workspace and the package is only installed under `apps/web`, so a bare
import from `scripts/` fails to resolve with `ERR_MODULE_NOT_FOUND`. Six HTTP
calls did not justify a workspace-root dependency. (The same trap applies to
`scripts/find-email-derived-display-names.mjs`, which does import it and
therefore only runs from inside `apps/web`.)

**Pushing to git does not run any of this.** The seed is not a Liquibase
changeset, so `db-migrate.yml` never applies it — that is what keeps it out of
production. CI's "Database (Liquibase changelog validate)" job runs the
changelog against a throwaway `postgres:16` container and never touches a real
database either. Seeding is a thing you do by hand, against dev.

Accounts created: `demo.player001@demo.dinkandladder.test` …
`demo.player100@demo.dinkandladder.test`, all with `DEMO_PASSWORD`.

### 2. Point the seed at your own accounts

`fn_demo_link_players()` in `00-config.sql` holds the email list. Edit it to
match the accounts you actually sign in with — **all of them**; every account
listed gets the full treatment independently.

This matters more than it looks. `/community`'s tabs, a club's roster, club
rankings and club matches are all computed **for the signed-in viewer** — they
403 or come back empty for a non-member with no matches. Each linked account
becomes a member of 7 clubs, a registrant in ~15 events, the organizer of 3
published tournaments, a participant in 8 verified doubles matches, and the
other end of several partnerships and team-ups.

An email with no `player_profiles` row **in this database** is skipped silently,
and an empty list makes every linking step a no-op. `00-config.sql` ends with a
query listing exactly which accounts matched — check it before running the rest.

Your real rows are never modified. The linking steps only *insert* new
demo-namespaced rows that reference your player id; the one exception is
`events.created_by_player_id` on five demo events, which are deleted wholesale
on rollback. `player_ratings` updates are restricted to demo rows.

### 3. SQL, in order

Run each file top to bottom, in this order, in the Supabase SQL editor or with
`psql`:

```
00-config.sql
01-players.sql
02-clubs.sql
03-events.sql
04-matches.sql
05-feed.sql
06-brackets.sql
```

Or in one go:

```bash
for f in 00-config 01-players 02-clubs 03-events 04-matches 05-feed 06-brackets; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "database/seeds/demo/$f.sql"
done
```

Each file ends with a row-count summary. `03`, `05` and `06` also print a
breakdown by event category, by activity type, and by bracket round.

Files are idempotent — ids are a pure function of a text key and every insert is
`ON CONFLICT DO NOTHING` — so a re-run after a partial failure is safe.
`04-matches.sql` and `06-brackets.sql` must each be run as a whole (they build
temp tables their later statements read).

---

## Rollback

```
database/seeds/demo/99-rollback.sql      -- then:
node scripts/demo/demo-users.mjs --purge
```

That order matters: `player_profiles` references `users`, so the SQL has to go
first. The rollback runs in one transaction and ends with a verification query
where **every count must be 0**. It also drops the helper function and views
that `00-config.sql` created.

---

## Rows created, per table

Counts are deterministic — the seed has no randomness, only arithmetic on the
player/club/event index. The "+ linked" column is what the optional
`fn_demo_link_player()` account adds on top.

| File | Table | Rows | + linked |
|---|---|---:|---:|
| 01 | `player_profiles` | 100 | — |
| 01 | `player_ratings` | 200 | — |
| 01 | `player_achievements` | 548 | — |
| 01 | `player_shoutouts` | 25 | — |
| 01 | `player_relationships` | 494 | 53 |
| 01 | `partnerships` | 47 | 5 |
| 01 | `partner_requests` | 9 | 3 |
| 01 | `team_ups` | 15 | 6 |
| 01 | `player_default_partners` | 47 | — |
| 02 | `clubs` | 12 | — |
| 02 | `club_memberships` | 196 | 4 |
| 02 | `club_announcements` | 60 | — |
| 03 | `events` | 100 | — |
| 03 | `event_registrations` | 1,030 (960 live + 70 withdrawn) | ~20 |
| 03 | `tournaments` | 20 | — |
| 03 | `tournament_categories` | 80 | — |
| 03 | `tournament_registrations` | 544 | — |
| 03 | `event_courts` | 24 | — |
| 03 | `event_queue` | 48 | — |
| 04 | `matches` | 600 (480 verified) | 8 |
| 04 | `match_participants` | 2,100 | 32 |
| 04 | `match_scores` | ~1,500 | 16 |
| 04 | `match_verifications` | 1,500 | — |
| 04 | `rating_transactions` | ~1,008 | — |
| 05 | `activities` | 280 | — |
| 05 | `notifications` | 150 | 40 |
| 06 | `bracket_matches` | 560 | — |
| 06 | `matches` (bracket results) | 488 | — |
| 06 | `match_participants` | ~1,800 | — |
| 06 | `match_scores` | 976 | — |
| | **Total** | **~14,300** | ~190 |

Plus 100 rows in `auth.users` and 100 in `public.users` from
`demo-users.mjs --seed`.

`04` also **updates** (does not insert) `player_ratings.matches_played` and
`rating_value` for the demo rows so they agree with the matches generated, and
`06` re-runs the `matches_played` half across the bracket results too. Both are
restricted to demo rows — a real player's rating is never rewritten.

Notes on the shapes behind those numbers:

- **`player_achievements` = 548** because achievements are awarded by index
  rule, not one flat list: 3 to every player with a club (94×3), then 2 more on
  each of `n%2`, `n%3`, `n%5`, `n%7`, 3 on `n%11`, 1 on `n%17`.
- **`event_registrations` live = 960**, not the full `max_participants` sum:
  registrants are drawn from the event's own club roster (12–23 members), so an
  event with 64 slots caps out at its roster size. That is intentional — it is
  what produces the mix of full, part-full and nearly-empty slot bars. The five
  at-capacity events per category use small caps (8/10/12) chosen to fit inside
  every roster, so **25 events do sit exactly at capacity**.
- **`match_participants` = 2,100** rather than 600×4: two of the eight
  match-bearing events per category are `singles` (`i % 5 = 0` → i=10, 15), so
  30 of every 120 matches have 2 players instead of 4.
- **`rating_transactions` ≈ 1,008** covers only verified matches on
  rating-affecting events — the two `*_casual` categories set
  `affects_rating = false`, so 2 of the 5 categories contribute none.
- **`match_scores` ≈ 1,500** varies by ±20: matches alternate between 2-set and
  3-set results, so each event contributes 37 or 38 rows.
- **`bracket_matches` = 560**: 4 round-robin tournaments × 4 categories × 28
  fixtures (448), plus 4 single-elimination tournaments × 4 categories × 7 slots
  (112). 488 of those slots are played.
- **`tournament_registrations` = 544**: 17 drawable tournaments × 4 categories ×
  8 entrants. Entrants come from 16 consecutive indices of the global player
  pool rather than the club roster — the smaller clubs only have 12 members, and
  the `032` trigger needs each person to appear at most once per category.

---

## Brackets

`06-brackets.sql` draws and plays tournaments **10..17**, in the two formats it
can reproduce exactly as `bracket.service.ts` emits them:

- **single_elimination** — `buildFirstRound` plus the empty later rounds, with
  winners advanced by `nextSlotFor()` (positions 1 and 2 both feed round+1
  position 1, into slot 1 and slot 2).
- **round_robin** — `generateRoundRobinBracket`'s circle method: entrant 0
  fixed, the other seven rotating one place per round.

Eight entrants per category, a power of two, so there are **no byes and no empty
slots**. Completed events are played through to a champion; the three active
ones stop mid-draw with one match `in_progress` carrying a live score.

Every played slot gets a real `matches` row with participants and scores, the
same way `recordMatchResult` does — participant1 becomes team 1, and the match
is created already `verified`, because an organiser writing down a draw result
*is* the verification.

**double_elimination and the two staged (pool → playoff) formats are not
seeded.** Their losers-bracket routing and pool seeding are intricate enough
that a hand-written draw that is subtly wrong renders as a *broken* bracket —
worse than an empty one. Those three formats sit on the **published**
tournaments (1..9) instead, with 8 confirmed entrants and
`max_participants = 8` so `generateBracket` will accept them: open one, press
**Generate bracket**, lock it, and you get the real generator's output. That is
also the only honest way to test the generator.

Anything you create that way is still fully reversible — the rollback cleans
brackets and matches by their tournament and event, not by the id namespace, so
app-generated rows with random UUIDs are caught too.

### Where the Generate button works

`generateBracket` has four gates, and only the **published** tournaments pass
all of them:

| Gate | What it needs |
|---|---|
| `assertEventOrganizer` | you are `events.created_by_player_id` — club OWNER/ADMIN is **not** enough |
| `INVALID_TOURNAMENT_STATE` | `tournaments.status` is `draft` or `open` |
| `CATEGORY_NOT_FULL` | confirmed entrants ≥ `tournament_categories.max_participants` |
| `BRACKET_LOCKED` | the draw is not locked |

So:

- **Tournaments 1–9 (published) — yes.** Status `open`, 8 of 8 entrants,
  unlocked. Five of them (i = 1, 3, 5, 7, 9) are reassigned to **your** linked
  account as organizer, one for each of the five formats, so you can draw them
  without switching accounts. The other four belong to demo club owners — sign
  in as one of those (see below) if you want them too.
- **Tournaments 10–17 — no**, by design. Their draws are already seeded and
  played, their categories are locked, and their tournament status is
  `in_progress` / `completed`. The button is correctly unavailable: a draw with
  results recorded against it cannot be reopened (`RESULTS_RECORDED`), which is
  the app's own rule, not a limitation of the seed.
- **Tournaments 18–20 (cancelled / draft) — no.** Cancelled fails the status
  gate; the draft one has no entrants seeded at all.

If you do want to organise as a demo account, the owner of club *c* is the
lowest-numbered player of its cluster: club 1 → `demo.player001`, 2 →
`demo.player019`, 3 → `demo.player031`, 4 → `demo.player043`, 5 →
`demo.player053`, 6 → `demo.player063`, 7 → `demo.player073`, 8 →
`demo.player081`, 9 → `demo.player088`. Event *i* belongs to club
`1 + ((i - 1) mod 12)`.

## Open play: queue and live scoring

The three `active` sessions per casual category are set up as a running
session, with the shapes the board actually reads:

- **One `event_queue` row is one SIDE of a court, not one person.** The courts
  endpoint builds a side from `[player_id, partner_id]`, so a doubles session
  needs `partner_id` filled or every side shows a single name.
- **`event_courts.live_score` is `LiveGameScore[]`** — a JSON *array* of
  `{game_number, team1_score, team2_score}`, the same shape as
  `match_score_proposals.scores`. Not an object.
- A court shows who is on it through `team1_queue_id` / `team2_queue_id`, and
  **Up next** is built from the rows still in status `'waiting'`, dealt
  round-robin across the courts by `joined_at`.

Each session gets 8 sides: 1-4 are `'playing'` on courts 1 and 2, 5-8 are
`'waiting'`. Court 1 is mid-second-game, court 2 mid-first, court 3 available
and court 4 in maintenance.

---

## What is deliberately not seeded

- double_elimination and pool→playoff draws — generate those in-app (above).
- Payments, subscriptions, sponsorships — post-MVP surfaces, out of scope here.
- Anything in production.

---

## Notes on the data

- **Locations are load-bearing.** Profiles, clubs and events all draw
  province/city/barangay from the same ten clusters in `v_demo_clusters`, because
  `fn_feed_for_player` (`039-feed-geo-priority`) scores barangay+city = 3,
  city+province = 2, province = 1 on case-insensitive equality, and `/rankings`,
  `/clubs/search` and `/events` filter on exact equality. Makati holds 30 of the
  100 players so the geo ranking has something dense to sort.
- **Provisional ratings** come from the cluster-10 players, who belong to no club
  and therefore play no matches — `player_ratings.provisional` is a generated
  column (`matches_played < 5`).
- **`social.started_following` and `club.member_joined` are seeded as
  `visibility = 'public'`.** The app writes them as `'followers'` and `'club'`,
  which `fn_feed_for_player` filters out — which is why you never see them in the
  live feed. Seeded public so you can see how they render.
- **`achievement.earned`, `profile.updated` and `club.announcement` activities are
  never written by any handler** in the app. Seeding is the only way to see them.
- Some registrations are `withdrawn`; those must **not** count towards an event's
  `registered_count`.
- Two published events per category are `registered_only` / `private` so the
  visibility filtering has a negative case.
- The feature flag `events.registered_badge` (in `feature_flags`) is off by
  default and controls the "Registered" badge on event cards — flip it in the
  admin UI if you want to see it.
