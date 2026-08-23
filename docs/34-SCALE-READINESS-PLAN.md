# 34 — Scale Readiness Plan (indexes and query patterns)

**Status:** proposed, 2026-08-23. Nothing here is implemented yet.
**Trigger:** capacity analysis for a 10k-user first month on the Supabase Free
plan, which surfaced problems that are invisible at the current data volume and
severe at 10k+.

---

## 1. Why this exists

The live database currently holds 5 player profiles and 8 matches. Every query in
the app is fast, and will stay fast, right up until it isn't: a sequential scan of
5 rows and a sequential scan of 200,000 rows are the same code and the same test
result. Nothing in the current suite can fail because of this.

Three facts found while sizing the Free plan:

1. **13 tables have no index at all** beyond their primary key, including
   `player_profiles`, `player_ratings` and `match_scores`.
2. **`player_profiles.user_id` is unindexed** and is looked up on essentially
   every authenticated request.
3. **The rankings query sorts the whole rating table** with no index to sort by,
   then discards all but one page.

None of these are bugs today. All of them are incidents at 10k users.

---

## 2. What is actually wrong

### 2.1 `player_profiles.user_id` — the one on every request

`findByUserId` runs on essentially every authenticated endpoint: it is how a
Supabase auth id becomes a player profile. There is no index on `user_id`, so
this is a sequential scan of the entire profile table, per request.

At 100k profiles (~40 MB) that is 40 MB of heap read to answer "who is this?" —
before the endpoint does its actual work. This is the highest-frequency query in
the system and currently the least prepared for volume.

### 2.2 The rankings query — scan, join, sort, discard

`ranking.repository.ts::getRankings`:

```
player_ratings
  .eq('rating_type', …)                  -- no index
  .not('rating_value', 'is', null)       -- no index
  inner join player_profiles             -- filtered on profile_visibility
  .order('rating_value', desc)           -- no index to sort by
  .range(offset, offset + limit - 1)     -- OFFSET pagination
```

At 100k players there are ~200k `player_ratings` rows. Postgres must scan all of
them, join, sort every surviving row by `rating_value`, and then throw away
everything except the requested 50. There is no index that lets it stop early.

`/rankings` is a public landing surface — the most likely page to be linked,
shared and crawled. It is also the most expensive query in the app.

**Deep pagination compounds it.** `OFFSET 10000` still scans and sorts the first
10,050 rows before discarding 10,000. Page 200 of the ladder costs more than
page 1, and no amount of indexing fixes OFFSET — that needs keyset pagination.

### 2.3 Search — unindexed, unindexable, and undebounced

Three problems that multiply:

- `player_profiles` has no index on `display_name`, `province` or `city`.
- `ilike '%term%'` has a leading wildcard, so a B-tree index would not help even
  if one existed. This needs a trigram index.
- The players page uses `useFetch` with a reactive `query` computed and **no
  debounce**, so it refetches on every keystroke.

Typing "jeffrey" at 100k players = 7 requests × a full table scan each.

### 2.4 Unbounded and chatty reads

- `getCirclePlayerIds` builds an unbounded `.in()` list (backlog F-27). At scale
  this exceeds the request URL limit and 500s. It is a correctness bug that only
  appears with real data.
- `pages/clubs/[clubId].vue` issues six sequential `$fetch` calls on mount, one
  of which pulls 50 matches. One page view, six round trips.
- `pages/dashboard.vue` issues six.

### 2.5 Nothing is ever pruned

`activities`, `notifications`, `notification_deliveries` and `audit_logs` grow
without bound. There is no retention policy anywhere in the schema. This decides
whether month 6 is 700 MB or 2 GB.

`rating_transactions` is different and must be said plainly: it is **one row per
player per match, forever**, and it cannot be pruned without destroying rating
history. It is the fastest-growing table in the system by design. Plan capacity
around it rather than trying to shrink it.

---

## 3. The plan

Three phases. Phase 1 is a single migration and is worth doing before the next
deploy. Phase 2 is application work. Phase 3 is a decision that needs product
input.

### Phase 1 — Indexes (`028-scale-indexes`)

One changeset. Highest value per unit of effort in this document.

| # | Index | Fixes |
| --- | --- | --- |
| 1 | `player_profiles (user_id)` | The per-request profile lookup (§2.1) |
| 2 | `player_ratings (rating_type, rating_value DESC) WHERE rating_value IS NOT NULL` | Rankings scan + sort (§2.2) |
| 3 | `player_ratings (player_id, rating_type)` | Dashboard, profile, match rating reads |
| 4 | `player_profiles USING gin (display_name gin_trgm_ops)` | `ilike '%x%'` search (§2.3) |
| 5 | `player_profiles (province, city)` | Location filters on players and rankings |
| 6 | `match_scores (match_id)` | Per-match score fetch — missing FK index |
| 7 | `player_profiles (profile_visibility)` — partial, `WHERE profile_visibility = 'public'` | Public listings |

Index 2 is the important one. A composite on `(rating_type, rating_value DESC)`
lets Postgres walk the index in already-sorted order and stop after `LIMIT`,
turning a full scan-and-sort into a bounded index range read. The partial
predicate keeps unrated players out of the index entirely.

Index 4 needs the extension:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Available on Supabase. Trigram indexes are built for leading wildcards, which is
exactly what a B-tree cannot serve.

**Two practical notes for whoever writes the changeset:**

- Partial indexes, `DESC` ordering and `gin_trgm_ops` are not expressible in
  Liquibase's `<createIndex>`. Use `<sql>` inside the changeSet, as
  `023-platform-feature-flags` already does for RLS policies. Liquibase remains
  the source of truth; see the project rule on this.
- On a table with real data, use `CREATE INDEX CONCURRENTLY` so the build does
  not hold a write lock. `CONCURRENTLY` cannot run inside a transaction, so the
  changeSet needs `runInTransaction="false"`. At today's volume it makes no
  difference; write it that way anyway, because the migration will be applied
  when the volume is no longer today's.

### Phase 2 — Query and page patterns

Ordered by value-for-effort.

| # | Change | Why |
| --- | --- | --- |
| 1 | **Debounce the player search** (~300 ms) | ~85% fewer requests, no migration, ten minutes |
| 2 | **Minimum 2-character query** | `q=a` matches most of the table and returns noise |
| 3 | **Bound `getCirclePlayerIds`** (F-27) | Correctness bug at scale, not just performance |
| 4 | **Consolidate the club page's six calls** | Largest single egress item measured |
| 5 | **Consolidate the dashboard's six calls** | Same shape, on the most-visited screen |
| 6 | **Keyset pagination for rankings** | Removes the OFFSET cliff; needed only past ~page 20 |

Items 1–3 are small and independent. Items 4–5 are the ones that move the egress
number and should be measured before and after. Item 6 can wait until the ladder
is deep enough to page that far.

### Phase 3 — Growth control

Needs a product decision, so it is stated rather than assumed:

- [ ] **Retention policy** for `activities`, `notifications`,
      `notification_deliveries`, `audit_logs`. How long should a notification
      remain readable? 90 days is a common answer; the right one is a product
      call. Implement as a scheduled delete once the window is agreed.
- [ ] **Accept `rating_transactions` growth** and size the plan around it, or
      introduce a rollup (monthly aggregates, detail archived) if history depth
      turns out not to matter beyond a season.

---

## 4. How to verify this worked

The current test suite cannot detect any of these problems, and will not detect
their fixes. Verification has to be done against data.

1. **Seed a realistic dataset.** The backlog already carries a seeding item
   ("Dummy Data Seeding"). Scale it up: 50k profiles, 100k ratings, 20k matches.
   Nothing below is meaningful without it.
2. **`EXPLAIN ANALYZE` the three queries above**, before and after Phase 1. The
   thing to look for on rankings is `Seq Scan` + `Sort` becoming an
   `Index Scan` with no sort node.
3. **Enable `pg_stat_statements`** and rank queries by total time. It answers
   "what is actually slow" rather than "what did we guess is slow" — and will
   probably surface something not on this list.
4. **Re-measure egress per session** after Phase 2 items 4–5, against the
   ~120 KB/session baseline measured on 2026-08-23.

---

## 5. Sequencing

**Before the next deploy:** Phase 1. It is one migration, it is reversible, and
every index in it serves a query that already exists.

**Before a 10k launch:** Phase 2 items 1–3 (small, independent) and items 4–5
(the egress work).

**Within the first month:** Phase 3 retention decision, and the seeded dataset
from §4.1 so that the next capacity question can be answered by measurement
instead of estimation.

---

## 6. What this plan deliberately does not do

- **No premature denormalisation.** No materialised rankings table, no cached
  counts. Those trade correctness for speed and are not needed until the indexes
  are in place and proven insufficient.
- **No read replicas or connection-pool changes.** Those are platform answers to
  a query problem; fix the queries first.
- **No changes to `rating_transactions` semantics.** It is append-only and
  authoritative for rating history. Its growth is a capacity fact, not a bug.
