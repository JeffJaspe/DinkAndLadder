<script setup lang="ts">
const supabase = useSupabaseClient()
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const infoMessage = ref('')
const loading = ref(false)
const googleLoading = ref(false)

async function handleRegister() {
  errorMessage.value = ''
  infoMessage.value = ''
  loading.value = true
  try {
    const { error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value
    })
    if (error) {
      errorMessage.value = error.message
      return
    }
    infoMessage.value = 'Check your email to confirm your account.'
  } finally {
    loading.value = false
  }
}

async function handleGoogleSignUp() {
  errorMessage.value = ''
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
  <div class="flex min-h-screen items-center justify-center bg-[#0B0D09] px-4 py-12">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <NuxtLink to="/" class="inline-flex items-center gap-2">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4DB175] text-xl font-bold text-white">
            D
          </div>
        </NuxtLink>
        <h1 class="mt-4 text-2xl font-bold text-white">Create your account</h1>
        <p class="mt-2 text-[#6B7B75]">Start tracking your pickleball journey</p>
      </div>

      <!-- Card -->
      <div class="rounded-xl bg-[#1E2E2A] p-6">
        <!-- Google OAuth -->
        <button
          type="button"
          :disabled="googleLoading"
          class="flex w-full items-center justify-center gap-3 rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-3 font-medium text-white transition-colors hover:bg-[#2E4540] disabled:opacity-50"
          @click="handleGoogleSignUp"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {{ googleLoading ? 'Redirecting…' : 'Continue with Google' }}
        </button>

        <!-- Divider -->
        <div class="my-6 flex items-center gap-3">
          <hr class="flex-1 border-[#3A5750]" />
          <span class="text-sm text-[#6B7B75]">or</span>
          <hr class="flex-1 border-[#3A5750]" />
        </div>

        <!-- Success Message -->
        <div v-if="infoMessage" class="mb-4 rounded-lg bg-[#4DB175]/10 px-4 py-3 text-sm text-[#4DB175]">
          {{ infoMessage }}
        </div>

        <!-- Form -->
        <form class="space-y-4" @submit.prevent="handleRegister">
          <div>
            <label for="register-email" class="mb-1.5 block text-sm font-medium text-[#A6ABA7]">Email</label>
            <input
              id="register-email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none focus:ring-1 focus:ring-[#4DB175]"
            />
          </div>

          <div>
            <label for="register-password" class="mb-1.5 block text-sm font-medium text-[#A6ABA7]">Password</label>
            <input
              id="register-password"
              v-model="password"
              type="password"
              required
              autocomplete="new-password"
              minlength="8"
              placeholder="Create a password"
              class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none focus:ring-1 focus:ring-[#4DB175]"
            />
            <p class="mt-1.5 text-xs text-[#6B7B75]">Minimum 8 characters</p>
          </div>

          <div v-if="errorMessage" class="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {{ errorMessage }}
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-[#4DB175] py-3 font-semibold text-white transition-colors hover:bg-[#5FC287] disabled:opacity-50"
          >
            {{ loading ? 'Creating account…' : 'Register' }}
          </button>
        </form>

        <!-- Terms -->
        <p class="mt-4 text-center text-xs text-[#6B7B75]">
          By signing up, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>

      <!-- Login link -->
      <p class="mt-6 text-center text-sm text-[#6B7B75]">
        Already have an account?
        <NuxtLink to="/login" class="font-medium text-[#4DB175] hover:text-[#5FC287]">
          Log in
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
