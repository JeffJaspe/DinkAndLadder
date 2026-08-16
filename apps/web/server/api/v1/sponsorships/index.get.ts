import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createSponsorshipRepository } from '~/server/domains/payment/repositories/sponsorship.repository'
import { createSponsorshipService } from '~/server/domains/payment/services/sponsorship.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const type = query.type as 'given' | 'received' | undefined

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.id)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const sponsorshipRepo = createSponsorshipRepository(client)
  const service = createSponsorshipService(sponsorshipRepo)

  if (type === 'given') {
    const sponsorships = await service.listGiven(profile.id)
    return { sponsorships }
  }

  const sponsorships = await service.listReceivedByPlayer(profile.id)
  const total = await service.getTotalReceivedByPlayer(profile.id)
  return { sponsorships, total_received_cents: total }
})
