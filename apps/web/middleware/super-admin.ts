/**
 * Route guard for platform-wide admin screens. Uses useRequestFetch() rather
 * than useFetch() so the incoming request's cookies are forwarded during SSR —
 * a plain useFetch here resolves without the session on the server pass and
 * bounces a legitimate admin to /dashboard on first load.
 *
 * This is defence in depth only. Every admin endpoint re-checks the caller
 * server-side (see PlatformAdminService.isSuperAdmin), and the server
 * middleware refuses every /api/v1/admin call without an aal2 session
 * (server/middleware/mfa-gate.ts); never rely on this alone.
 *
 * Two-factor is mandatory for the SuperAdmin. A SuperAdmin without it is sent
 * into the setup wizard rather than to a console whose every request would
 * fail; one who has it but signed in on the password alone is sent to the
 * challenge.
 */
export default defineNuxtRouteMiddleware(async () => {
  try {
    const result = await useRequestFetch()<{
      is_superadmin: boolean
      mfa_enrolled: boolean
      aal: 'aal1' | 'aal2'
    }>('/api/v1/me/is-superadmin')
    if (!result?.is_superadmin) {
      return navigateTo('/dashboard')
    }
    if (!result.mfa_enrolled) {
      return navigateTo('/settings/security/two-factor?required=1', { replace: true })
    }
    if (result.aal !== 'aal2') {
      return navigateTo('/mfa/verify', { replace: true })
    }
  } catch {
    return navigateTo('/dashboard')
  }
})
