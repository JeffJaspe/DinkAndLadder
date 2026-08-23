<script setup lang="ts">
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'

const { accountMode, activeClubId, switchToClub, switchToPlayer } = useAccountMode()
const open = ref(false)
const loading = ref(false)

// ignoreResponseError: a signed-out or profile-less visitor must not take the
// whole layout down with an unhandled fetch error.
const { data: clubsData } = await useFetch<{ items: MyClubMembershipDto[] }>('/api/v1/clubs/mine', {
  ignoreResponseError: true,
  default: () => ({ items: [] })
})

const adminClubs = computed(
  () =>
    clubsData.value?.items?.filter(
      (m) => m.status === 'active' && (m.role === 'OWNER' || m.role === 'ADMIN')
    ) ?? []
)

const activeClub = computed(
  () => adminClubs.value.find((m) => m.club.id === activeClubId.value)?.club ?? null
)

const currentLabel = computed(() => {
  if (accountMode.value !== 'club') return 'Player'
  return activeClub.value?.name ?? 'Club'
})

/**
 * Switching is symmetric: either mode is always reachable from the other. When
 * the target mode has no account behind it yet, the switch routes to the screen
 * that creates one instead of silently doing nothing —
 *  - Player with no rating  → the assessment questionnaire
 *  - Club with no club      → club creation
 * The mode itself is only committed once that prerequisite exists, so the user
 * never lands in a mode with nothing in it.
 */
async function handleSwitchToPlayer() {
  open.value = false
  if (accountMode.value === 'player') return
  loading.value = true
  try {
    const me = await $fetch<{ id: string }>('/api/v1/players/me')
    const ratings = await $fetch<{ singles: { rating_value: number | null } | null }>(
      `/api/v1/players/${me.id}/ratings`,
      { ignoreResponseError: true }
    )
    if (!ratings?.singles || ratings.singles.rating_value == null) {
      await navigateTo({
        path: '/onboarding',
        query: { flow: 'rate-only', redirect: '/dashboard' }
      })
      return
    }
    switchToPlayer()
    await navigateTo('/dashboard')
  } catch {
    // No profile yet — onboarding is the right place to land either way.
    await navigateTo({ path: '/onboarding', query: { flow: 'rate-only', redirect: '/dashboard' } })
  } finally {
    loading.value = false
  }
}

async function handleSwitchToClub(clubId: string) {
  open.value = false
  switchToClub(clubId)
  await navigateTo(`/club/${clubId}/dashboard`)
}

async function handleCreateFirstClub() {
  open.value = false
  await navigateTo({ path: '/create-club', query: { redirect: 'club-mode' } })
}

function onBlur(e: FocusEvent) {
  const next = e.relatedTarget as Node | null
  if (!next || !(e.currentTarget as HTMLElement).contains(next)) open.value = false
}
</script>

<template>
  <div class="relative w-full" @focusout="onBlur">
    <button
      type="button"
      :disabled="loading"
      :aria-expanded="open"
      aria-haspopup="menu"
      class="flex w-full items-center justify-between gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-left text-sm text-fg hover:bg-surface-2 focus:border-primary focus:outline-none disabled:opacity-50"
      @click="open = !open"
    >
      <span class="flex min-w-0 items-center gap-2">
        <span class="text-base">{{ accountMode === 'club' ? '🏆' : '🏓' }}</span>
        <span class="truncate">{{ currentLabel }}</span>
      </span>
      <svg
        class="h-4 w-4 flex-shrink-0 text-fg-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 9l4-4 4 4m0 6l-4 4-4-4"
        />
      </svg>
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fg hover:bg-surface-2"
        :class="{ 'bg-surface-2': accountMode === 'player' }"
        @click="handleSwitchToPlayer"
      >
        <span class="text-base">🏓</span>
        Player
      </button>

      <button
        v-for="membership in adminClubs"
        :key="membership.club.id"
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fg hover:bg-surface-2"
        :class="{ 'bg-surface-2': accountMode === 'club' && activeClubId === membership.club.id }"
        @click="handleSwitchToClub(membership.club.id)"
      >
        <span class="text-base">🏆</span>
        <span class="truncate">{{ membership.club.name }}</span>
      </button>

      <!-- Club mode is offered even with no club yet; choosing it starts one. -->
      <button
        v-if="adminClubs.length === 0"
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 border-t border-border-strong px-3 py-2.5 text-left text-sm text-primary hover:bg-surface-2"
        @click="handleCreateFirstClub"
      >
        <span class="text-base">🏆</span>
        Set up a club
      </button>
    </div>
  </div>
</template>
