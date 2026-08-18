import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createSponsorshipRepository } from '~/server/domains/payment/repositories/sponsorship.repository'
import { createSponsorshipService, SponsorshipServiceError } from '~/server/domains/payment/services/sponsorship.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import type { CreateSponsorshipInput } from '~/server/domains/payment/dto/sponsorship.dto'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<CreateSponsorshipInput>(event)

  if (!body.target_type || !body.target_id || !body.amount_cents) {
    throw createError({ statusCode: 400, statusMessage: 'target_type, target_id, and amount_cents are required' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const sponsorshipRepo = createSponsorshipRepository(client)
  const service = createSponsorshipService(sponsorshipRepo)

  try {
    const sponsorship = await service.createSponsorship(profile.id, body)
    return sponsorship
  } catch (err) {
    if (err instanceof SponsorshipServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
