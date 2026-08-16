import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPlayerProfileService } from '~/server/domains/player/services/player-profile.service'
import { apiError } from '~/server/utils/api-error'

interface OnboardingInput {
  account_type: 'player' | 'club'
  skip_rating?: boolean
}

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims?.email) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to complete onboarding.')
  }

  const body = await readBody<OnboardingInput>(event)
  if (!body?.account_type || !['player', 'club'].includes(body.account_type)) {
    throw apiError(400, 'INVALID_INPUT', 'account_type must be "player" or "club".')
  }

  const client = await serverSupabaseClient(event)
  const service = createPlayerProfileService(createPlayerProfileRepository(client))

  const displayName = claims.email.split('@')[0]
  const profile = await service.saveOwnProfile(claims.sub, {
    display_name: displayName
  })

  return {
    data: profile,
    message: 'Onboarding complete',
    request_id: crypto.randomUUID()
  }
})
