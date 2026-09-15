import type { SupabaseClient } from '@supabase/supabase-js'
import type { RatingAssessmentRecord } from '../dto/rating.dto'

export interface RatingAssessmentRepository {
  /** Persists one questionnaire submission. rating_assessments has no INSERT policy
   * for `authenticated` (see 064-rating-assessments.changelog.xml) — callers must
   * hand this a service-role client, as they already do for player_ratings. */
  create(record: Omit<RatingAssessmentRecord, 'id' | 'created_at'>): Promise<void>
}

export function createRatingAssessmentRepository(
  client: SupabaseClient
): RatingAssessmentRepository {
  return {
    async create(record) {
      const { error } = await client.from('rating_assessments').insert(record)
      if (error) throw error
    }
  }
}
