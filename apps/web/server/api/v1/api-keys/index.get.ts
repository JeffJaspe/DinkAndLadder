import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createApiKeyRepository } from '~/server/domains/apikey/repositories/apikey.repository'
import { createApiKeyService } from '~/server/domains/apikey/services/apikey.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const keyRepo = createApiKeyRepository(client)
  const service = createApiKeyService(keyRepo)

  const keys = await service.listKeys(profile.id)
  return { keys }
})
