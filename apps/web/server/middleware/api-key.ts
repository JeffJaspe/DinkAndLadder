import { serverSupabaseClient } from '#supabase/server'
import { createHash } from 'crypto'

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (!path.startsWith('/api/public/')) {
    return
  }

  const apiKey = getHeader(event, 'X-API-Key')
  if (!apiKey) {
    throw createError({ statusCode: 401, statusMessage: 'API key required' })
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex')

  const client = await serverSupabaseClient(event)
  const { data: keyRecord, error } = await client
    .from('api_keys')
    .select('id, player_id, name, permissions, rate_limit, is_active, expires_at')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !keyRecord) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid API key' })
  }

  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    throw createError({ statusCode: 401, statusMessage: 'API key expired' })
  }

  await client
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id)

  event.context.apiKey = {
    id: keyRecord.id,
    playerId: keyRecord.player_id,
    name: keyRecord.name,
    permissions: keyRecord.permissions,
    rateLimit: keyRecord.rate_limit
  }
})
