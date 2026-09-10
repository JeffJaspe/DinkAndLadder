import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import { createTournamentRepository } from '~/server/domains/event/repositories/tournament.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import { createTournamentCategoryService } from '~/server/domains/event/services/tournament-category.service'
import { EventServiceError } from '~/server/domains/event/services/event.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import type { TournamentFormat } from '~/server/domains/event/dto/tournament.dto'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

interface CreateCategoryBody {
  template_id?: string
  name?: string
  min_rating?: number | null
  max_rating?: number | null
  max_participants?: number | null
  match_type?: 'singles' | 'doubles' | null
  format?: TournamentFormat | null
  display_order?: number
  games_default?: number | null
  round_game_rules?: Record<string, number> | null
  target_points?: number | null
  win_by_two?: boolean | null
}

/**
 * How many games, to how many points, and which rounds differ.
 *
 * Validated here rather than trusted: these reach a check constraint
 * (046-category-game-rules requires an odd games_default in range), and a
 * rejected insert surfaces as a 500 with a Postgres string rather than
 * something an organiser can act on.
 *
 * An even best-of cannot be decided, so odd-only is the rule, and the per-round
 * overrides are held to the same one — a round is played best-of-something just
 * as the category is.
 */
function readGameRules(body: CreateCategoryBody) {
  const oddInRange = (value: number) =>
    Number.isInteger(value) && value >= 1 && value <= 9 && value % 2 === 1

  if (body.games_default != null && !oddInRange(body.games_default)) {
    throw apiError(
      400,
      'INVALID_INPUT',
      'games_default must be an odd number of games between 1 and 9.'
    )
  }

  if (body.target_points != null) {
    const points = body.target_points
    if (!Number.isInteger(points) || points < 1 || points > 99) {
      throw apiError(400, 'INVALID_INPUT', 'target_points must be a whole number between 1 and 99.')
    }
  }

  const rounds = body.round_game_rules
  if (rounds != null) {
    for (const [round, games] of Object.entries(rounds)) {
      if (!/^\d+$/.test(round) || !oddInRange(games)) {
        throw apiError(
          400,
          'INVALID_INPUT',
          `round_game_rules must map a round number to an odd game count (got ${round}: ${games}).`
        )
      }
    }
  }

  return {
    games_default: body.games_default,
    round_game_rules: rounds,
    target_points: body.target_points,
    win_by_two: body.win_by_two
  }
}

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
  const profile = await createPlayerProfileRepository(client).findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const body = await readBody<CreateCategoryBody>(event)
  const gameRules = readGameRules(body ?? {})

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createTournamentCategoryService(
    createTournamentCategoryRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createEventRepository(serviceClient)
  )

  try {
    if (body?.template_id) {
      const category = await service.createFromTemplate(profile.id, tournamentId, {
        template_id: body.template_id,
        max_participants: body.max_participants,
        display_order: body.display_order,
        match_type: body.match_type,
        format: body.format,
        ...gameRules
      })
      return category
    }

    if (!body?.name) {
      throw apiError(400, 'INVALID_INPUT', 'Provide either template_id or a custom name.')
    }

    const category = await service.createCustom(profile.id, tournamentId, {
      name: body.name,
      min_rating: body.min_rating,
      max_rating: body.max_rating,
      max_participants: body.max_participants,
      display_order: body.display_order,
      match_type: body.match_type,
      format: body.format,
      ...gameRules
    })
    return category
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
