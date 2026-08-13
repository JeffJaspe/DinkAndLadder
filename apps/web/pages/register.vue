<script setup lang="ts">
const supabase = useSupabaseClient()
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const infoMessage = ref('')
const loading = ref(false)

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
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
    <h1 class="text-2xl font-semibold">Register</h1>
    <form class="flex flex-col gap-3" @submit.prevent="handleRegister">
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
          autocomplete="new-password"
          minlength="8"
          class="rounded border px-3 py-2"
        />
      </label>
      <p v-if="errorMessage" role="alert" class="text-sm text-red-600">{{ errorMessage }}</p>
      <p v-if="infoMessage" class="text-sm text-green-700">{{ infoMessage }}</p>
      <button
        type="submit"
        :disabled="loading"
        class="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {{ loading ? 'Creating account…' : 'Register' }}
      </button>
    </form>
    <NuxtLink to="/login" class="text-sm underline">Already have an account? Log in</NuxtLink>
  </main>
</template>
