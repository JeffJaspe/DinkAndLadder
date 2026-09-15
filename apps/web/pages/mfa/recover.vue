<script setup lang="ts">
// Chromeless, like login: nobody reaching this page can get into the app yet.
definePageMeta({ layout: 'auth' })

useHead({ title: 'Recover your account' })

const supabase = useSupabaseClient()
const { public: publicConfig } = useRuntimeConfig()

/**
 * Password + one recovery code turns two-factor authentication OFF for the
 * account and signs the owner in, so the next stop is the setup wizard. The
 * server gives one answer to every failure; the page repeats it.
 */
const email = ref('')
const password = ref('')
const recoveryCode = ref('')
const turnstileToken = ref('')
const turnstileWidget = ref<{ reset: () => void } | null>(null)
const errorMessage = ref('')
const loading = ref(false)

async function submit() {
  errorMessage.value = ''
  if (publicConfig.turnstileSiteKey && !turnstileToken.value) {
    errorMessage.value = 'Please complete the verification challenge.'
    return
  }
  loading.value = true
  try {
    const response = await $fetch<{
      session: { access_token: string; refresh_token: string } | null
    }>('/api/v1/mfa/recover', {
      method: 'POST',
      body: {
        email: email.value,
        password: password.value,
        recovery_code: recoveryCode.value,
        turnstile_token: turnstileToken.value
      }
    })
    // See login.vue: setSession is what updates the client-side session state.
    if (response.session) {
      await supabase.auth.setSession({
        access_token: response.session.access_token,
        refresh_token: response.session.refresh_token
      })
    }
    await $fetch('/api/v1/auth/session', { method: 'POST' })
    await navigateTo('/settings/security/two-factor?reset=1', { replace: true })
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not recover your account.'
  } finally {
    turnstileToken.value = ''
    turnstileWidget.value?.reset()
    loading.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Lost your authenticator?"
    subtitle="Your password and one of the recovery codes you saved will turn two-factor off so you can set it up again."
  >
    <UiToast :message="errorMessage" variant="error" @close="errorMessage = ''" />

    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label for="recover-email" class="mb-1.5 block text-sm font-medium text-fg-secondary"
          >Email</label
        >
        <input
          id="recover-email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          placeholder="you@example.com"
          class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div>
        <label for="recover-password" class="mb-1.5 block text-sm font-medium text-fg-secondary"
          >Password</label
        >
        <input
          id="recover-password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          placeholder="Enter your password"
          class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div>
        <label for="recover-code" class="mb-1.5 block text-sm font-medium text-fg-secondary"
          >Recovery code</label
        >
        <input
          id="recover-code"
          v-model="recoveryCode"
          type="text"
          required
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          placeholder="ABCD-EFGH"
          class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 font-mono uppercase tracking-widest text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <p class="mt-1.5 text-caption text-fg-muted">
          One of the eight codes shown when you set up two-factor. Each works once.
        </p>
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
        {{ loading ? 'Checking…' : 'Turn off two-factor and sign in' }}
      </button>
    </form>

    <div class="mt-6 text-center text-sm">
      <NuxtLink to="/login" class="text-fg-muted hover:text-primary">Back to sign in</NuxtLink>
    </div>
  </AuthShell>
</template>
