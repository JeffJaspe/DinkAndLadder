import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPlayerProfileService } from '~/server/domains/player/services/player-profile.service'
import { createPlayerAvatarService } from '~/server/domains/player/services/player-avatar.service'
import { PlayerProfileValidationError } from '~/server/domains/player/dto/player-profile.dto'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingAssessmentRepository } from '~/server/domains/rating/repositories/rating-assessment.repository'
import { createRatingService } from '~/server/domains/rating/services/rating.service'
import {
  INITIAL_RATING_ALGORITHM_VERSION,
  InitialRatingValidationError,
  calculateProvisionalRating,
  type AssessmentAnswer
} from '~/server/domains/rating/services/initial-rating.service'
import { getTierForRating } from '~/server/domains/rating/data/question-bank'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

interface SubmitAssessmentInput {
  /** Required only when this user has no profile yet — see ensureProfile. */
  display_name?: string
  answers: AssessmentAnswer[]
}

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims?.email) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to submit your assessment.')
  }

  const body = await readBody<SubmitAssessmentInput>(event)
  if (!body?.answers || !Array.isArray(body.answers)) {
    throw apiError(400, 'INVALID_INPUT', 'Answers are required.')
  }

  // Validation (every question answered once, valid choice) and scoring both
  // live in the domain service; this handler only maps its errors to HTTP.
  let result: ReturnType<typeof calculateProvisionalRating>
  try {
    result = calculateProvisionalRating(body.answers)
  } catch (err) {
    if (err instanceof InitialRatingValidationError) {
      throw apiError(400, err.code, err.message)
    }
    throw err
  }
  const tier = getTierForRating(result.rating)

  const client = await serverSupabaseClient(event)
  const serviceClient = serverSupabaseServiceRole(event)
  const profileRepository = createPlayerProfileRepository(client)

  // Get OAuth avatar URL if available (e.g. Google profile picture).
  let oauthAvatarUrl: string | null = null
  try {
    const { data } = await serviceClient.auth.admin.getUserById(claims.sub)
    oauthAvatarUrl = data?.user?.user_metadata?.avatar_url ?? null
  } catch {
    // Not fatal — proceed without the avatar.
  }

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

  // Import OAuth avatar if this is a new profile without one.
  const fullProfile = await profileRepository.findByUserId(claims.sub)
  if (oauthAvatarUrl && fullProfile && !fullProfile.avatar_path) {
    const avatarService = createPlayerAvatarService(
      profileRepository,
      createBrandingAssetRepository(serviceClient)
    )
    await avatarService.importFromUrl(profile.id, oauthAvatarUrl)
  }

  // player_ratings has no INSERT/UPDATE RLS policy for the authenticated role (only
  // player_ratings_select_all — see 008-security.changelog.xml) by design: ratings are
  // system-managed, not directly writable by players. This upsert must go through
  // service-role. Also check the error explicitly — the previous version silently
  // discarded it, so the RLS rejection above never surfaced: the endpoint kept
  // returning a computed "success" response (correct rating/tier, real celebration
  // screen) while the actual row was never written.
  const now = new Date().toISOString()
  for (const ratingType of ['singles', 'doubles'] as const) {
    const { error: upsertError } = await serviceClient.from('player_ratings').upsert(
      {
        player_id: profile.id,
        rating_type: ratingType,
        rating_value: result.rating,
        // Variance seed by questionnaire reliability — see
        // INITIAL_CONFIDENCE_BY_RELIABILITY in initial-rating.service.ts.
        confidence_score: result.confidence_score,
        matches_played: 0,
        // provisional is a generated column (matches_played < 5) — Postgres
        // rejects any write that names it explicitly.
        calculated_at: now,
        updated_at: now
      },
      { onConflict: 'player_id,rating_type' }
    )
    if (upsertError) {
      console.error(
        '[POST /api/v1/rating/submit-assessment] player_ratings upsert failed:',
        upsertError
      )
      throw apiError(500, 'INTERNAL_ERROR', 'Could not save your initial rating. Please try again.')
    }
  }

  // The audit row is written after the rating so a failure here cannot leave the
  // player rated-but-unrecorded on retry (the ALREADY_RATED guard above would then
  // block them). Losing the audit row is logged, not fatal: the rating is the
  // thing the player is waiting on.
  try {
    await createRatingAssessmentRepository(serviceClient).create({
      player_id: profile.id,
      answers: result.answers,
      dimension_scores: result.dimension_scores,
      technical_rating: result.technical_rating,
      provisional_rating: result.rating,
      self_reported_level: result.self_reported_level,
      reliability: result.reliability,
      flags: result.flags,
      calculation_version: INITIAL_RATING_ALGORITHM_VERSION
    })
  } catch (err) {
    console.error('[POST /api/v1/rating/submit-assessment] rating_assessments insert failed:', err)
  }

  return {
    data: {
      rating: result.rating,
      reliability: result.reliability,
      flags: result.flags,
      tier: {
        name: tier.name,
        description: tier.description
      }
    },
    message: 'Assessment complete',
    request_id: crypto.randomUUID()
  }
})
