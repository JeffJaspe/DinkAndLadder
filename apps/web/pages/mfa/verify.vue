<script setup lang="ts">
// Chromeless: this is the second half of signing in. The full layout would
// draw a sidebar of links around someone who is not yet allowed past here.
definePageMeta({ layout: 'auth' })

useHead({ title: 'Enter your code' })

const supabase = useSupabaseClient()
const { appName } = useBranding()

/**
 * The challenge runs in the browser on purpose: `verify` is what raises the
 * session to aal2, and the session lives in this browser's cookies. The
 * server never sees the code; it sees the `aal2` claim on the next request.
 */
const code = ref('')
const factorId = ref<string | null>(null)
const preparing = ref(true)
const loading = ref(false)
const errorMessage = ref('')

async function prepare() {
  // Excluded from the module's login redirect (nuxt.config.ts) because the
  // aal1 session must be allowed here; that also means a signed-out visitor
  // is not bounced for us.
  const { data: who } = await supabase.auth.getUser()
  if (!who.user) {
    await navigateTo('/login', { replace: true })
    return
  }
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error || !data) {
    errorMessage.value = 'Could not load your authenticator. Try signing in again.'
    preparing.value = false
    return
  }
  const verified = data.totp.find((f) => f.status === 'verified')
  if (!verified) {
    // Nothing to challenge - this session already is what it can be.
    await navigateTo('/onboarding', { replace: true })
    return
  }
  factorId.value = verified.id
  preparing.value = false
}

async function submit() {
  if (!factorId.value || loading.value) return
  errorMessage.value = ''
  const trimmed = code.value.replace(/\s/g, '')
  if (!/^\d{6}$/.test(trimmed)) {
    errorMessage.value = 'Enter the 6-digit code from your app.'
    return
  }
  loading.value = true
  try {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: factorId.value
    })
    if (challengeError || !challenge) throw challengeError ?? new Error('challenge')
    const { error } = await supabase.auth.mfa.verify({
      factorId: factorId.value,
      challengeId: challenge.id,
      code: trimmed
    })
    if (error) {
      errorMessage.value = 'That code is not right. Codes change every 30 seconds — try the current one.'
      code.value = ''
      return
    }
    // Same landing as login.vue: /onboarding decides where this account goes.
    await $fetch('/api/v1/auth/session', { method: 'POST' })
    await navigateTo('/onboarding', { replace: true })
  } catch {
    errorMessage.value = 'Could not check the code. Please try again.'
  } finally {
    loading.value = false
  }
}

async function signOut() {
  await supabase.auth.signOut()
  await navigateTo('/login', { replace: true })
}

onMounted(prepare)
</script>

<template>
  <AuthShell title="One more step" :subtitle="`Enter the code from your authenticator app to finish signing in to ${appName}`">
    <UiToast :message="errorMessage" variant="error" @close="errorMessage = ''" />

    <div v-if="preparing" class="flex items-center gap-3 text-body-2 text-fg-muted">
      <span class="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      Checking your account…
    </div>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <div>
        <label for="mfa-code" class="mb-1.5 block text-sm font-medium text-fg-secondary"
          >6-digit code</label
        >
        <input
          id="mfa-code"
          v-model="code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="7"
          autofocus
          placeholder="123 456"
          class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 font-mono text-lg tracking-[0.3em] text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <button
        type="submit"
        :disabled="loading"
        class="w-full rounded-lg bg-primary py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {{ loading ? 'Checking…' : 'Continue' }}
      </button>
    </form>

    <div class="mt-6 flex flex-col items-center gap-2 text-center text-sm">
      <NuxtLink to="/mfa/recover" class="text-fg-muted hover:text-primary">
        Lost your phone? Use a recovery code
      </NuxtLink>
      <button type="button" class="text-fg-muted hover:text-primary" @click="signOut">
        Sign out
      </button>
    </div>
  </AuthShell>
</template>
