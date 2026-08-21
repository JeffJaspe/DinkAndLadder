export default defineNuxtRouteMiddleware(async () => {
  const { data } = await useFetch<{ is_superadmin: boolean }>('/api/v1/me/is-superadmin')

  if (!data.value?.is_superadmin) {
    return navigateTo('/dashboard')
  }
})
