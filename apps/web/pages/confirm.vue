<script setup lang="ts">
const supabaseUser = useSupabaseUser()
const errorMessage = ref('')

watch(
  supabaseUser,
  async (user) => {
    if (!user) return
    try {
      await $fetch('/api/v1/auth/session', { method: 'POST' })
      const profileResponse = await $fetch('/api/v1/players/me', { ignoreResponseError: true })
      if (!profileResponse || (profileResponse as any).statusCode === 404) {
        await navigateTo('/onboarding')
      } else {
        await navigateTo('/dashboard')
      }
    } catch {
      errorMessage.value = 'Could not finish signing you in. Try logging in directly.'
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[#0B0D09] p-4">
    <div class="w-full max-w-sm rounded-xl bg-[#1E2E2A] p-8 text-center">
      <!-- Loading State -->
      <template v-if="!errorMessage">
        <div class="mb-4 flex justify-center">
          <div class="h-12 w-12 animate-spin rounded-full border-4 border-[#4DB175] border-t-transparent" />
        </div>
        <h1 class="text-xl font-semibold text-white">Confirming your account</h1>
        <p class="mt-2 text-[#6B7B75]">Please wait while we verify your email...</p>
      </template>

      <!-- Error State -->
      <template v-else>
        <div class="mb-4 flex justify-center">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-red-400">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </div>
        <h1 class="text-xl font-semibold text-white">Confirmation Failed</h1>
        <p class="mt-2 text-red-400">{{ errorMessage }}</p>
        <NuxtLink
          to="/login"
          class="mt-6 inline-block rounded-lg bg-[#4DB175] px-6 py-2 font-medium text-white hover:bg-[#5FC287]"
        >
          Go to Login
        </NuxtLink>
      </template>
    </div>
  </div>
</template>
