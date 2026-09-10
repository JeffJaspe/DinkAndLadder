<script setup lang="ts">
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'

const { accountMode, activeClubId, switchToClub, switchToPlayer } = useAccountMode()
const open = ref(false)
const loading = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)

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

const inClubMode = computed(() => accountMode.value === 'club')

/**
 * The pending switch, held while the confirmation is up.
 *
 * Switching mode is not a navigation: it changes the whole sidebar, what the
 * feed scopes to, and whose name every action is taken under. Doing that from a
 * single tap on a menu row — on a phone, in a footer, next to the log-out
 * button — was too easy to do by accident and gave no sign of what had changed.
 */
type PendingSwitch =
  | { kind: 'player' }
  | { kind: 'club'; clubId: string; clubName: string }
  | { kind: 'create-club' }

const pending = ref<PendingSwitch | null>(null)

const confirmCopy = computed(() => {
  const target = pending.value
  if (!target) return { title: '', description: '', confirmLabel: 'Switch' }

  if (target.kind === 'player') {
    return {
      title: 'Switch to your player account?',
      description:
        'You will act as yourself again: your own rating, your matches and your clubs. Nothing about the club you were managing changes.',
      confirmLabel: 'Switch to player'
    }
  }
  if (target.kind === 'club') {
    return {
      title: `Switch to ${target.clubName}?`,
      description:
        'You will act on behalf of the club — its events, members and settings. Your own matches and rating stay exactly as they are.',
      confirmLabel: 'Switch to club'
    }
  }
  return {
    title: 'Set up a club?',
    description:
      'Club mode needs a club behind it. This takes you to club creation, and the switch happens once the club exists.',
    confirmLabel: 'Continue'
  }
})

function requestSwitch(target: PendingSwitch) {
  open.value = false
  pending.value = target
}

function cancelSwitch() {
  pending.value = null
  // Focus goes back to the control that opened the menu, not into the page.
  nextTick(() => trigger.value?.focus())
}

/**
 * Switching is symmetric: either mode is always reachable from the other. When
 * the target mode has no account behind it yet, the switch routes to the screen
 * that creates one instead of silently doing nothing —
 *  - Player with no rating  → the assessment questionnaire
 *  - Club with no club      → club creation
 * The mode itself is only committed once that prerequisite exists, so the user
 * never lands in a mode with nothing in it.
 */
async function switchToPlayerMode() {
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

async function confirmSwitch() {
  const target = pending.value
  if (!target) return
  pending.value = null

  if (target.kind === 'player') {
    await switchToPlayerMode()
    return
  }
  if (target.kind === 'club') {
    switchToClub(target.clubId)
    await navigateTo(`/club/${target.clubId}/dashboard`)
    return
  }
  await navigateTo({ path: '/create-club', query: { redirect: 'club-mode' } })
}

function onBlur(e: FocusEvent) {
  const next = e.relatedTarget as Node | null
  if (!next || !(e.currentTarget as HTMLElement).contains(next)) open.value = false
}
</script>

<template>
  <div class="relative w-full" @focusout="onBlur" @keydown.esc="open = false">
    <button
      ref="trigger"
      type="button"
      :disabled="loading"
      :aria-expanded="open"
      aria-haspopup="menu"
      class="flex w-full items-center justify-between gap-2 rounded-button border border-border-strong bg-surface px-3 py-2.5 text-left text-body-2 text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50"
      @click="open = !open"
    >
      <span class="flex min-w-0 items-center gap-2">
        <UiIcon :name="inClubMode ? 'clubs' : 'user'" size="h-4 w-4" class="shrink-0 text-primary" />
        <span class="min-w-0">
          <span class="block text-caption uppercase tracking-widest text-fg-muted">
            {{ inClubMode ? 'Club mode' : 'Player mode' }}
          </span>
          <span class="block truncate">{{ currentLabel }}</span>
        </span>
      </span>
      <UiIcon name="swap" size="h-4 w-4" class="shrink-0 text-fg-muted" />
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-button border border-border-strong bg-surface shadow-card-hover"
    >
      <p class="border-b border-border px-3 py-2 text-caption uppercase tracking-widest text-fg-muted">
        Act as
      </p>

      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-body-2 text-fg transition-colors hover:bg-surface-2"
        :class="{ 'bg-primary-soft text-primary': accountMode === 'player' }"
        @click="requestSwitch({ kind: 'player' })"
      >
        <UiIcon name="user" size="h-4 w-4" class="shrink-0" />
        <span class="flex-1 truncate">Player</span>
        <UiIcon v-if="accountMode === 'player'" name="check" size="h-4 w-4" class="shrink-0" />
      </button>

      <button
        v-for="membership in adminClubs"
        :key="membership.club.id"
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-body-2 text-fg transition-colors hover:bg-surface-2"
        :class="{
          'bg-primary-soft text-primary': inClubMode && activeClubId === membership.club.id
        }"
        @click="
          requestSwitch({
            kind: 'club',
            clubId: membership.club.id,
            clubName: membership.club.name
          })
        "
      >
        <UiIcon name="clubs" size="h-4 w-4" class="shrink-0" />
        <span class="flex-1 truncate">{{ membership.club.name }}</span>
        <UiIcon
          v-if="inClubMode && activeClubId === membership.club.id"
          name="check"
          size="h-4 w-4"
          class="shrink-0"
        />
      </button>

      <!-- Club mode is offered even with no club yet; choosing it starts one. -->
      <button
        v-if="adminClubs.length === 0"
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-body-2 text-primary transition-colors hover:bg-surface-2"
        @click="requestSwitch({ kind: 'create-club' })"
      >
        <UiIcon name="plus" size="h-4 w-4" class="shrink-0" />
        Set up a club
      </button>
    </div>

    <UiModal
      :model-value="pending !== null"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      :confirm-label="confirmCopy.confirmLabel"
      cancel-label="Stay here"
      :loading="loading"
      @update:model-value="(value: boolean) => !value && cancelSwitch()"
      @confirm="confirmSwitch"
    />
  </div>
</template>
