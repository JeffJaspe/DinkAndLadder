import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPlayerProfileService } from '~/server/domains/player/services/player-profile.service'
import { PlayerProfileValidationError } from '~/server/domains/player/dto/player-profile.dto'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingService } from '~/server/domains/rating/services/rating.service'
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
  /** Required only when this user has no profile yet — see ensureProfile. */
  display_name?: string
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
  const profileRepository = createPlayerProfileRepository(client)

  // Guard against re-submission: this upsert would otherwise silently overwrite an
  // existing rating (possibly already adjusted by real match results). A player who
  // already has one gets a clear conflict instead of a silent, invisible reset.
  const existingProfile = await profileRepository.findByUserId(claims.sub)
  if (existingProfile) {
    const ratingService = createRatingService(createRatingRepository(client))
    const existingRating = await ratingService.getRating(existingProfile.id, 'singles')
    if (existingRating?.rating_value != null) {
      throw apiError(
        409,
        'ALREADY_RATED',
        'You already have an initial rating. The assessment can only be taken once.'
      )
    }
  }

  // ensureProfile, not saveOwnProfile with an email-derived name: display_name
  // is published via the public-read RLS policy on player_profiles, so
  // defaulting it to the email local part leaked a real name onto a public
  // profile. It also must not overwrite a name an existing player already set.
  const profileService = createPlayerProfileService(profileRepository)
  try {
    await profileService.ensureProfile(claims.sub, body.display_name)
  } catch (err) {
    if (err instanceof PlayerProfileValidationError) {
      throw apiError(400, 'VALIDATION_ERROR', err.message)
    }
    throw err
  }

  const { data: profile } = await client
    .from('player_profiles')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!profile) {
    throw apiError(500, 'PROFILE_NOT_FOUND', 'Could not find player profile after creation.')
  }

  // player_ratings has no INSERT/UPDATE RLS policy for the authenticated role (only
  // player_ratings_select_all — see 008-security.changelog.xml) by design: ratings are
  // system-managed, not directly writable by players. This upsert must go through
  // service-role. Also check the error explicitly — the previous version silently
  // discarded it, so the RLS rejection above never surfaced: the endpoint kept
  // returning a computed "success" response (correct rating/tier, real celebration
  // screen) while the actual row was never written.
  const serviceClient = serverSupabaseServiceRole(event)
  const now = new Date().toISOString()
  for (const ratingType of ['singles', 'doubles'] as const) {
    const { error: upsertError } = await serviceClient.from('player_ratings').upsert(
      {
        player_id: profile.id,
        rating_type: ratingType,
        rating_value: rating,
        confidence_score: 1.0,
        matches_played: 0,
        // provisional is a generated column (matches_played < 5) — Postgres
        // rejects any write that names it explicitly.
        calculated_at: now,
        updated_at: now
      },
      { onConflict: 'player_id,rating_type' }
    )
    if (upsertError) {
      console.error('[POST /api/v1/rating/submit-assessment] player_ratings upsert failed:', upsertError)
      throw apiError(500, 'INTERNAL_ERROR', 'Could not save your initial rating. Please try again.')
    }
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
