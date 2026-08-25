import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createBracketRepository } from '~/server/domains/event/repositories/bracket.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import {
  createBracketService,
  BracketServiceError
} from '~/server/domains/event/services/bracket.service'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'

export default defineEventHandler(async (event) => {
  const tournamentId = getRouterParam(event, 'tournamentId')
  if (!tournamentId) {
    throw createError({ statusCode: 400, statusMessage: 'tournamentId is required.' })
  }

  const client = await serverSupabaseClient(event)
  const bracketRepo = createBracketRepository(client)
  const tournamentRepo = createTournamentRepository(client)
  const registrationRepo = createTournamentRegistrationRepository(client)
  const eventRepo = createEventRepository(client)
  // The user client throughout, deliberately: bracket visibility is a database
  // rule (bracket_matches_select_visible), and the scores this now joins are
  // governed by match_scores_select_event from 029. Reading them through the
  // service role would hand back rows the viewer is not entitled to see.
  const matchRepo = createMatchRepository(client)
  // The category repository is what lets the service read each category's own
  // lock rather than only the tournament's.
  const service = createBracketService(
    bracketRepo,
    tournamentRepo,
    registrationRepo,
    eventRepo,
    matchRepo,
    createTournamentCategoryRepository(client)
  )

  // Absent entirely -> all matches regardless of category (tournaments with no
  // categories at all). Present -> that category's matches only.
  const rawCategoryId = getQuery(event).category_id
  const categoryId = typeof rawCategoryId === 'string' ? rawCategoryId : undefined

  /**
   * Who is asking, so the service can decide whether an unlocked draw is
   * theirs to see. Still an unauthenticated endpoint — a signed-out visitor
   * simply gets no viewer and therefore only locked draws, which is the same
   * answer any non-organiser gets.
   */
  const claims = await serverSupabaseUser(event).catch(() => null)
  const viewerPlayerId = claims
    ? ((await createPlayerProfileRepository(client).findByUserId(claims.sub))?.id ?? null)
    : null

  try {
    const bracket = await service.getBracket(tournamentId, categoryId, viewerPlayerId)
    return bracket
  } catch (err) {
    if (err instanceof BracketServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
