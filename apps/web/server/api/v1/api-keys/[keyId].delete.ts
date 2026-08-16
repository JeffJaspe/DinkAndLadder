import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createApiKeyRepository } from '~/server/domains/apikey/repositories/apikey.repository'
import { createApiKeyService, ApiKeyServiceError } from '~/server/domains/apikey/services/apikey.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const keyId = getRouterParam(event, 'keyId')
  if (!keyId) {
    throw createError({ statusCode: 400, statusMessage: 'keyId is required' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.id)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const keyRepo = createApiKeyRepository(client)
  const service = createApiKeyService(keyRepo)

  try {
    await service.revokeKey(profile.id, keyId)
    return { success: true }
  } catch (err) {
    if (err instanceof ApiKeyServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
