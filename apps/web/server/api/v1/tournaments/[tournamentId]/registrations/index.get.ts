import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createEventService } from '~/server/domains/event/services/event.service'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const tournamentId = getRouterParam(event, 'tournamentId')
  if (!tournamentId) {
    throw apiError(400, 'MISSING_PARAMETER', 'tournamentId is required.')
  }

  const client = await serverSupabaseClient(event)
  const eventRepo = createEventRepository(client)
  const tournamentRepo = createTournamentRepository(client)
  const registrationRepo = createTournamentRegistrationRepository(client)
  const service = createEventService(eventRepo, tournamentRepo, registrationRepo)

  const rows = await service.getRegistrationsWithPlayers(tournamentId)

  // Signed avatar URLs, once per roster and in parallel — the same shape as
  // the open play roster and the player directory. The bucket path never
  // leaves the server.
  const assets = createBrandingAssetRepository(serverSupabaseServiceRole(event))
  const urls = new Map(
    await Promise.all(
      rows
        .filter((r) => r.avatar_path)
        .map(async (r) => [r.player_id, await assets.resolveUrl(r.avatar_path!)] as const)
    )
  )

  const registrations = rows.map(({ avatar_path: _path, ...row }) => ({
    ...row,
    avatar_url: urls.get(row.player_id) ?? null
  }))
  return { registrations }
})
