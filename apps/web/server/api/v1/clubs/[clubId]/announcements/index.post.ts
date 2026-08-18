import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createAnnouncementRepository } from '~/server/domains/announcement/repositories/announcement.repository'
import { createAnnouncementService, AnnouncementServiceError } from '~/server/domains/announcement/services/announcement.service'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import type { CreateAnnouncementInput } from '~/server/domains/announcement/dto/announcement.dto'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw createError({ statusCode: 400, statusMessage: 'clubId is required.' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const body = await readBody<Omit<CreateAnnouncementInput, 'club_id'>>(event)
  if (!body.title || !body.body) {
    throw createError({ statusCode: 400, statusMessage: 'title and body are required.' })
  }

  const announcementRepo = createAnnouncementRepository(client)
  const membershipRepo = createClubMembershipRepository(client)
  const service = createAnnouncementService(announcementRepo, membershipRepo)

  try {
    const announcement = await service.create(profile.id, { ...body, club_id: clubId })
    return announcement
  } catch (err) {
    if (err instanceof AnnouncementServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
