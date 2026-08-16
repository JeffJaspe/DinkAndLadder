import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AchievementDefinitionRecord,
  PlayerAchievementRecord,
  PlayerAchievementWithDefinition
} from '../dto/achievement.dto'

const DEFINITION_COLUMNS =
  'id, key, category, tier, name, description, icon, criteria, points, is_active, created_at'

const PLAYER_ACHIEVEMENT_COLUMNS =
  'id, player_id, achievement_id, unlocked_at, claimed_at, progress, created_at'

export interface AchievementRepository {
  findAllDefinitions(): Promise<AchievementDefinitionRecord[]>
  findDefinitionById(achievementId: string): Promise<AchievementDefinitionRecord | null>
  findDefinitionByKey(key: string): Promise<AchievementDefinitionRecord | null>
  findPlayerAchievements(playerId: string): Promise<PlayerAchievementWithDefinition[]>
  findPlayerAchievement(playerId: string, achievementId: string): Promise<PlayerAchievementRecord | null>
  createPlayerAchievement(playerId: string, achievementId: string): Promise<PlayerAchievementRecord>
  claimAchievement(playerAchievementId: string): Promise<PlayerAchievementRecord>
  countPlayerAchievementPoints(playerId: string): Promise<number>
}

export function createAchievementRepository(client: SupabaseClient): AchievementRepository {
  return {
    async findAllDefinitions() {
      const { data, error } = await client
        .from('achievement_definitions')
        .select(DEFINITION_COLUMNS)
        .eq('is_active', true)
        .order('category')
        .order('points', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as AchievementDefinitionRecord[]
    },

    async findDefinitionById(achievementId) {
      const { data, error } = await client
        .from('achievement_definitions')
        .select(DEFINITION_COLUMNS)
        .eq('id', achievementId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as AchievementDefinitionRecord | null
    },

    async findDefinitionByKey(key) {
      const { data, error } = await client
        .from('achievement_definitions')
        .select(DEFINITION_COLUMNS)
        .eq('key', key)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      return data as unknown as AchievementDefinitionRecord | null
    },

    async findPlayerAchievements(playerId) {
      const { data, error } = await client
        .from('player_achievements')
        .select(`${PLAYER_ACHIEVEMENT_COLUMNS}, achievement_definitions(${DEFINITION_COLUMNS})`)
        .eq('player_id', playerId)
        .order('unlocked_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as unknown as PlayerAchievementWithDefinition[]
    },

    async findPlayerAchievement(playerId, achievementId) {
      const { data, error } = await client
        .from('player_achievements')
        .select(PLAYER_ACHIEVEMENT_COLUMNS)
        .eq('player_id', playerId)
        .eq('achievement_id', achievementId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as PlayerAchievementRecord | null
    },

    async createPlayerAchievement(playerId, achievementId) {
      const { data, error } = await client
        .from('player_achievements')
        .insert({
          player_id: playerId,
          achievement_id: achievementId
        })
        .select(PLAYER_ACHIEVEMENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as PlayerAchievementRecord
    },

    async claimAchievement(playerAchievementId) {
      const { data, error } = await client
        .from('player_achievements')
        .update({ claimed_at: new Date().toISOString() })
        .eq('id', playerAchievementId)
        .select(PLAYER_ACHIEVEMENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as PlayerAchievementRecord
    },

    async countPlayerAchievementPoints(playerId) {
      const { data, error } = await client
        .from('player_achievements')
        .select('achievement_definitions(points)')
        .eq('player_id', playerId)

      if (error) throw error

      let total = 0
      for (const row of data ?? []) {
        const def = (row as unknown as { achievement_definitions: { points: number } | null }).achievement_definitions
        if (def) total += def.points
      }
      return total
    }
  }
}
