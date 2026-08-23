import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createAnnouncementRepository } from '~/server/domains/announcement/repositories/announcement.repository'
import {
  createAnnouncementService,
  AnnouncementServiceError
} from '~/server/domains/announcement/services/announcement.service'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const clubId = getRouterParam(event, 'clubId')
  const announcementId = getRouterParam(event, 'announcementId')
  if (!announcementId) {
    throw createError({ statusCode: 400, statusMessage: 'announcementId is required.' })
  }

  const client = await serverSupabaseClient(event)
  const serviceClient = serverSupabaseServiceRole(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const announcementRepo = createAnnouncementRepository(client)
  const membershipRepo = createClubMembershipRepository(client)
  const service = createAnnouncementService(announcementRepo, membershipRepo)

  try {
    const announcement = await service.publish(profile.id, announcementId)

    // Send notifications to all club members
    if (clubId) {
      const clubRepo = createClubRepository(serviceClient)
      const club = await clubRepo.findById(clubId)
      const serviceMembershipRepo = createClubMembershipRepository(serviceClient)
      const members = await serviceMembershipRepo.listByClub(clubId)
      const activeMembers = members.filter(
        (m) => m.status === 'active' && m.player_id !== profile.id
      )

      if (activeMembers.length > 0 && club) {
        const servicePlayerRepo = createPlayerProfileRepository(serviceClient)
        const notificationService = createNotificationService(
          createNotificationRepository(serviceClient)
        )

        for (const member of activeMembers) {
          const memberProfile = await servicePlayerRepo.findById(member.player_id)
          if (memberProfile) {
            await notificationService
              .notify({
                user_id: memberProfile.user_id,
                type: 'club.announcement',
                title: `New Announcement in ${club.name}`,
                body: announcement.title,
                reference_type: 'club_announcement',
                reference_id: announcement.id
              })
              .catch(() => {})
          }
        }
      }
    }

    return announcement
  } catch (err) {
    if (err instanceof AnnouncementServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
