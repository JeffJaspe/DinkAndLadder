<script setup lang="ts">
import type { UserDto } from '~/server/domains/identity/dto/user.dto'

const { data: currentUser, pending, error } = await useFetch<UserDto>('/api/v1/auth/me')
const supabase = useSupabaseClient()

async function handleLogout() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 py-10">
    <h1 class="text-2xl font-semibold">Dashboard</h1>
    <p v-if="pending">Loading your profile…</p>
    <p v-else-if="error" role="alert" class="text-red-600">Could not load your profile.</p>
    <div v-else-if="currentUser">
      <p>Signed in as {{ currentUser.email }}</p>
      <p class="text-sm text-gray-500">Status: {{ currentUser.status }}</p>
    </div>
    <div class="mt-6 flex gap-3">
      <NuxtLink to="/profile/edit" class="rounded border px-3 py-2">Edit profile</NuxtLink>
      <button class="rounded border px-3 py-2" @click="handleLogout">Log out</button>
    </div>
  </main>
</template>
