<script setup lang="ts">
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'

interface PageResponse {
  items: MyClubMembershipDto[]
}

const { data, pending, error } = await useFetch<PageResponse>('/api/v1/clubs/mine')
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-10">
    <h1 class="text-2xl font-semibold">My clubs</h1>
    <p v-if="pending">Loading…</p>
    <p v-else-if="error" role="alert" class="text-red-600">Could not load your clubs.</p>
    <ul v-else-if="data?.items.length" class="mt-4 divide-y">
      <li v-for="membership in data.items" :key="membership.id" class="py-2">
        <NuxtLink :to="`/clubs/${membership.club.id}`" class="underline">
          {{ membership.club.name }}
        </NuxtLink>
        <span class="text-xs text-gray-500">({{ membership.role }}, {{ membership.status }})</span>
      </li>
    </ul>
    <p v-else class="mt-4 text-sm text-gray-500">You haven't joined or created any clubs yet.</p>
    <NuxtLink to="/create-club" class="mt-6 inline-block text-sm underline">Create a club</NuxtLink>
    <NuxtLink to="/dashboard" class="mt-2 block text-sm underline">Back to dashboard</NuxtLink>
  </main>
</template>
