<script setup lang="ts">
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'

const { accountMode, activeClubId, switchToClub, switchToPlayer } = useAccountMode()
const open = ref(false)
const loading = ref(false)

const { data: clubsData } = await useFetch<{ items: MyClubMembershipDto[] }>('/api/v1/clubs/mine')

// Only club owners/admins get a switcher at all — a plain member has nothing to
// switch into (matches the plan: "Only visible if user owns/admins at least one club").
const adminClubs = computed(
  () =>
    clubsData.value?.items.filter(
      (m) => m.status === 'active' && (m.role === 'OWNER' || m.role === 'ADMIN')
    ) ?? []
)

const activeClub = computed(
  () => adminClubs.value.find((m) => m.club.id === activeClubId.value)?.club ?? null
)

async function handleSwitchToPlayer() {
  open.value = false
  if (accountMode.value === 'player') return
  loading.value = true
  try {
    const me = await $fetch<{ id: string }>('/api/v1/players/me')
    const ratings = await $fetch<{ singles: { rating_value: number | null } | null }>(
      `/api/v1/players/${me.id}/ratings`
    )
    if (!ratings.singles || ratings.singles.rating_value == null) {
      // First time switching into Player mode with no rating yet (a club-only account
      // never went through the questionnaire) — determine it now, then land in Player mode.
      await navigateTo({ path: '/onboarding', query: { flow: 'rate-only', redirect: '/dashboard' } })
      return
    }
    switchToPlayer()
    await navigateTo('/dashboard')
  } finally {
    loading.value = false
  }
}

async function handleSwitchToClub(clubId: string) {
  open.value = false
  switchToClub(clubId)
  await navigateTo('/dashboard')
}
</script>

<template>
  <div v-if="adminClubs.length > 0" class="relative">
    <button
      type="button"
      :disabled="loading"
      class="flex w-full items-center justify-between gap-2 rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2.5 text-left text-sm text-white hover:bg-[#2E4540] disabled:opacity-50"
      @click="open = !open"
    >
      <span class="flex items-center gap-2 truncate">
        <span class="text-base">{{ accountMode === 'club' ? '🏆' : '🏓' }}</span>
        <span class="truncate">
          {{ accountMode === 'club' ? activeClub?.name ?? 'Club' : 'Player' }}
        </span>
      </span>
      <svg class="h-4 w-4 flex-shrink-0 text-[#6B7B75]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-lg border border-[#3A5750] bg-[#1E2E2A] shadow-lg"
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white hover:bg-[#2E4540]"
        :class="{ 'bg-[#2E4540]': accountMode === 'player' }"
        @click="handleSwitchToPlayer"
      >
        <span class="text-base">🏓</span>
        Player
      </button>
      <button
        v-for="membership in adminClubs"
        :key="membership.club.id"
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white hover:bg-[#2E4540]"
        :class="{ 'bg-[#2E4540]': accountMode === 'club' && activeClubId === membership.club.id }"
        @click="handleSwitchToClub(membership.club.id)"
      >
        <span class="text-base">🏆</span>
        <span class="truncate">{{ membership.club.name }}</span>
      </button>
    </div>
  </div>
</template>
