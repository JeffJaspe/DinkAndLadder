import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A final this player reached, and which side of it they finished on.
 *
 * Carries the event and category it belongs to, not just a tally, because a
 * title is a thing that happened somewhere: the profile links each champion
 * badge to the draw it was won in, and a count cannot do that.
 */
export interface TournamentPlacement {
  placement: 1 | 2
  tournament_id: string
  tournament_name: string | null
  /** Null for a tournament run as a single undivided draw. */
  category_id: string | null
  category_name: string | null
  event_id: string | null
  event_name: string | null
  /**
   * When the final was played. `matches.played_at` where the bracket match was
   * linked to a recorded result, falling back to the bracket row's own
   * `scheduled_at`, then to null — a title with no date still counts, it just
   * cannot be ordered against the others by date.
   */
  decided_at: string | null
}

export interface TournamentPlacementRepository {
  /**
   * Every final among these registrations, most recent first.
   *
   * Takes registrations rather than a player id because a doubles entry is one
   * registration shared by two players, and the bracket only ever names the
   * registration. Each carries its `tournament_id`, which the caller already
   * has — that is what bounds the bracket read to one `.in()` instead of an
   * `or()` chain two conditions long per registration, which a player with a
   * long tournament history would eventually push past the URL limit.
   */
  findByRegistrations(
    registrations: { id: string; tournament_id: string }[]
  ): Promise<TournamentPlacement[]>
}

/**
 * Placements are derived from the bracket, not stored.
 *
 * There is no standings table. A draw's result lives in `bracket_matches`,
 * where its **last round holds one match — the final** — and
 * `winner_registration_id` names the champion; the other side is the runner-up.
 *
 * **The last round is per category, not per tournament.** A tournament runs
 * several categories in one bracket table, and a 4-entry category's final is
 * round 2 while a 16-entry category's is round 4. Deriving one last round for
 * the whole tournament silently disqualifies every champion of every smaller
 * category and can promote a semi-finalist of the largest one. `category_id`
 * is nullable, so an undivided draw groups under its own key.
 *
 * Third place is deliberately not derived. Single elimination produces two
 * losing semi-finalists and no ordering between them without a consolation
 * match, and that rule is unresolved — see ADR-010.
 */
export function createTournamentPlacementRepository(
  client: SupabaseClient
): TournamentPlacementRepository {
  return {
    async findByRegistrations(registrations) {
      if (registrations.length === 0) return []

      const registrationIds = registrations.map((r) => r.id)
      const tournamentIds = [...new Set(registrations.map((r) => r.tournament_id))]

      // Every bracket match in every tournament this player entered — fetched
      // whole rather than filtered to their own matches, because the last round
      // can only be established against the entire draw. A semi-final looks
      // exactly like a final to somebody who was knocked out there.
      const { data, error } = await client
        .from('bracket_matches')
        .select(
          `tournament_id, category_id, round, status, winner_registration_id,
           participant1_registration_id, participant2_registration_id, scheduled_at,
           matches(played_at),
           tournaments(name, event_id, events(name)),
           tournament_categories(name)`
        )
        .in('tournament_id', tournamentIds)

      if (error) throw error

      type Row = {
        tournament_id: string
        category_id: string | null
        round: number
        status: string
        winner_registration_id: string | null
        participant1_registration_id: string | null
        participant2_registration_id: string | null
        scheduled_at: string | null
        matches: { played_at: string | null } | null
        tournaments: {
          name: string | null
          event_id: string | null
          events: { name: string | null } | null
        } | null
        tournament_categories: { name: string | null } | null
      }

      const rows = (data ?? []) as unknown as Row[]

      // Draw key: a tournament's categories are separate competitions that
      // happen to share a bracket table.
      const drawKey = (row: Row) => `${row.tournament_id}::${row.category_id ?? ''}`

      const lastRound = new Map<string, number>()
      for (const row of rows) {
        const key = drawKey(row)
        const current = lastRound.get(key)
        if (current === undefined || row.round > current) lastRound.set(key, row.round)
      }

      const mineSet = new Set(registrationIds)
      const placements: TournamentPlacement[] = []

      for (const row of rows) {
        if (row.status !== 'completed') continue
        if (row.round !== lastRound.get(drawKey(row))) continue
        if (!row.winner_registration_id) continue

        const won = mineSet.has(row.winner_registration_id)
        const loser =
          row.winner_registration_id === row.participant1_registration_id
            ? row.participant2_registration_id
            : row.participant1_registration_id
        const lost = !won && !!loser && mineSet.has(loser)
        if (!won && !lost) continue

        placements.push({
          placement: won ? 1 : 2,
          tournament_id: row.tournament_id,
          tournament_name: row.tournaments?.name ?? null,
          category_id: row.category_id,
          category_name: row.tournament_categories?.name ?? null,
          event_id: row.tournaments?.event_id ?? null,
          event_name: row.tournaments?.events?.name ?? null,
          decided_at: row.matches?.played_at ?? row.scheduled_at ?? null
        })
      }

      // Most recent first. Undated titles sort last rather than being dropped.
      placements.sort((a, b) => {
        if (a.decided_at === b.decided_at) return 0
        if (!a.decided_at) return 1
        if (!b.decided_at) return -1
        return a.decided_at < b.decided_at ? 1 : -1
      })

      return placements
    }
  }
}
