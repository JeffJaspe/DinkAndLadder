import { serverSupabaseClient } from '#supabase/server'
import { createAnnouncementRepository } from '~/server/domains/announcement/repositories/announcement.repository'
import {
  createAnnouncementService,
  AnnouncementServiceError
} from '~/server/domains/announcement/services/announcement.service'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import type { CreateAnnouncementInput } from '~/server/domains/announcement/dto/announcement.dto'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'MISSING_PARAMETER', 'clubId is required.')
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const body = await readBody<Omit<CreateAnnouncementInput, 'club_id'>>(event)
  if (!body.title || !body.body) {
    throw apiError(400, 'MISSING_PARAMETER', 'title and body are required.')
  }

  const announcementRepo = createAnnouncementRepository(client)
  const membershipRepo = createClubMembershipRepository(client)
  const service = createAnnouncementService(announcementRepo, membershipRepo)

  try {
    const announcement = await service.create(profile.id, { ...body, club_id: clubId })
    return announcement
  } catch (err) {
    if (err instanceof AnnouncementServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
