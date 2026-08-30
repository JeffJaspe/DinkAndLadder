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

onMounted(async () => {
  await loadProviders()
  loadingProviders.value = false
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
                <UiIcon name="settings" />
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

      <section>
        <h2 class="mb-2 text-caption font-semibold uppercase tracking-wide text-fg-muted">
          {{ hasPassword ? 'Change your password' : 'Add a password' }}
        </h2>

        <div class="rounded-card border border-border bg-surface p-4 shadow-card">
          <p v-if="!hasPassword && !loadingProviders" class="mb-4 text-body-2 text-fg-secondary">
            You signed up with Google, so this account has no password yet. Add one and you can log
            in either way — same account, same matches, same rating.
          </p>

          <div
            v-if="successMessage"
            class="mb-4 rounded-button bg-primary/10 px-4 py-3 text-body-2 text-primary"
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
                class="w-full rounded-button border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                class="w-full rounded-button border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div
              v-if="errorMessage"
              class="rounded-button bg-red-500/10 px-4 py-3 text-body-2 text-red-400"
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
