<script setup lang="ts">
const supabase = useSupabaseClient()
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const loading = ref(false)

async function handleLogin() {
  errorMessage.value = ''
  loading.value = true
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value
    })
    if (error) {
      errorMessage.value = error.message
      return
    }
    await $fetch('/api/v1/auth/session', { method: 'POST' })
    await navigateTo('/dashboard')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
    <h1 class="text-2xl font-semibold">Log in</h1>
    <form class="flex flex-col gap-3" @submit.prevent="handleLogin">
      <label class="flex flex-col gap-1 text-sm">
        Email
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="rounded border px-3 py-2"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Password
        <input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="rounded border px-3 py-2"
        />
      </label>
      <p v-if="errorMessage" role="alert" class="text-sm text-red-600">{{ errorMessage }}</p>
      <button
        type="submit"
        :disabled="loading"
        class="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {{ loading ? 'Signing in…' : 'Log in' }}
      </button>
    </form>
    <NuxtLink to="/register" class="text-sm underline">Need an account? Register</NuxtLink>
  </main>
</template>
