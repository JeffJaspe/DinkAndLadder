<script setup lang="ts">
useHead({ title: 'Log in' })

const { appName } = useBranding()

const supabase = useSupabaseClient()
const { public: publicConfig } = useRuntimeConfig()
const email = ref('')
const password = ref('')
const turnstileToken = ref('')
const turnstileWidget = ref<{ reset: () => void } | null>(null)
const errorMessage = ref('')
const errorCode = ref('')
const loading = ref(false)
const googleLoading = ref(false)

// Codes that are expected/informational outcomes rather than real errors
// (see server/domains/identity/services/auth-error-mapper.ts) get a softer
// amber "warning" toast; everything else (e.g. wrong password) stays red.
const errorVariant = computed(() => {
  return errorCode.value === 'RATE_LIMITED' || errorCode.value === 'EMAIL_NOT_CONFIRMED'
    ? 'warning'
    : 'error'
})

async function handleLogin() {
  errorMessage.value = ''
  errorCode.value = ''
  if (publicConfig.turnstileSiteKey && !turnstileToken.value) {
    errorMessage.value = 'Please complete the verification challenge.'
    errorCode.value = 'TURNSTILE_REQUIRED'
    return
  }
  loading.value = true
  try {
    const loginResponse = await $fetch<{
      session: { access_token: string; refresh_token: string } | null
    }>('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: email.value,
        password: password.value,
        turnstile_token: turnstileToken.value
      }
    })
    // setSession() (not getSession()) is what actually fires
    // @nuxtjs/supabase's onAuthStateChange listener and updates the reactive
    // session state its route guard reads — cookies alone don't.
    if (loginResponse.session) {
      await supabase.auth.setSession({
        access_token: loginResponse.session.access_token,
        refresh_token: loginResponse.session.refresh_token
      })
    }
    await $fetch('/api/v1/auth/session', { method: 'POST' })
    // /onboarding itself now decides where to land: no profile yet -> account
    // type chooser, profile but no saved rating (e.g. a prior submission that
    // never actually persisted) -> straight to the questionnaire, otherwise ->
    // dashboard. Routing everyone through it avoids duplicating that logic here.
    await navigateTo('/onboarding')
  } catch (err) {
    // fetchError.data is h3's whole error envelope; the app-level code we
    // pass to apiError() ends up at statusMessage (see server/utils/api-error.ts).
    const fetchError = err as { data?: { message?: string; statusMessage?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not sign you in.'
    errorCode.value = fetchError.data?.statusMessage ?? ''
  } finally {
    turnstileToken.value = ''
    turnstileWidget.value?.reset()
    loading.value = false
  }
}

async function handleGoogleLogin() {
  errorMessage.value = ''
  errorCode.value = ''
  googleLoading.value = true
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/confirm`
      }
    })
    if (error) {
      errorMessage.value = error.message
    }
  } finally {
    googleLoading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
    <UiToast :message="errorMessage" :variant="errorVariant" @close="errorMessage = ''" />
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <NuxtLink to="/" class="inline-flex items-center gap-2">
          <UiBrandMark size="xl" :show-name="false" />
        </NuxtLink>
        <h1 class="mt-4 text-2xl font-bold text-fg">Welcome back</h1>
        <p class="mt-2 text-fg-muted">Sign in to continue to {{ appName }}</p>
      </div>

      <!-- Card -->
      <div class="rounded-xl bg-surface p-6 shadow-card">
        <!-- Google OAuth -->
        <button
          type="button"
          :disabled="googleLoading"
          class="flex w-full items-center justify-center gap-3 rounded-lg border border-border-strong bg-canvas px-4 py-3 font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
          @click="handleGoogleLogin"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {{ googleLoading ? 'Redirecting…' : 'Continue with Google' }}
        </button>

        <!-- Divider -->
        <div class="my-6 flex items-center gap-3">
          <hr class="flex-1 border-border-strong" />
          <span class="text-sm text-fg-muted">or</span>
          <hr class="flex-1 border-border-strong" />
        </div>

        <!-- Form -->
        <form class="space-y-4" @submit.prevent="handleLogin">
          <div>
            <label for="login-email" class="mb-1.5 block text-sm font-medium text-fg-secondary"
              >Email</label
            >
            <input
              id="login-email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label for="login-password" class="mb-1.5 block text-sm font-medium text-fg-secondary"
              >Password</label
            >
            <input
              id="login-password"
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="Enter your password"
              class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <TurnstileWidget
            v-if="publicConfig.turnstileSiteKey"
            ref="turnstileWidget"
            :site-key="publicConfig.turnstileSiteKey"
            @verified="turnstileToken = $event"
            @expired="turnstileToken = ''"
            @error="turnstileToken = ''"
          />

          <button
            type="submit"
            :disabled="loading || (!!publicConfig.turnstileSiteKey && !turnstileToken)"
            class="w-full rounded-lg bg-primary py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <!-- Links -->
        <div class="mt-6 text-center text-sm">
          <NuxtLink to="/reset-password" class="text-fg-muted hover:text-primary">
            Forgot password?
          </NuxtLink>
        </div>
      </div>

      <!-- Register link -->
      <p class="mt-6 text-center text-sm text-fg-muted">
        Don't have an account?
        <NuxtLink to="/register" class="font-medium text-primary hover:text-primary-hover">
          Register
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
