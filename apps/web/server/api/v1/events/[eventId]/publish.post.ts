import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createEventService, EventServiceError } from '~/server/domains/event/services/event.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createActivityLogger } from '~/server/domains/activity/services/activity.service'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'eventId is required.' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const eventRepo = createEventRepository(serviceClient)
  const tournamentRepo = createTournamentRepository(serviceClient)
  const registrationRepo = createTournamentRegistrationRepository(serviceClient)
  const service = createEventService(eventRepo, tournamentRepo, registrationRepo)

  try {
    const publishedEvent = await service.publishEvent(profile.id, eventId)

    // Feed activity is written on PUBLISH, not on create: a draft is not public,
    // so announcing it would leak an unpublished event into other people's
    // feeds. logClubEventCreated already existed but had no caller anywhere,
    // which is why new events never appeared in the feed at all.
    if (publishedEvent.club_id) {
      const activityLogger = createActivityLogger(createActivityRepository(serviceClient))
      await activityLogger.logClubEventCreated(
        profile.id,
        publishedEvent.club_id,
        publishedEvent.id,
        publishedEvent.name
      )
    }

    return publishedEvent
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
