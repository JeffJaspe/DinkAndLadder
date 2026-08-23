export type AchievementCategory = 'milestone' | 'skill' | 'social' | 'event' | 'streak'
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface AchievementCriteria {
  type: 'count' | 'threshold' | 'exists' | 'streak'
  entity: string
  threshold?: number
  filter?: Record<string, unknown>
}

export interface AchievementDefinitionRecord {
  id: string
  key: string
  category: AchievementCategory
  tier: AchievementTier
  name: string
  description: string
  icon: string | null
  criteria: AchievementCriteria
  points: number
  is_active: boolean
  created_at: string
}

export interface AchievementDefinitionDto {
  id: string
  key: string
  category: AchievementCategory
  tier: AchievementTier
  name: string
  description: string
  icon: string | null
  points: number
}

export function toAchievementDefinitionDto(
  record: AchievementDefinitionRecord
): AchievementDefinitionDto {
  return {
    id: record.id,
    key: record.key,
    category: record.category,
    tier: record.tier,
    name: record.name,
    description: record.description,
    icon: record.icon,
    points: record.points
  }
}

export interface PlayerAchievementRecord {
  id: string
  player_id: string
  achievement_id: string
  unlocked_at: string
  claimed_at: string | null
  progress: Record<string, unknown> | null
  created_at: string
}

export interface PlayerAchievementDto {
  id: string
  player_id: string
  achievement: AchievementDefinitionDto
  unlocked_at: string
  claimed_at: string | null
}

export interface PlayerAchievementWithDefinition extends PlayerAchievementRecord {
  achievement_definitions: AchievementDefinitionRecord
}
