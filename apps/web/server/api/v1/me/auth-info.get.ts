import { serverSupabaseServiceRole } from '#supabase/server'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * getOptionalUser returns decoded JWT claims, not the auth.users row, and
 * the access token carries no `created_at`. Reading it off the claims therefore
 * always yielded undefined, so "Member since" silently never rendered on the
 * profile editor.
 *
 * The signup date lives in auth.users, which is only reachable through the
 * Admin API — hence the service-role client. It is scoped to the caller's own
 * id, never a supplied one.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your account details.')
  }

  const provider = claims.app_metadata?.provider || 'email'
  const providers = claims.app_metadata?.providers || [provider]

  let createdAt: string | null = null
  try {
    const admin = serverSupabaseServiceRole(event)
    const { data, error } = await admin.auth.admin.getUserById(claims.sub)
    if (error) throw error
    createdAt = data.user?.created_at ?? null
  } catch (err) {
    // Non-essential: the page renders without it rather than failing.
    console.warn('[GET /api/v1/me/auth-info] could not read created_at:', err)
  }

  return {
    provider,
    providers,
    created_at: createdAt
  }
})
