import { serverSupabaseClient } from '#supabase/server'
import { createAnnouncementRepository } from '~/server/domains/announcement/repositories/announcement.repository'
import { createAnnouncementService } from '~/server/domains/announcement/services/announcement.service'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw createError({ statusCode: 400, statusMessage: 'clubId is required.' })
  }

  const client = await serverSupabaseClient(event)
  const user = await getOptionalUser(event)

  let playerId: string | null = null
  if (user) {
    const playerRepo = createPlayerProfileRepository(client)
    const profile = await playerRepo.findByUserId(user.sub)
    playerId = profile?.id ?? null
  }

  const announcementRepo = createAnnouncementRepository(client)
  const membershipRepo = createClubMembershipRepository(client)
  const service = createAnnouncementService(announcementRepo, membershipRepo)

  const announcements = await service.getByClub(clubId, playerId)
  return { announcements }
})
