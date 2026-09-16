import type { AchievementTier } from '~/server/domains/achievement/dto/achievement.dto'

export interface BadgeShowcaseRecord {
  player_id: string
  /** achievement_definitions.key — see 065-achievement-integrity. */
  selected_badge_id: string | null
  updated_at: string
}

export interface BadgeShowcaseDto {
  playerId: string
  selectedBadgeId: string | null
  updatedAt: string
}

export interface SetBadgeInput {
  badge_id: string | null
}

/**
 * A badge, as the profile shows it.
 *
 * There used to be a hard-coded `AVAILABLE_BADGES` array here: ten badges with
 * names like "Tournament Champion" and "Match Master", offered to every player
 * unconditionally, saved without a single check, and connected to nothing. A
 * player who had never recorded a match could wear "Completed 100+ matches" on
 * their profile, and eight of the ten duplicated an achievement that already
 * existed in `achievement_definitions` with the same key and a different
 * description.
 *
 * A badge is now exactly one thing: an achievement this player has unlocked.
 * There is no second list to keep in step, and nothing to display that the
 * record does not support.
 */
export interface BadgeDto {
  /** The achievement key. Stable across environments; this is what is stored. */
  id: string
  name: string
  /** The definition's glyph — the badge's own identity, not an icon-system entry. */
  icon: string | null
  description: string
  tier: AchievementTier
  /** When the player earned it. */
  earnedAt: string
}

export function badgeShowcaseRecordToDto(record: BadgeShowcaseRecord): BadgeShowcaseDto {
  return {
    playerId: record.player_id,
    selectedBadgeId: record.selected_badge_id,
    updatedAt: record.updated_at
  }
}
