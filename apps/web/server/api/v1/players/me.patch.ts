import { serverSupabaseClient } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPlayerProfileService } from '~/server/domains/player/services/player-profile.service'
import {
  parseUpdatePlayerProfileInput,
  PlayerProfileValidationError
} from '~/server/domains/player/dto/player-profile.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Body parsing lives in the player DTO module, not here, so the set of writable
 * fields is covered by a compile-time exhaustiveness check and by unit tests —
 * see UPDATABLE_TEXT_FIELD_MAP. A hand-maintained list in this handler is what
 * silently dropped `barangay` on every save.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to edit your player profile.')
  }

  let input
  try {
    input = parseUpdatePlayerProfileInput(await readBody(event))
  } catch (err) {
    if (err instanceof PlayerProfileValidationError) {
      throw apiError(400, 'VALIDATION_ERROR', err.message)
    }
    throw err
  }

  const client = await serverSupabaseClient(event)
  const service = createPlayerProfileService(createPlayerProfileRepository(client))
  const profile = await service.saveOwnProfile(claims.sub, input)

  return {
    data: profile,
    message: 'Profile saved',
    request_id: crypto.randomUUID()
  }
})
