<script setup lang="ts">
// Chromeless shell: these are the pages you reach when you cannot get into the
// app, and the default layout would draw the whole sidebar around them. A
// recovery link is a real session, so gating on the session alone wrapped the
// password form in the full app and let every nav link out of the flow.
definePageMeta({ layout: 'auth' })

const supabase = useSupabaseClient()
// Prefilled when /register sends someone here to add a password to an account
// they created with Google.
const route = useRoute()
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
// Only /register hands the address over, so its presence marks the "you tried to
// sign up with an address that already has an account" arrival — worth naming,
// since someone who signed up with Google has never had a password to "reset".
const fromRegister = computed(() => typeof route.query.email === 'string')
const errorMessage = ref('')
const successMessage = ref('')
const loading = ref(false)

async function handleReset() {
  errorMessage.value = ''
  successMessage.value = ''
  loading.value = true
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
      redirectTo: `${window.location.origin}/update-password`
    })
    if (error) {
      errorMessage.value = error.message
      return
    }
    successMessage.value = 'Check your email for a password reset link.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <NuxtLink to="/" class="inline-flex items-center gap-2">
          <UiBrandMark size="xl" :show-name="false" />
        </NuxtLink>
        <h1 class="mt-4 text-2xl font-bold text-fg">Reset your password</h1>
        <p class="mt-2 text-fg-muted">Enter your email to receive a reset link</p>
      </div>

      <!-- Card -->
      <div class="rounded-xl bg-surface p-6 shadow-card">
        <p
          v-if="fromRegister"
          class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-fg-secondary"
        >
          This works even if you signed up with Google and never had a password. The link adds one
          to that same account — you'll be able to log in either way afterwards.
        </p>

        <!-- Success Message -->
        <div
          v-if="successMessage"
          class="mb-4 rounded-lg bg-primary/10 px-4 py-3 text-sm text-primary"
        >
          {{ successMessage }}
        </div>

        <!-- Form -->
        <form class="space-y-4" @submit.prevent="handleReset">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-fg-secondary">Email</label>
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
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
            {{ loading ? 'Sending...' : 'Send Reset Link' }}
          </button>
        </form>
      </div>

      <!-- Back to login -->
      <p class="mt-6 text-center text-sm text-fg-muted">
        Remember your password?
        <NuxtLink to="/login" class="font-medium text-primary hover:text-primary-hover">
          Sign in
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
