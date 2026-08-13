<script setup lang="ts">
import type { PlayerProfileDto, ProfileVisibility } from '~/server/domains/player/dto/player-profile.dto'

const { data: existingProfile, pending, error } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const form = reactive({
  display_name: '',
  first_name: '',
  last_name: '',
  bio: '',
  province: '',
  city: '',
  dominant_hand: '',
  preferred_position: '',
  profile_visibility: 'public' as ProfileVisibility
})

watch(
  existingProfile,
  (profile) => {
    if (!profile) return
    form.display_name = profile.display_name
    form.first_name = profile.first_name ?? ''
    form.last_name = profile.last_name ?? ''
    form.bio = profile.bio ?? ''
    form.province = profile.province ?? ''
    form.city = profile.city ?? ''
    form.dominant_hand = profile.dominant_hand ?? ''
    form.preferred_position = profile.preferred_position ?? ''
    form.profile_visibility = profile.profile_visibility
  },
  { immediate: true }
)

const saving = ref(false)
const errorMessage = ref('')
const savedMessage = ref('')

async function handleSave() {
  errorMessage.value = ''
  savedMessage.value = ''
  saving.value = true
  try {
    await $fetch('/api/v1/players/me', {
      method: 'PATCH',
      body: {
        display_name: form.display_name,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        bio: form.bio || null,
        province: form.province || null,
        city: form.city || null,
        dominant_hand: form.dominant_hand || null,
        preferred_position: form.preferred_position || null,
        profile_visibility: form.profile_visibility
      }
    })
    savedMessage.value = 'Saved.'
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not save your profile.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-10">
    <h1 class="text-2xl font-semibold">Edit profile</h1>
    <p v-if="pending">Loading…</p>
    <p v-else-if="error && error.statusCode !== 404" role="alert" class="text-red-600">
      Could not load your profile.
    </p>
    <form v-else class="mt-6 flex flex-col gap-3" @submit.prevent="handleSave">
      <label class="flex flex-col gap-1 text-sm">
        Display name
        <input v-model="form.display_name" required class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        First name
        <input v-model="form.first_name" class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Last name
        <input v-model="form.last_name" class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Bio
        <textarea v-model="form.bio" rows="3" class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Province
        <input v-model="form.province" class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        City
        <input v-model="form.city" class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Dominant hand
        <input v-model="form.dominant_hand" class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Preferred position
        <input v-model="form.preferred_position" class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Visibility
        <select v-model="form.profile_visibility" class="rounded border px-3 py-2">
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </label>
      <p v-if="errorMessage" role="alert" class="text-sm text-red-600">{{ errorMessage }}</p>
      <p v-if="savedMessage" class="text-sm text-green-700">{{ savedMessage }}</p>
      <button
        type="submit"
        :disabled="saving"
        class="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
    </form>
    <NuxtLink to="/dashboard" class="mt-4 inline-block text-sm underline">Back to dashboard</NuxtLink>
  </main>
</template>
