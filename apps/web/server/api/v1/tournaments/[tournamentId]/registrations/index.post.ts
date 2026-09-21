import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import {
  createEventService,
  EventServiceError
} from '~/server/domains/event/services/event.service'
import type { RegisterForTournamentInput } from '~/server/domains/event/dto/tournament.dto'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createPartnershipRepository } from '~/server/domains/partnership/repositories/partnership.repository'
import { createClubBanRepository } from '~/server/domains/club/repositories/club-ban.repository'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'
import { awardAchievementsForPlayers } from '~/server/utils/award-achievements'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const tournamentId = getRouterParam(event, 'tournamentId')
  if (!tournamentId) {
    throw apiError(400, 'MISSING_PARAMETER', 'tournamentId is required.')
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const body = await readBody<RegisterForTournamentInput>(event)

  const serviceClient = serverSupabaseServiceRole(event)

  // Check if player is banned from the club hosting this event
  const tournamentRepo = createTournamentRepository(serviceClient)
  const tournament = await tournamentRepo.findById(tournamentId)
  if (!tournament) {
    throw apiError(404, 'NOT_FOUND', 'Tournament not found.')
  }

  const eventRepo = createEventRepository(serviceClient)
  const eventRecord = await eventRepo.findById(tournament.event_id)
  if (eventRecord?.club_id) {
    const bans = createClubBanRepository(serviceClient)
    const isBanned = await bans.isPlayerBanned(eventRecord.club_id, profile.id)
    if (isBanned) {
      throw apiError(403, 'BANNED', 'You are banned from this club and cannot register for their events.')
    }
    // Also check partner if registering for doubles
    if (body?.partner_player_id) {
      const partnerBanned = await bans.isPlayerBanned(eventRecord.club_id, body.partner_player_id)
      if (partnerBanned) {
        throw apiError(403, 'PARTNER_BANNED', 'Your partner is banned from this club.')
      }
    }
  }
  const categoryRepo = createTournamentCategoryRepository(serviceClient)

  // Every rule that decides whether this entry is allowed — the partner
  // requirement, the one-entry-per-category invariant, the rating band and the
  // capacity — lives in EventService. This handler only supplies the
  // repositories those rules need and translates the failure into a status
  // code. The band check in particular used to sit here, which put business
  // logic in the wiring layer and left it reading the tournament's match type
  // and the registrant's rating alone.
  const service = createEventService(
    createEventRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createTournamentRegistrationRepository(serviceClient),
    undefined,
    undefined,
    categoryRepo,
    createPartnershipRepository(serviceClient),
    createRatingRepository(serviceClient)
  )

  const categoryId = body?.category_id ?? null

  // Ownership of the category is a routing question, not a business rule: a
  // category id belonging to a different tournament makes the URL wrong.
  if (categoryId) {
    const category = await categoryRepo.findById(categoryId)
    if (!category || category.tournament_id !== tournamentId) {
      throw apiError(404, 'NOT_FOUND', 'Category not found for this tournament.')
    }
  }

  try {
    const registration = await service.register(
      profile.id,
      tournamentId,
      body?.partner_player_id ?? null,
      categoryId
    )

    // Both halves of a doubles entry are registered by this call, and both
    // count toward 'tournament_debut' — evaluating only the player who filled
    // the form would leave their partner's record wrong.
    const partnerId = body?.partner_player_id ?? null
    const entrants = partnerId ? [profile.id, partnerId] : [profile.id]
    const entrantProfiles = await createPlayerProfileRepository(serviceClient).findByIds(entrants)
    await awardAchievementsForPlayers(
      serviceClient,
      entrantProfiles.map((p) => ({ playerId: p.id, userId: p.user_id }))
    )

    return registration
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
