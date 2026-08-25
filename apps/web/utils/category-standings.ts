import type { BracketDto } from '~/server/domains/event/dto/bracket.dto'
import { isPoolRound, roundLabel } from '~/utils/bracket-rounds'

/**
 * Standings for one tournament category, from that category's bracket results.
 *
 * Deliberately not from the `matches` table: `matches` links to a tournament
 * only through `bracket_matches.match_id`, while `bracket_matches.category_id`
 * is a real indexed column (018-platform-enhancements). The bracket already
 * carries the answer.
 *
 * Lives here rather than inside `CategoryStandings.vue` so the ranking rule is
 * testable without mounting a component — it is the one piece of that view
 * anybody would dispute.
 */

export interface StandingEntry {
  rank: number
  registration_id: string
  player_id: string
  display_name: string
  wins: number
  losses: number
  matches_played: number
}

export interface StandingEntrant {
  /** Registration id — what a bracket slot actually holds. */
  id: string
  player_id: string
  display_name: string
}

export function computeCategoryStandings(
  bracket: BracketDto | null,
  confirmed: readonly StandingEntrant[]
): StandingEntry[] {
  const records = new Map<string, { wins: number; losses: number }>()
  const ensure = (registrationId: string) => {
    let entry = records.get(registrationId)
    if (!entry) {
      entry = { wins: 0, losses: 0 }
      records.set(registrationId, entry)
    }
    return entry
  }

  // Every confirmed entrant appears, so somebody who has not played yet is
  // listed at 0–0 rather than missing from their own category.
  for (const entrant of confirmed) ensure(entrant.id)

  for (const round of bracket?.rounds ?? []) {
    for (const match of round.matches) {
      // A bye is not a win. It is the absence of an opponent, and counting it
      // would hand the top seed a free result the field never had a chance to
      // contest — the first row a player would dispute.
      if (match.status === 'bye') continue

      const winner = match.winner_registration_id
      if (!winner) continue

      const slots = [match.participant1_registration_id, match.participant2_registration_id].filter(
        (id): id is string => Boolean(id)
      )
      // A result needs two sides to mean anything.
      if (slots.length < 2) continue

      for (const id of slots) {
        const record = ensure(id)
        if (id === winner) record.wins++
        else record.losses++
      }
    }
  }

  const byRegistration = new Map(confirmed.map((entrant) => [entrant.id, entrant]))

  return (
    [...records.entries()]
      .map(([registrationId, record]) => {
        const entrant = byRegistration.get(registrationId)
        return {
          registration_id: registrationId,
          player_id: entrant?.player_id ?? registrationId,
          display_name: entrant?.display_name ?? 'Unknown player',
          wins: record.wins,
          losses: record.losses,
          matches_played: record.wins + record.losses
        }
      })
      // Most wins first, then fewest losses; the name settles the rest so the
      // order does not wander between renders.
      .sort(
        (a, b) =>
          b.wins - a.wins || a.losses - b.losses || a.display_name.localeCompare(b.display_name)
      )
      .map((row, index) => ({ rank: index + 1, ...row }))
  )
}

/**
 * One standings table per group.
 *
 * A staged format's pools are separate competitions — the 4.5s in Pool A are
 * not racing the 4.5s in Pool B for anything until the playoff — so one merged
 * table would rank people who never played each other and imply a contest that
 * does not exist. A format with no pools has exactly one group, which is the
 * whole category, and that is what the single-element result means.
 */
export interface StandingsGroup {
  /** The bracket round the group is drawn from; null for the whole category. */
  round: number | null
  label: string
  entries: StandingEntry[]
}

export function computeStandingsGroups(
  bracket: BracketDto | null,
  confirmed: readonly StandingEntrant[]
): StandingsGroup[] {
  const poolRounds = (bracket?.rounds ?? []).filter((round) => isPoolRound(round.round))

  if (!poolRounds.length) {
    const entries = computeCategoryStandings(bracket, confirmed)
    return entries.length ? [{ round: null, label: 'Standings', entries }] : []
  }

  return poolRounds
    .slice()
    .sort((a, b) => a.round - b.round)
    .map((round) => {
      // Only the entrants this pool actually contains: seeding a pool table
      // with the whole category would list everyone at 0–0 in every group.
      const inPool = new Set<string>()
      for (const match of round.matches) {
        if (match.participant1_registration_id) inPool.add(match.participant1_registration_id)
        if (match.participant2_registration_id) inPool.add(match.participant2_registration_id)
      }

      return {
        round: round.round,
        label: roundLabel(round.round),
        entries: computeCategoryStandings(
          {
            tournament_id: bracket!.tournament_id,
            category_id: bracket!.category_id,
            locked: bracket!.locked,
            rounds: [round]
          },
          confirmed.filter((entrant) => inPool.has(entrant.id))
        )
      }
    })
}
