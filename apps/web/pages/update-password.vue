<script setup lang="ts">
// Chromeless shell: these are the pages you reach when you cannot get into the
// app, and the default layout would draw the whole sidebar around them. A
// recovery link is a real session, so gating on the session alone wrapped the
// password form in the full app and let every nav link out of the flow.
definePageMeta({ layout: 'auth' })

useHead({ title: 'Set a new password' })

const supabase = useSupabaseClient()
const password = ref('')
const confirmation = ref('')
const errorMessage = ref('')
const loading = ref(false)
// Starts null ("still checking") rather than false so the form is never shown,
// nor an error flashed, while the recovery token in the URL is still being
// exchanged for a session.
const hasRecoverySession = ref<boolean | null>(null)

/**
 * Detecting the recovery session.
 *
 * This polled `getUser()` ten times at 300 ms, so an unlucky visitor stared at
 * a spinner for three seconds before the form appeared. supabase-js emits
 * PASSWORD_RECOVERY when it finishes exchanging the token in the URL, so the
 * listener answers as soon as there is an answer. The immediate `getUser()`
 * covers the other direction — arriving after the exchange already happened,
 * when no further event will ever fire — and the timeout is the backstop for a
 * link that carries no usable token at all.
 */
let settle: ((ok: boolean) => void) | null = null

onMounted(() => {
  const { data: listener } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') settle?.(true)
  })

  settle = (ok: boolean) => {
    if (hasRecoverySession.value !== null) return
    hasRecoverySession.value = ok
    if (ok) {
      // A recovery session is good for exactly one thing. Until the password is
      // actually set, guest-only.global.ts sends every other route back here.
      lockToRecovery()
    }
    listener.subscription.unsubscribe()
    settle = null
  }

  supabase.auth.getUser().then(({ data }) => {
    if (data.user) settle?.(true)
  })

  // Not cleared on success: settle() is idempotent, so a late timer is a
  // no-op and there is no handle to track.
  setTimeout(() => settle?.(false), 3000)
})

// Leaving without setting a password must not leave the lock behind, or the
// next navigation in this tab bounces straight back here.
onBeforeUnmount(() => {
  settle = null
})

/** Abandon the reset: drop the half-session so nobody is left half-signed-in. */
async function cancelRecovery() {
  clearRecoveryLock()
  await supabase.auth.signOut()
  await navigateTo('/login')
}

async function handleUpdate() {
  errorMessage.value = ''
  if (password.value !== confirmation.value) {
    errorMessage.value = 'Those passwords do not match.'
    return
  }
  loading.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: password.value })
    if (error) {
      errorMessage.value = error.message
      return
    }
    // Mirrors /confirm: provision the application user row before routing on,
    // and let /onboarding decide profile vs rating vs dashboard.
    // The recovery session has served its purpose; release the trap before
    // routing into the app, or onboarding bounces straight back here.
    clearRecoveryLock()
    await $fetch('/api/v1/auth/session', { method: 'POST' })
    await navigateTo('/onboarding')
  } catch {
    errorMessage.value = 'Could not update your password. Request a new reset link and try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <NuxtLink to="/" class="inline-flex items-center gap-2">
          <UiBrandMark size="xl" :show-name="false" />
        </NuxtLink>
        <h1 class="mt-4 text-2xl font-bold text-fg">Set a new password</h1>
        <p class="mt-2 text-fg-muted">Choose a password for your account</p>
      </div>

      <div class="rounded-xl bg-surface p-6 shadow-card">
        <!-- Verifying the link -->
        <div v-if="hasRecoverySession === null" class="py-6 text-center">
          <div class="mb-4 flex justify-center">
            <div
              class="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"
            />
          </div>
          <p class="text-fg-muted">Checking your reset link…</p>
        </div>

        <!-- Link expired, already used, or opened directly -->
        <div v-else-if="hasRecoverySession === false" class="text-center">
          <p class="text-fg">This reset link is no longer valid.</p>
          <p class="mt-2 text-sm text-fg-muted">
            Reset links can only be used once, and they expire. Request a fresh one.
          </p>
          <NuxtLink
            to="/reset-password"
            class="mt-4 inline-block rounded-lg bg-primary px-4 py-2.5 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Send a new link
          </NuxtLink>
        </div>

        <!-- Form -->
        <form v-else class="space-y-4" @submit.prevent="handleUpdate">
          <div>
            <label for="update-password" class="mb-1.5 block text-sm font-medium text-fg-secondary"
              >New password</label
            >
            <input
              id="update-password"
              v-model="password"
              type="password"
              required
              autocomplete="new-password"
              minlength="8"
              placeholder="Create a password"
              class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p class="mt-1.5 text-xs text-fg-muted">Minimum 8 characters</p>
          </div>

          <div>
            <label
              for="update-password-confirm"
              class="mb-1.5 block text-sm font-medium text-fg-secondary"
              >Confirm password</label
            >
            <input
              id="update-password-confirm"
              v-model="confirmation"
              type="password"
              required
              autocomplete="new-password"
              minlength="8"
              placeholder="Repeat the password"
              class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div v-if="errorMessage" class="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {{ errorMessage }}
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-primary py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {{ loading ? 'Saving…' : 'Save password' }}
          </button>
        </form>
      </div>

      <p class="mt-6 text-center text-sm text-fg-muted">
        <button
          type="button"
          class="font-medium text-primary hover:text-primary-hover"
          @click="cancelRecovery"
        >
          Back to sign in
        </button>
      </p>
    </div>
  </div>
</template>
