import type { PlayerAchievementStats } from '../repositories/achievement-stats.repository'

/**
 * What each achievement actually requires, as code.
 *
 * `achievement_definitions.criteria` is a jsonb sketch — `{"type":"count",
 * "entity":"matches","threshold":10}` — and three of the sixteen rows use a
 * shape no evaluator could execute (`{"type":"tournament_placement"}`,
 * `{"type":"exists","entity":"open_play_leader"}`). Reading it as an
 * instruction would mean writing an interpreter for a schema that was never
 * specified, and quietly awarding nothing for the rows it could not parse:
 * exactly the failure this whole change exists to remove.
 *
 * So the criteria column stays as the human-readable record of intent, and the
 * executable rule lives here, keyed by the definition's `key`. A definition
 * with no entry is never awarded and is reported by `unmappedKeys()` — a badge
 * that no rule can grant is a bug, not a hard achievement.
 *
 * `current`/`target` are what the gallery shows on a locked badge. They are the
 * same numbers the rule is decided on, so the progress line can never disagree
 * with whether the badge unlocked.
 */
export interface AchievementRequirement {
  /** Whether the player holds it, given their current record. */
  met(stats: PlayerAchievementStats): boolean
  /**
   * Countable progress toward it, for the locked state. Omitted where the
   * requirement is not a count — "reach 4.5" is a level, not four-and-a-half
   * of something, and a progress bar would misrepresent it.
   */
  progress?(stats: PlayerAchievementStats): { current: number; target: number }
  /** Second person, imperative, no trailing period — rendered under a locked badge. */
  hint: string
}

function countRule(
  target: number,
  read: (stats: PlayerAchievementStats) => number,
  hint: string
): AchievementRequirement {
  return {
    met: (stats) => read(stats) >= target,
    progress: (stats) => ({ current: Math.min(read(stats), target), target }),
    hint
  }
}

export const ACHIEVEMENT_REQUIREMENTS: Record<string, AchievementRequirement> = {
  // Being here is the requirement. Awarded the moment a profile exists so a
  // new player's gallery opens with something of their own in it.
  newcomer: {
    met: () => true,
    hint: 'Yours the moment your profile exists'
  },

  first_match: countRule(1, (s) => s.matches_played, 'Play a match recorded by an organiser'),
  regular_player: countRule(10, (s) => s.matches_played, 'Play 10 recorded matches'),
  dedicated_player: countRule(50, (s) => s.matches_played, 'Play 50 recorded matches'),
  match_master: countRule(100, (s) => s.matches_played, 'Play 100 recorded matches'),

  first_victory: countRule(1, (s) => s.matches_won, 'Win a recorded match'),
  winner: countRule(10, (s) => s.matches_won, 'Win 10 recorded matches'),
  champion: countRule(50, (s) => s.matches_won, 'Win 50 recorded matches'),

  rated_player: {
    met: (s) => s.is_rated,
    hint: 'Take the skill assessment to get your first rating'
  },
  // No progress bar: a rating is a level you reach, not a total you accumulate,
  // and it can go down. "3.2 of 3.5" would read as four-fifths done.
  rising_star: {
    met: (s) => s.best_rating !== null && s.best_rating >= 3.5,
    hint: 'Reach a 3.5 rating'
  },
  skilled_player: {
    met: (s) => s.best_rating !== null && s.best_rating >= 4.0,
    hint: 'Reach a 4.0 rating'
  },
  elite_player: {
    met: (s) => s.best_rating !== null && s.best_rating >= 4.5,
    hint: 'Reach a 4.5 rating'
  },

  social_butterfly: countRule(5, (s) => s.followers, 'Have 5 players following you'),
  community_member: countRule(1, (s) => s.clubs_joined, 'Join a club'),
  club_founder: {
    met: (s) => s.created_a_club,
    hint: 'Create a club of your own'
  },

  tournament_debut: countRule(1, (s) => s.tournament_registrations, 'Enter a tournament'),
  competitor: countRule(5, (s) => s.tournament_registrations, 'Enter 5 tournaments'),

  // Derived from the bracket final — see countTournamentPlacements. Third place
  // has no evaluable source and is retired; see ADR-010.
  tournament_winner: countRule(1, (s) => s.tournament_wins, 'Win a tournament'),
  tournament_runner_up: countRule(1, (s) => s.tournament_runner_ups, 'Reach a tournament final'),
  multi_champion: countRule(5, (s) => s.tournament_wins, 'Win 5 tournaments')
}

/**
 * Active definition keys with no executable rule.
 *
 * Surfaced by the SuperAdmin recalculation tool rather than logged and
 * forgotten: it is the one signal that a new seeded achievement was added
 * without the code that grants it, and the symptom — a badge nobody can ever
 * earn — is invisible from the outside.
 */
export function unmappedKeys(activeKeys: string[]): string[] {
  return activeKeys.filter((key) => !(key in ACHIEVEMENT_REQUIREMENTS))
}
