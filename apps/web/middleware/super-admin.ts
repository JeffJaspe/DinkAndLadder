/**
 * Route guard for platform-wide admin screens. Uses useRequestFetch() rather
 * than useFetch() so the incoming request's cookies are forwarded during SSR —
 * a plain useFetch here resolves without the session on the server pass and
 * bounces a legitimate admin to /dashboard on first load.
 *
 * This is defence in depth only. Every admin endpoint re-checks the caller
 * server-side (see PlatformAdminService.isSuperAdmin); never rely on this alone.
 */
export default defineNuxtRouteMiddleware(async () => {
  try {
    const result = await useRequestFetch()<{ is_superadmin: boolean }>('/api/v1/me/is-superadmin')
    if (!result?.is_superadmin) {
      return navigateTo('/dashboard')
    }
  } catch {
    return navigateTo('/dashboard')
  }
})
