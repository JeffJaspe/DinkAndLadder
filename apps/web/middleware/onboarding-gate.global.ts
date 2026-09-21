import { isChromelessRoute } from '~/utils/route-groups'

/**
 * Redirects signed-in users without a complete profile back to onboarding.
 *
 * "Complete" means a player_profiles row *with* a rating. A row alone is not
 * enough: the club path creates a placeholder profile before the questionnaire,
 * and an interrupted player flow leaves a profile with no rating.
 *
 * Client-only: the server pass has no user state to check, and the check
 * requires an API call anyway. Cached in useState so we don't fetch on every
 * navigation — once complete, complete until page refresh.
 *
 * Runs after mfa-gate.global.ts (alphabetical "o" > "m"), so the user has
 * already passed the MFA challenge if required.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  if (isChromelessRoute(to.path)) return

  const user = useSupabaseUser()
  if (!user.value) return

  const onboardingComplete = useState<boolean | null>('onboarding-complete', () => null)

  // Already verified this session — skip the check.
  if (onboardingComplete.value === true) return

  try {
    const ratings = await $fetch<{ singles: unknown }>('/api/v1/players/me/ratings', {
      ignoreResponseError: true
    })

    // A real ratings response with a singles value means onboarding is done.
    if (ratings && !(ratings as { statusCode?: number }).statusCode && ratings.singles) {
      onboardingComplete.value = true
      return
    }

    // No rating — send to onboarding.
    onboardingComplete.value = false
    return navigateTo('/onboarding', { replace: true })
  } catch {
    // Network error or 4xx — assume incomplete, let onboarding page sort it out.
    return navigateTo('/onboarding', { replace: true })
  }
})
