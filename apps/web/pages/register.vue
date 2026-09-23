<script setup lang="ts">
// Chromeless shell: these are the pages you reach when you cannot get into the
// app, and the default layout would draw the whole sidebar around them. A
// recovery link is a real session, so gating on the session alone wrapped the
// password form in the full app and let every nav link out of the flow.
definePageMeta({ layout: 'auth' })

useHead({ title: 'Sign up' })

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
const facebookLoading = ref(false)
const resetLoading = ref(false)
const resetSent = ref(false)

// Codes that are expected/informational outcomes rather than real errors
// (see server/domains/identity/services/auth-error-mapper.ts) get a softer
// amber "warning" toast; everything else stays red.
const errorVariant = computed(() => {
  return errorCode.value === 'EMAIL_ALREADY_REGISTERED' || errorCode.value === 'RATE_LIMITED'
    ? 'warning'
    : 'error'
})

// The toast auto-dismisses after six seconds, which is fine for "try again"
// errors but not for this one: it is the end of the road for this form, and the
// way forward (log in, Google, or set a password via reset) needs to stay on
// screen. So it also renders as a panel in the card, kept until the typed email
// actually changes.
const accountExists = computed(() => errorCode.value === 'EMAIL_ALREADY_REGISTERED')

watch(email, () => {
  errorMessage.value = ''
  errorCode.value = ''
  resetSent.value = false
})

async function handleRegister() {
  errorMessage.value = ''
  errorCode.value = ''
  if (publicConfig.turnstileSiteKey && !turnstileToken.value) {
    errorMessage.value = 'Please complete the verification challenge.'
    errorCode.value = 'TURNSTILE_REQUIRED'
    return
  }
  loading.value = true
  try {
    await $fetch('/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: email.value,
        password: password.value,
        turnstile_token: turnstileToken.value
      }
    })
    await navigateTo({ path: '/check-email', query: { email: email.value } })
    return
  } catch (err) {
    // fetchError.data is h3's whole error envelope; the app-level code we
    // pass to apiError() ends up at statusMessage (see server/utils/api-error.ts).
    const fetchError = err as { data?: { message?: string; statusMessage?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not create your account.'
    errorCode.value = fetchError.data?.statusMessage ?? ''
  } finally {
    turnstileToken.value = ''
    turnstileWidget.value?.reset()
    loading.value = false
  }
}

async function handleGoogleSignUp() {
  errorMessage.value = ''
  errorCode.value = ''
  googleLoading.value = true
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

async function handleFacebookSignUp() {
  errorMessage.value = ''
  errorCode.value = ''
  facebookLoading.value = true
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

async function handlePasswordReset() {
  resetLoading.value = true
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (error) {
      errorMessage.value = error.message
    } else {
      resetSent.value = true
    }
  } finally {
    resetLoading.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Create your account"
    subtitle="Join the community and start tracking your matches."
  >
    <UiToast :message="errorMessage" :variant="errorVariant" @close="errorMessage = ''" />
    <div>
      <div>
        <!-- Email field is always visible and editable -->
        <div class="mb-4">
          <label for="register-email" class="mb-1.5 block text-sm font-medium text-fg-secondary"
            >Email</label
          >
          <input
            id="register-email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <!-- Account exists state: shows recovery options instead of registration -->
        <div v-if="accountExists" class="space-y-4">
          <div class="rounded-lg border border-warning/40 bg-warning-soft p-4">
            <p class="text-sm font-semibold text-warning">Account already exists</p>
            <p class="mt-1 text-sm text-fg-secondary">
              An account already exists with this email address. If you previously signed in with
              Google, continue with Google. If you want to use email and password, send yourself a
              password reset link to set or update your password.
            </p>
          </div>

          <!-- Success message after sending reset email -->
          <div
            v-if="resetSent"
            class="rounded-lg border border-success/40 bg-success-soft p-4 text-sm text-success"
          >
            Password reset email sent. Please check your inbox.
          </div>

          <!-- Social OAuth buttons for account recovery -->
          <div class="space-y-3">
            <!-- Primary: Continue with Google -->
            <button
              type="button"
              :disabled="googleLoading"
              class="flex w-full items-center justify-center gap-3 rounded-lg bg-primary px-4 py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
              @click="handleGoogleSignUp"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {{ googleLoading ? 'Redirecting…' : 'Continue with Google' }}
            </button>

            <!-- Continue with Facebook -->
            <button
              type="button"
              :disabled="facebookLoading"
              class="flex w-full items-center justify-center gap-3 rounded-lg border border-border-strong bg-canvas px-4 py-3 font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
              @click="handleFacebookSignUp"
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

          <!-- Secondary: Send Password Reset Link -->
          <button
            type="button"
            :disabled="resetLoading"
            class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-3 font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
            @click="handlePasswordReset"
          >
            {{ resetLoading ? 'Sending…' : 'Send Password Reset Link' }}
          </button>

          <!-- Sign in link -->
          <p class="text-center text-sm text-fg-muted">
            Already know your password?
            <NuxtLink
              :to="{ path: '/login', query: email ? { email } : undefined }"
              class="font-medium text-primary hover:text-primary-hover"
            >
              Sign In
            </NuxtLink>
          </p>
        </div>

        <!-- Normal registration flow -->
        <template v-else>
          <!-- Social OAuth buttons -->
          <div class="space-y-3">
            <!-- Google OAuth -->
            <button
              type="button"
              :disabled="googleLoading"
              class="flex w-full items-center justify-center gap-3 rounded-lg border border-border-strong bg-canvas px-4 py-3 font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
              @click="handleGoogleSignUp"
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
              @click="handleFacebookSignUp"
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
          <form class="space-y-4" @submit.prevent="handleRegister">
            <AuthPasswordField
              id="register-password"
              v-model="password"
              label="Password"
              autocomplete="new-password"
              :minlength="8"
              placeholder="Create a password"
              hint="Minimum 8 characters"
            />

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
              {{ loading ? 'Creating account…' : 'Register' }}
            </button>
          </form>

          <!-- Terms -->
          <p class="mt-4 text-center text-xs text-fg-muted">
            By signing up, you agree to our Terms of Service and Privacy Policy.
          </p>

          <!-- Login link -->
          <p class="mt-6 text-center text-sm text-fg-muted">
            Already have an account?
            <NuxtLink to="/login" class="font-medium text-primary hover:text-primary-hover">
              Log in
            </NuxtLink>
          </p>
        </template>
      </div>
    </div>
  </AuthShell>
</template>
