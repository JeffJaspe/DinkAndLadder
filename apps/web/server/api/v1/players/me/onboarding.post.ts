import { serverSupabaseClient } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPlayerProfileService } from '~/server/domains/player/services/player-profile.service'
import { PlayerProfileValidationError } from '~/server/domains/player/dto/player-profile.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

interface OnboardingInput {
  display_name?: string
}

/**
 * Completing onboarding: make sure this user has a player_profiles row.
 *
 * **`account_type` used to be required here and was then thrown away** (F-31).
 * No column backs it, and both branches of the chooser create the same
 * player_profiles row — mode is a client-side navigation concept, not a stored
 * fact (composables/useAccountMode.ts). Requiring it meant the API rejected a
 * request with a 400 over a value that could not change the outcome, which is a
 * trap for the Flutter client that has yet to be written.
 *
 * It is now neither required nor read. A caller that still sends it is not
 * broken — readBody ignores unknown fields — so removing it is not a breaking
 * change. Should the choice ever need recording, it wants a column and a
 * changeset, and this handler can read it again then.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to complete onboarding.')
  }

  // Optional now that account_type is gone: an empty POST is a valid 'make sure
  // I have a profile' call, and readBody returns undefined for one.
  const body = await readBody<OnboardingInput>(event).catch(() => undefined)

  const client = await serverSupabaseClient(event)
  const service = createPlayerProfileService(createPlayerProfileRepository(client))

  try {
    // ensureProfile, not saveOwnProfile: re-entering onboarding must never
    // rename someone who already picked a display name.
    const profile = await service.ensureProfile(claims.sub, body?.display_name)

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
