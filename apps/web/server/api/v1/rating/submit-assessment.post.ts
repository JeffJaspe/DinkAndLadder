import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPlayerProfileService } from '~/server/domains/player/services/player-profile.service'
import {
  QUESTION_BANK,
  calculateInitialRating,
  getTierForRating
} from '~/server/domains/rating/data/question-bank'
import { apiError } from '~/server/utils/api-error'

interface AssessmentAnswer {
  questionId: string
  choiceIndex: number
}

interface SubmitAssessmentInput {
  answers: AssessmentAnswer[]
}

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims?.email) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to submit your assessment.')
  }

  const body = await readBody<SubmitAssessmentInput>(event)
  if (!body?.answers || !Array.isArray(body.answers) || body.answers.length !== 7) {
    throw apiError(400, 'INVALID_INPUT', 'Exactly 7 answers are required.')
  }

  const questionMap = new Map(QUESTION_BANK.map((q) => [q.id, q]))
  const pointsByQuestion: Record<string, number> = {}

  for (const answer of body.answers) {
    const question = questionMap.get(answer.questionId)
    if (!question) {
      throw apiError(400, 'INVALID_QUESTION', `Unknown question: ${answer.questionId}`)
    }
    if (answer.choiceIndex < 0 || answer.choiceIndex >= question.choices.length) {
      throw apiError(400, 'INVALID_CHOICE', `Invalid choice for question: ${answer.questionId}`)
    }
    pointsByQuestion[answer.questionId] = question.choices[answer.choiceIndex].points
  }

  const rating = calculateInitialRating(pointsByQuestion)
  const tier = getTierForRating(rating)

  const client = await serverSupabaseClient(event)

  const profileService = createPlayerProfileService(createPlayerProfileRepository(client))
  const displayName = claims.email.split('@')[0]
  await profileService.saveOwnProfile(claims.sub, { display_name: displayName })

  const { data: profile } = await client
    .from('player_profiles')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!profile) {
    throw apiError(500, 'PROFILE_NOT_FOUND', 'Could not find player profile after creation.')
  }

  const now = new Date().toISOString()
  for (const ratingType of ['singles', 'doubles'] as const) {
    await client.from('player_ratings').upsert(
      {
        player_id: profile.id,
        rating_type: ratingType,
        rating_value: rating,
        confidence_score: 1.0,
        matches_played: 0,
        provisional: true,
        calculated_at: now,
        updated_at: now
      },
      { onConflict: 'player_id,rating_type' }
    )
  }

  return {
    data: {
      rating,
      tier: {
        name: tier.name,
        description: tier.description,
        color: tier.color
      }
    },
    message: 'Assessment complete',
    request_id: crypto.randomUUID()
  }
})
