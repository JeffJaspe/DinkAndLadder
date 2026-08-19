<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'

const {
  data: response,
  pending,
  error,
  refresh
} = await useFetch<{ data: ClubDto[] }>('/api/v1/admin/clubs/pending-verification')

const clubs = computed(() => response.value?.data ?? [])
const actionLoadingId = ref('')
const actionError = ref('')

const notAuthorized = computed(() => (error.value as { statusCode?: number })?.statusCode === 403)

async function approve(clubId: string) {
  actionError.value = ''
  actionLoadingId.value = clubId
  try {
    await $fetch(`/api/v1/admin/clubs/${clubId}/approve-verification`, { method: 'POST' })
    await refresh()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    actionError.value = fetchError.data?.message ?? 'Could not approve verification.'
  } finally {
    actionLoadingId.value = ''
  }
}

async function reject(clubId: string) {
  actionError.value = ''
  actionLoadingId.value = clubId
  try {
    await $fetch(`/api/v1/admin/clubs/${clubId}/reject-verification`, { method: 'POST' })
    await refresh()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    actionError.value = fetchError.data?.message ?? 'Could not reject verification.'
  } finally {
    actionLoadingId.value = ''
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <h1 class="text-2xl font-bold text-white">Club Verification Requests</h1>
      <p class="mt-1 text-sm text-[#6B7B75]">Super admin only.</p>

      <div v-if="pending" class="mt-6 space-y-3">
        <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <div v-else-if="notAuthorized" class="mt-6 rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">You don't have access to this page.</p>
      </div>

      <div v-else-if="error" class="mt-6 rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">Could not load pending verification requests.</p>
      </div>

      <div v-else-if="!clubs.length" class="mt-6 rounded-xl bg-[#1E2E2A] p-8 text-center">
        <p class="text-[#6B7B75]">No pending verification requests.</p>
      </div>

      <div v-else class="mt-6 space-y-3">
        <p v-if="actionError" class="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{{ actionError }}</p>
        <div v-for="club in clubs" :key="club.id" class="flex items-center justify-between rounded-xl bg-[#1E2E2A] p-4">
          <div>
            <NuxtLink :to="`/clubs/${club.id}`" class="font-medium text-white hover:text-[#4DB175]">
              {{ club.name }}
            </NuxtLink>
            <p class="text-xs text-[#6B7B75]">
              Requested {{ club.verification_requested_at ? new Date(club.verification_requested_at).toLocaleDateString() : '—' }}
            </p>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              :disabled="actionLoadingId === club.id"
              class="rounded-lg bg-[#4DB175] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
              @click="approve(club.id)"
            >
              Approve
            </button>
            <button
              type="button"
              :disabled="actionLoadingId === club.id"
              class="rounded-lg border border-[#3A5750] px-3 py-1.5 text-sm text-[#A6ABA7] hover:bg-[#2E4540] disabled:opacity-50"
              @click="reject(club.id)"
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
