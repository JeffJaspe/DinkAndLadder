import { serverSupabaseServiceRole } from '#supabase/server'
import { createKudosRepository } from '~/server/domains/kudos/repositories/kudos.repository'
import { createKudosService } from '~/server/domains/kudos/services/kudos.service'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * A player's kudos card: all six skills with their totals, zeroes included.
 *
 * Public, like the profile it sits on. The totals are a decoration on a public
 * record and hiding them would make them unverifiable — anyone can count the
 * same rows.
 */
export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) throw apiError(400, 'MISSING_PARAMETER', 'playerId is required.')

  const client = serverSupabaseServiceRole(event)
  const service = createKudosService(createKudosRepository(client), createMatchRepository(client))

  try {
    return { data: await service.forPlayer(playerId) }
  } catch (err) {
    console.error(`[GET /api/v1/players/${playerId}/kudos] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load kudos.')
  }
})
