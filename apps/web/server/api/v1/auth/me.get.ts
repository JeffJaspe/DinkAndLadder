import { serverSupabaseClient } from '#supabase/server'
import { createUserRepository } from '~/server/domains/identity/repositories/user.repository'
import { createAuthService } from '~/server/domains/identity/services/auth.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Uses the user-scoped client (not service role) so this read is also covered
 * by the users_select_own RLS policy — defense in depth on top of the app-level check.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your profile.')
  }

  const client = await serverSupabaseClient(event)
  const service = createAuthService(createUserRepository(client))
  const user = await service.getCurrentUser(claims.sub)

  if (!user) {
    throw apiError(
      404,
      'NOT_FOUND',
      'No application profile exists for this identity yet. Call POST /api/v1/auth/session first.'
    )
  }

  return user
})
