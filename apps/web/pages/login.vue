<script setup lang="ts">
// Chromeless shell: these are the pages you reach when you cannot get into the
// app, and the default layout would draw the whole sidebar around them. A
// recovery link is a real session, so gating on the session alone wrapped the
// password form in the full app and let every nav link out of the flow.
definePageMeta({ layout: 'auth' })

useHead({ title: 'Log in' })

const { appName } = useBranding()

const supabase = useSupabaseClient()
const { public: publicConfig } = useRuntimeConfig()
// Prefilled when /register hands someone over here because their address
// already has an account — retyping it would be pure friction.
const route = useRoute()
// "Remember me": on, the session survives closing the browser and the address
// is kept for next time; off, closing the browser signs you out and nothing
// is kept. A remembered address wins the prefill only when /register did not
// hand one over — that one is about *this* visit.
const { isRemembered, rememberedEmail, remember, forget } = useRememberMe()
const rememberMe = ref(isRemembered.value)
const email = ref(
  typeof route.query.email === 'string' ? route.query.email : rememberedEmail.value
)
const password = ref('')
const turnstileToken = ref('')
const turnstileWidget = ref<{ reset: () => void } | null>(null)
const errorMessage = ref('')
const errorCode = ref('')
const loading = ref(false)
const googleLoading = ref(false)
const facebookLoading = ref(false)

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
  // Recorded before the session exists so the lifetime plugin sees the
  // choice the moment the auth cookies land (plugins/session-lifetime.client.ts).
  applyRememberChoice()
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
    // A two-factor account is only half signed in. The route guard would
    // catch this on the next navigation anyway; going straight there avoids a
    // flash of the destination first.
    if (await needsMfaChallenge(supabase)) {
      await navigateTo('/mfa/verify', { replace: true })
      return
    }
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

function applyRememberChoice() {
  if (rememberMe.value) remember(email.value)
  else forget()
}

async function handleGoogleLogin() {
  errorMessage.value = ''
  errorCode.value = ''
  googleLoading.value = true
  // The address is Google's to tell us; only the lifetime choice is known here.
  if (rememberMe.value) remember(rememberedEmail.value)
  else forget()
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/confirm`,
        queryParams: { prompt: 'select_account' }
      }
    })
    if (error) {
      errorMessage.value = error.message
    }
  } finally {
    googleLoading.value = false
  }
}

async function handleFacebookLogin() {
  errorMessage.value = ''
  errorCode.value = ''
  facebookLoading.value = true
  if (rememberMe.value) remember(rememberedEmail.value)
  else forget()
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: `${window.location.origin}/confirm`,
        scopes: 'email,public_profile'
      }
    })
    if (error) {
      errorMessage.value = error.message
    }
  } finally {
    facebookLoading.value = false
  }
}
</script>

<template>
  <AuthShell title="Welcome back" :subtitle="`Sign in to continue to ${appName}`">
    <UiToast :message="errorMessage" :variant="errorVariant" @close="errorMessage = ''" />
    <div>
      <!-- No card: AuthShell already separates the form side from the brand
           field, and a panel inside a panel is the nesting the system bans. -->
      <div>
        <!-- Social OAuth buttons -->
        <div class="space-y-3">
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

          <!-- Facebook OAuth -->
          <button
            type="button"
            :disabled="facebookLoading"
            class="flex w-full items-center justify-center gap-3 rounded-lg border border-border-strong bg-canvas px-4 py-3 font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
            @click="handleFacebookLogin"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#1877F2"
                d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
              />
            </svg>
            {{ facebookLoading ? 'Redirecting…' : 'Continue with Facebook' }}
          </button>
        </div>

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
              class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <AuthPasswordField
            id="login-password"
            v-model="password"
            label="Password"
            autocomplete="current-password"
            placeholder="Enter your password"
          />

          <!-- The label wraps the box and the words: on a phone the words are
               where the thumb lands. The caption says what "off" costs, since
               signing out on close is the part nobody expects. -->
          <label class="flex cursor-pointer items-start gap-3 pt-1">
            <input v-model="rememberMe" type="checkbox" class="peer sr-only" />
            <span
              class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-badge border border-border-strong bg-canvas text-on-primary transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
              aria-hidden="true"
            >
              <UiIcon name="check" size="h-3.5 w-3.5" :stroke-width="3" class="transition-opacity" />
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-medium text-fg">Remember me on this device</span>
              <span class="mt-0.5 block text-caption text-fg-muted">
                Stay signed in and keep your email filled in. Leave it off on a shared device —
                you're signed out when the browser closes.
              </span>
            </span>
          </label>

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
  </AuthShell>
</template>
