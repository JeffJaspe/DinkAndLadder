import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const provider = user.app_metadata?.provider || 'email'
  const providers = user.app_metadata?.providers || [provider]
  const createdAt = user.created_at

  return {
    provider,
    providers,
    created_at: createdAt
  }
})
