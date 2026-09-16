import type { AchievementRepository } from '../repositories/achievement.repository'
import type {
  AchievementStatsRepository,
  PlayerAchievementStats
} from '../repositories/achievement-stats.repository'
import type { AchievementDefinitionDto } from '../dto/achievement.dto'
import { toAchievementDefinitionDto } from '../dto/achievement.dto'
import { ACHIEVEMENT_REQUIREMENTS, unmappedKeys } from './achievement-requirements'

/**
 * Decides, from a player's actual record, every achievement they hold — and
 * awards the ones they do not have yet.
 *
 * One evaluator rather than a call per metric. `createAchievementUnlocker`
 * already offered `checkMatchMilestones`, `checkRatingMilestones` and four more
 * siblings, and not one of them was ever called from application code: sixteen
 * achievements were seeded, displayed, and never awarded to anybody. Six
 * entry points that each had to be remembered at six different call sites is
 * how that happens. There is now one function, it is idempotent, and every
 * hook — a verified match, a new profile, the SuperAdmin repair tool — calls
 * the same one.
 *
 * Idempotent by construction: it re-reads the player's stats, compares against
 * what they already hold, and inserts only the difference. Running it twice in
 * a row awards nothing the second time.
 */
export interface AchievementEvaluationResult {
  /** Definitions awarded by this run. Empty on a no-op, which is the common case. */
  unlocked: AchievementDefinitionDto[]
  /** Definitions the player already held. */
  already_held: number
  /** The record the decision was made on, so a caller can report it. */
  stats: PlayerAchievementStats
  /** Active definitions with no rule in ACHIEVEMENT_REQUIREMENTS. Should be empty. */
  unmapped: string[]
}

export interface AchievementEvaluator {
  evaluate(playerId: string, userId: string | null): Promise<AchievementEvaluationResult>
}

export function createAchievementEvaluator(
  achievements: AchievementRepository,
  stats: AchievementStatsRepository
): AchievementEvaluator {
  return {
    async evaluate(playerId, userId) {
      const [definitions, held, playerStats] = await Promise.all([
        achievements.findAllDefinitions(),
        achievements.findPlayerAchievements(playerId),
        stats.gather(playerId, userId)
      ])

      const heldIds = new Set(held.map((h) => h.achievement_id))
      const unlocked: AchievementDefinitionDto[] = []

      for (const definition of definitions) {
        if (heldIds.has(definition.id)) continue

        const requirement = ACHIEVEMENT_REQUIREMENTS[definition.key]
        if (!requirement || !requirement.met(playerStats)) continue

        try {
          await achievements.createPlayerAchievement(playerId, definition.id)
          unlocked.push(toAchievementDefinitionDto(definition))
        } catch (err) {
          // uq_player_achievement makes a concurrent second grant a unique
          // violation rather than a duplicate row. Two matches settling at once
          // is a normal race, not an error worth failing the caller over — the
          // achievement is held either way.
          if (!isUniqueViolation(err)) throw err
        }
      }

      return {
        unlocked,
        already_held: heldIds.size,
        stats: playerStats,
        unmapped: unmappedKeys(definitions.map((d) => d.key))
      }
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
}
