<script setup lang="ts">
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

const route = useRoute()
const { data: profile, pending, error } = await useFetch<PlayerProfileDto>(
  () => `/api/v1/players/${route.params.playerId}`
)
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-10">
    <p v-if="pending">Loading…</p>
    <p v-else-if="error" role="alert" class="text-red-600">
      {{ error.statusCode === 404 ? 'This profile is private or does not exist.' : 'Could not load this profile.' }}
    </p>
    <div v-else-if="profile">
      <h1 class="text-2xl font-semibold">{{ profile.display_name }}</h1>
      <p v-if="profile.city || profile.province" class="text-sm text-gray-500">
        {{ [profile.city, profile.province].filter(Boolean).join(', ') }}
      </p>
      <p v-if="profile.bio" class="mt-4">{{ profile.bio }}</p>
      <dl class="mt-4 grid grid-cols-2 gap-2 text-sm text-gray-600">
        <template v-if="profile.dominant_hand">
          <dt class="font-medium">Dominant hand</dt>
          <dd>{{ profile.dominant_hand }}</dd>
        </template>
        <template v-if="profile.preferred_position">
          <dt class="font-medium">Preferred position</dt>
          <dd>{{ profile.preferred_position }}</dd>
        </template>
      </dl>
    </div>
  </main>
</template>
