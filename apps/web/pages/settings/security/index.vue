<script setup lang="ts">
useHead({ title: 'Sign-in methods' })

const supabase = useSupabaseClient()

const password = ref('')
const confirmation = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const loading = ref(false)

/**
 * Supabase keeps one user per email address and hangs an identity off it per
 * sign-in method, linking a Google sign-in to an existing email account (and
 * vice versa) whenever the provider vouches for the same verified address. So
 * these are two doors into one account, never two accounts — this page makes
 * that visible, and lets someone open the door they are missing.
 */
const providers = ref<string[]>([])
const loadingProviders = ref(true)

const hasPassword = computed(() => providers.value.includes('email'))
const hasGoogle = computed(() => providers.value.includes('google'))

async function loadProviders() {
  const { data } = await supabase.auth.getUser()
  providers.value = (data.user?.identities ?? []).map((identity) => identity.provider)
}

/**
 * Two-factor state comes from our API, not from Supabase directly: the API
 * also knows whether this account is one that *must* have it (SuperAdmin),
 * and how many recovery codes are left, neither of which Supabase tracks.
 */
interface MfaStatus {
  enrolled: boolean
  enrolled_at: string | null
  aal: 'aal1' | 'aal2'
  required: boolean
  recovery_codes_remaining: number
}
const mfa = ref<MfaStatus | null>(null)
const mfaError = ref('')
const loadingMfa = ref(true)

async function loadMfa() {
  mfaError.value = ''
  try {
    const response = await $fetch<{ data: MfaStatus }>('/api/v1/mfa/status')
    mfa.value = response.data
  } catch {
    mfaError.value = 'Could not check two-factor authentication.'
  }
}

const enrolledSince = computed(() => {
  if (!mfa.value?.enrolled_at) return ''
  return new Date(mfa.value.enrolled_at).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
})

// Turning it off: a fresh code in a dialog, then the status card reloads.
const disableOpen = ref(false)
const disableCode = ref('')
const disableError = ref('')
const disabling = ref(false)

async function disableMfa() {
  disableError.value = ''
  disabling.value = true
  try {
    await $fetch('/api/v1/mfa/unenroll', { method: 'POST', body: { code: disableCode.value } })
    disableOpen.value = false
    disableCode.value = ''
    await loadMfa()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    disableError.value = fetchError.data?.message ?? 'Could not turn off two-factor authentication.'
  } finally {
    disabling.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadProviders(), loadMfa()])
  loadingProviders.value = false
  loadingMfa.value = false
})

async function handleSubmit() {
  errorMessage.value = ''
  successMessage.value = ''
  if (password.value !== confirmation.value) {
    errorMessage.value = 'Those passwords do not match.'
    return
  }
  loading.value = true
  try {
    const response = await $fetch<{ message: string }>('/api/v1/auth/password', {
      method: 'POST',
      body: { password: password.value }
    })
    successMessage.value = response.message
    password.value = ''
    confirmation.value = ''
    // Setting a password attaches an `email` identity, so the summary above
    // would otherwise still claim there is no password until a reload.
    await loadProviders()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not update your password.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page-shell px-4 py-6 lg:px-6">
    <div class="mx-auto max-w-2xl">
      <UiPageHeader to="/settings" />

      <h1 class="mb-2 font-display text-heading-1 text-fg">Sign-in methods</h1>
      <p class="mb-6 text-body-2 text-fg-muted">
        These all open the same account. Adding one never creates a second.
      </p>

      <section class="mb-6">
        <div class="rounded-card border border-border bg-surface shadow-card">
          <div v-if="loadingProviders" class="p-4 text-body-2 text-fg-muted">
            Checking your account…
          </div>

          <template v-else>
            <div class="flex items-center gap-4 border-b border-border p-4">
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-surface-2 text-fg-secondary"
              >
                <UiIcon name="user" />
              </span>
              <span class="flex-1">
                <span class="block font-medium text-fg">Google</span>
                <span class="mt-0.5 block text-body-2 text-fg-muted">
                  {{ hasGoogle ? 'Connected' : 'Not connected' }}
                </span>
              </span>
              <UiIcon v-if="hasGoogle" name="verified" class="text-primary" />
            </div>

            <div class="flex items-center gap-4 p-4">
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-surface-2 text-fg-secondary"
              >
                <UiIcon name="lock" />
              </span>
              <span class="flex-1">
                <span class="block font-medium text-fg">Email and password</span>
                <span class="mt-0.5 block text-body-2 text-fg-muted">
                  {{ hasPassword ? 'Password set' : 'No password yet' }}
                </span>
              </span>
              <UiIcon v-if="hasPassword" name="verified" class="text-primary" />
            </div>
          </template>
        </div>
      </section>

      <section class="mb-6">
        <h2 class="mb-2 text-caption font-semibold uppercase tracking-widest text-fg-muted">
          Two-factor authentication
        </h2>

        <div class="rounded-card border border-border bg-surface shadow-card">
          <div v-if="loadingMfa" class="p-4 text-body-2 text-fg-muted">Checking…</div>

          <div v-else-if="mfaError" class="p-4">
            <p role="alert" class="text-body-2 text-danger">{{ mfaError }}</p>
            <button type="button" class="mt-2 text-body-2 font-medium text-primary" @click="loadMfa">
              Try again
            </button>
          </div>

          <template v-else-if="mfa">
            <div class="flex items-center gap-4 p-4">
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-surface-2 text-fg-secondary"
              >
                <UiIcon name="shield" />
              </span>
              <span class="flex-1">
                <span class="block font-medium text-fg">Authenticator app</span>
                <span class="mt-0.5 block text-body-2 text-fg-muted">
                  <template v-if="mfa.enrolled">
                    On since {{ enrolledSince }} ·
                    {{ mfa.recovery_codes_remaining }} recovery
                    {{ mfa.recovery_codes_remaining === 1 ? 'code' : 'codes' }} left
                  </template>
                  <template v-else>Off — a code from your phone at every sign-in</template>
                </span>
              </span>
              <UiIcon v-if="mfa.enrolled" name="verified" class="text-primary" />
            </div>

            <div class="border-t border-border p-4">
              <p v-if="mfa.required && !mfa.enrolled" class="mb-3 text-body-2 text-warning">
                This account administers the platform, so two-factor authentication is required.
              </p>
              <p v-else-if="mfa.required" class="mb-3 text-body-2 text-fg-secondary">
                Required for this account — it cannot be turned off.
              </p>

              <div class="flex flex-wrap gap-2">
                <NuxtLink
                  to="/settings/security/two-factor"
                  class="inline-flex items-center rounded-button bg-primary px-4 py-2.5 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  {{ mfa.enrolled ? 'Set up a new device' : 'Set up' }}
                </NuxtLink>
                <button
                  v-if="mfa.enrolled && !mfa.required"
                  type="button"
                  class="inline-flex items-center rounded-button border border-border-strong px-4 py-2.5 font-medium text-fg transition-colors hover:bg-surface-2"
                  @click="disableOpen = true"
                >
                  Turn off
                </button>
              </div>
            </div>
          </template>
        </div>
      </section>

      <UiModal
        v-model="disableOpen"
        title="Turn off two-factor authentication?"
        description="Your account will sign in with a password alone. Enter the current code from your authenticator app to confirm."
        confirm-label="Turn off"
        destructive
        :loading="disabling"
        @confirm="disableMfa"
        @cancel="disableCode = ''; disableError = ''"
      >
        <label for="disable-code" class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
          >6-digit code</label
        >
        <input
          id="disable-code"
          v-model="disableCode"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          pattern="[0-9]{6}"
          class="w-full rounded-button border border-border-strong bg-canvas px-4 py-2.5 font-mono text-lg tracking-[0.3em] text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          @keydown.enter.prevent="disableMfa"
        />
        <p v-if="disableError" role="alert" class="mt-2 text-body-2 text-danger">
          {{ disableError }}
        </p>
      </UiModal>

      <section>
        <h2 class="mb-2 text-caption font-semibold uppercase tracking-widest text-fg-muted">
          {{ hasPassword ? 'Change your password' : 'Add a password' }}
        </h2>

        <div class="rounded-card border border-border bg-surface p-4 shadow-card">
          <p v-if="!hasPassword && !loadingProviders" class="mb-4 text-body-2 text-fg-secondary">
            You signed up with Google, so this account has no password yet. Add one and you can log
            in either way — same account, same matches, same rating.
          </p>

          <div
            v-if="successMessage"
            role="status"
            class="mb-4 rounded-button bg-primary-soft px-4 py-3 text-body-2 text-primary"
          >
            {{ successMessage }}
          </div>

          <form class="space-y-4" @submit.prevent="handleSubmit">
            <div>
              <label
                for="new-password"
                class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
                >New password</label
              >
              <input
                id="new-password"
                v-model="password"
                type="password"
                required
                autocomplete="new-password"
                minlength="8"
                placeholder="Create a password"
                class="w-full rounded-button border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p class="mt-1.5 text-caption text-fg-muted">Minimum 8 characters</p>
            </div>

            <div>
              <label
                for="new-password-confirm"
                class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
                >Confirm password</label
              >
              <input
                id="new-password-confirm"
                v-model="confirmation"
                type="password"
                required
                autocomplete="new-password"
                minlength="8"
                placeholder="Repeat the password"
                class="w-full rounded-button border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div
              v-if="errorMessage"
              role="alert"
              class="rounded-button bg-danger-soft px-4 py-3 text-body-2 text-danger"
            >
              {{ errorMessage }}
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full rounded-button bg-primary py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50 sm:w-auto sm:px-6"
            >
              {{ loading ? 'Saving…' : hasPassword ? 'Change password' : 'Add password' }}
            </button>
          </form>
        </div>
      </section>
    </div>
  </div>
</template>
