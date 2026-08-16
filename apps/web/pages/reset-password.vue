<script setup lang="ts">
const supabase = useSupabaseClient()
const email = ref('')
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
  <div class="flex min-h-screen items-center justify-center bg-[#0B0D09] px-4 py-12">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <NuxtLink to="/" class="inline-flex items-center gap-2">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4DB175] text-xl font-bold text-white">
            D
          </div>
        </NuxtLink>
        <h1 class="mt-4 text-2xl font-bold text-white">Reset your password</h1>
        <p class="mt-2 text-[#6B7B75]">Enter your email to receive a reset link</p>
      </div>

      <!-- Card -->
      <div class="rounded-xl bg-[#1E2E2A] p-6">
        <!-- Success Message -->
        <div v-if="successMessage" class="mb-4 rounded-lg bg-[#4DB175]/10 px-4 py-3 text-sm text-[#4DB175]">
          {{ successMessage }}
        </div>

        <!-- Form -->
        <form class="space-y-4" @submit.prevent="handleReset">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[#A6ABA7]">Email</label>
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none focus:ring-1 focus:ring-[#4DB175]"
            />
          </div>

          <div v-if="errorMessage" class="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {{ errorMessage }}
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-[#4DB175] py-3 font-semibold text-white transition-colors hover:bg-[#5FC287] disabled:opacity-50"
          >
            {{ loading ? 'Sending...' : 'Send Reset Link' }}
          </button>
        </form>
      </div>

      <!-- Back to login -->
      <p class="mt-6 text-center text-sm text-[#6B7B75]">
        Remember your password?
        <NuxtLink to="/login" class="font-medium text-[#4DB175] hover:text-[#5FC287]">
          Sign in
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
