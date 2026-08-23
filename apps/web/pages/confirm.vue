<script setup lang="ts">
const supabase = useSupabaseClient()
const errorMessage = ref('')

async function finishSignIn() {
  try {
    await $fetch('/api/v1/auth/session', { method: 'POST' })
    // See login.vue: /onboarding decides no-profile vs no-rating vs dashboard.
    await navigateTo('/onboarding')
  } catch {
    errorMessage.value = 'Could not finish signing you in. Try logging in directly.'
  }
}

onMounted(async () => {
  // Actively check via getUser() (reads the live session, not a cached ref)
  // rather than passively waiting on useSupabaseUser() to update — that ref
  // only changes on a *new* auth event, so a visitor who's already signed in
  // when landing here (or whose session simply takes a moment to process
  // from the confirmation link) would otherwise see this spinner forever,
  // since no new event ever fires to trigger a watcher.
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data } = await supabase.auth.getUser()
    if (data.user) {
      await finishSignIn()
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  errorMessage.value = 'Could not finish signing you in. Try logging in directly.'
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-canvas p-4">
    <div class="w-full max-w-sm rounded-xl bg-surface p-8 text-center">
      <!-- Loading State -->
      <template v-if="!errorMessage">
        <div class="mb-4 flex justify-center">
          <div class="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
        <h1 class="text-xl font-semibold text-fg">Confirming your account</h1>
        <p class="mt-2 text-fg-muted">Please wait while we verify your email...</p>
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
        <h1 class="text-xl font-semibold text-fg">Confirmation Failed</h1>
        <p class="mt-2 text-red-400">{{ errorMessage }}</p>
        <NuxtLink
          to="/login"
          class="mt-6 inline-block rounded-lg bg-primary px-6 py-2 font-medium text-on-primary hover:bg-primary-hover"
        >
          Go to Login
        </NuxtLink>
      </template>
    </div>
  </div>
</template>
