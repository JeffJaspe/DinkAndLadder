<script setup lang="ts">
const supabaseUser = useSupabaseUser()
const errorMessage = ref('')

watch(
  supabaseUser,
  async (user) => {
    if (!user) return
    try {
      await $fetch('/api/v1/auth/session', { method: 'POST' })
      await navigateTo('/dashboard')
    } catch {
      errorMessage.value = 'Could not finish signing you in. Try logging in directly.'
    }
  },
  { immediate: true }
)
</script>

<template>
  <main
    class="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-4 text-center"
  >
    <p v-if="!errorMessage">Confirming your account…</p>
    <template v-else>
      <p role="alert" class="text-red-600">{{ errorMessage }}</p>
      <NuxtLink to="/login" class="text-sm underline">Go to login</NuxtLink>
    </template>
  </main>
</template>
