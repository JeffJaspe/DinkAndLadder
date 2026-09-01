import { serverSupabaseClient } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPlayerProfileService } from '~/server/domains/player/services/player-profile.service'
import { PlayerProfileValidationError } from '~/server/domains/player/dto/player-profile.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

interface OnboardingInput {
  account_type: 'player' | 'club'
  display_name?: string
}

/**
 * `account_type` is validated but intentionally not persisted — no column backs
 * it, and both paths create the same player_profiles row (see
 * composables/useAccountMode.ts, where mode is a client-side navigation concept).
 * Kept in the contract so the choice can be recorded later without a breaking
 * change; see F-31 in the backlog.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to complete onboarding.')
  }

  const body = await readBody<OnboardingInput>(event)
  if (!body?.account_type || !['player', 'club'].includes(body.account_type)) {
    throw apiError(400, 'INVALID_INPUT', 'account_type must be "player" or "club".')
  }

  const client = await serverSupabaseClient(event)
  const service = createPlayerProfileService(createPlayerProfileRepository(client))

  try {
    // ensureProfile, not saveOwnProfile: re-entering onboarding must never
    // rename someone who already picked a display name.
    const profile = await service.ensureProfile(claims.sub, body.display_name)

    return {
      data: profile,
      message: 'Onboarding complete',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    if (err instanceof PlayerProfileValidationError) {
      throw apiError(400, 'VALIDATION_ERROR', err.message)
    }
    throw err
  }
})
