/**
 * TEMPORARY — delete this file once 052-open-play-rounds has been applied.
 *
 * 052 adds `events.current_round`, `event_courts.round_number` and
 * `matches.event_round`. Migrations here are applied by the `db-migrate`
 * workflow and never from a laptop, so there is a window where the code that
 * reads those columns is running against a database that does not have them —
 * and PostgREST answers a select for a missing column with 42703, which takes
 * the whole event page down rather than degrading.
 *
 * So this flag stands in for the migration. While it is `true`:
 *
 *   - the three columns are left out of every select and every write, so
 *     nothing asks the database for something it does not have;
 *   - rounds are derived for DISPLAY ONLY from the order matches were played
 *     in, so the live board can be looked at before the migration lands.
 *
 * The derived rounds are a demo, not data. They are recomputed from scratch on
 * every render, they are not written anywhere, and they will disagree with the
 * real rounds the moment 052 is applied and play resumes. That is fine and
 * expected — they exist so the board can be reviewed, and for nothing else.
 *
 * ---------------------------------------------------------------------------
 * TO REMOVE, once `db-migrate` has run 052:
 *
 *   1. Set ROUNDS_MIGRATION_PENDING to false and check the event page loads.
 *   2. Delete this file and the five imports of it:
 *        server/domains/event/repositories/event-court.repository.ts
 *        server/domains/event/repositories/event.repository.ts
 *        server/domains/match/repositories/match.repository.ts
 *        server/api/v1/events/[eventId]/matches.get.ts
 *        components/event/LiveBoard.vue
 *      Each use is tagged `PENDING-052` so they grep out in one pass.
 * ---------------------------------------------------------------------------
 */
export const ROUNDS_MIGRATION_PENDING = true

/**
 * Drops columns from a PostgREST select list while they do not exist yet.
 *
 * Takes the names rather than a pre-built alternative string so the real column
 * list stays the one thing being maintained — a second hand-kept copy would
 * drift the moment anything else was added to it.
 */
export function withoutPendingColumns(columns: string, pending: string[]): string {
  if (!ROUNDS_MIGRATION_PENDING) return columns
  const drop = new Set(pending)
  return columns
    .split(',')
    .map((c) => c.trim())
    .filter((c) => !drop.has(c))
    .join(', ')
}

/**
 * Strips keys from a row about to be written.
 *
 * An insert or update naming a missing column fails the same way a select does,
 * so the write paths need the same treatment as the read paths.
 */
export function withoutPendingWrites<T extends Record<string, unknown>>(
  patch: T,
  pending: string[]
): T {
  if (!ROUNDS_MIGRATION_PENDING) return patch
  const drop = new Set(pending)
  return Object.fromEntries(Object.entries(patch).filter(([key]) => !drop.has(key))) as T
}

/**
 * DISPLAY ONLY. Rounds guessed from the order games were played in.
 *
 * An open play session runs in waves the width of the court count, so chunking
 * finished matches oldest-first by that width reproduces the shape of the real
 * thing closely enough to review the board against. It is a guess: a court that
 * ran long, a game recorded late, or a session that never filled every court
 * will all put a match in the wrong wave.
 *
 * Returns the round for each match id, plus the wave now being played.
 */
export function deriveDisplayRounds(
  matches: { id: string; played_at: string }[],
  courtCount: number
): { roundByMatchId: Map<string, number>; currentRound: number } {
  const width = Math.max(1, courtCount)
  const oldestFirst = [...matches].sort((a, b) => a.played_at.localeCompare(b.played_at))

  const roundByMatchId = new Map<string, number>()
  oldestFirst.forEach((match, index) => {
    roundByMatchId.set(match.id, Math.floor(index / width) + 1)
  })

  // The wave being played now is the one after the last full wave finished.
  const currentRound = Math.floor(oldestFirst.length / width) + 1
  return { roundByMatchId, currentRound }
}
