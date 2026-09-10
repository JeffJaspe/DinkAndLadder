import { serverSupabaseClient } from '#supabase/server'
import { createSponsorshipRepository } from '~/server/domains/payment/repositories/sponsorship.repository'
import {
  createSponsorshipService,
  SponsorshipServiceError
} from '~/server/domains/payment/services/sponsorship.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import type { CreateSponsorshipInput } from '~/server/domains/payment/dto/sponsorship.dto'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const body = await readBody<CreateSponsorshipInput>(event)

  if (!body.target_type || !body.target_id || !body.amount_cents) {
    throw apiError(
      400,
      'MISSING_PARAMETER',
      'target_type, target_id, and amount_cents are required.'
    )
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const sponsorshipRepo = createSponsorshipRepository(client)
  const service = createSponsorshipService(sponsorshipRepo)

  try {
    const sponsorship = await service.createSponsorship(profile.id, body)
    return sponsorship
  } catch (err) {
    if (err instanceof SponsorshipServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
