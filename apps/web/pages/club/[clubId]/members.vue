<script setup lang="ts">
import type { RosterMemberDto } from '~/server/domains/club/dto/club-membership.dto'
import type { ClubDto } from '~/server/domains/club/dto/club.dto'
import { apiErrorMessage } from '~/utils/api-error-message'

/**
 * The club's people, in one place.
 *
 * There was nowhere to see them. Join requests were a strip on the public club
 * page, invitations did not exist at all, and the roster itself was only ever
 * visible as a count — so a club running a session had no screen answering "who
 * is in, who is waiting, and who have we asked".
 *
 * Three lists rather than three pages, because they are one question asked at
 * three stages, and the two that need an answer sit above the one that does not.
 */
const route = useRoute()
const clubId = route.params.clubId as string

const { data: club } = await useFetch<ClubDto>(`/api/v1/clubs/${clubId}`)

useHead({ title: () => (club.value ? `${club.value.name} — Members` : 'Members') })

const {
  data: rosterData,
  pending,
  error,
  refresh
} = await useFetch<{ items: RosterMemberDto[] }>(`/api/v1/clubs/${clubId}/members`, {
  // `items`, not `data`: the roster controller returns a paged envelope
  // (items/page/page_size/total), unlike the `{ data }` most of the API uses.
  // Reading the wrong key silently emptied all three tabs — the roster was
  // fetched fine, it just never reached the lists.
  default: () => ({ items: [] as RosterMemberDto[] })
})

const roster = computed(() => rosterData.value?.items ?? [])

/** Everyone actually in the club, owner first, then by when they joined. */
const ROLE_ORDER: Record<string, number> = { OWNER: 0, ADMIN: 1, MODERATOR: 2, MEMBER: 3 }

const members = computed(() =>
  roster.value
    .filter((m) => m.status === 'active')
    .sort(
      (a, b) =>
        (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
        (a.joined_at ?? '').localeCompare(b.joined_at ?? '')
    )
)

/** They asked to join. Oldest first — waiting longest is answered first. */
const incoming = computed(() =>
  roster.value
    .filter((m) => m.status === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
)

/** The club asked them, and they have not answered yet (051). */
const invited = computed(() =>
  roster.value
    .filter((m) => m.status === 'invited')
    .sort((a, b) => (b.invited_at ?? '').localeCompare(a.invited_at ?? ''))
)

type Tab = 'members' | 'incoming' | 'invited'

const activeTab = ref<Tab>('members')

const tabs = computed(() => [
  { value: 'members', label: 'Members', count: members.value.length },
  { value: 'incoming', label: 'Incoming', count: incoming.value.length },
  { value: 'invited', label: 'Invited', count: invited.value.length }
])

/**
 * Land on whichever list needs an answer.
 *
 * Only on arrival and only while the reader has not chosen: a request nobody
 * looks at is the reason this page exists.
 */
const tabChosen = ref(false)

watch(
  [incoming, invited],
  ([requests]) => {
    if (tabChosen.value) return
    if (requests.length) activeTab.value = 'incoming'
  },
  { immediate: true }
)

function chooseTab(value: string) {
  tabChosen.value = true
  activeTab.value = value as Tab
}

const busyId = ref<string | null>(null)
const actionError = ref('')

async function review(playerId: string, status: 'active' | 'rejected') {
  busyId.value = playerId
  actionError.value = ''
  try {
    await $fetch(`/api/v1/clubs/${clubId}/members/${playerId}`, {
      method: 'PATCH',
      body: { status }
    })
    await refresh()
  } catch (err) {
    actionError.value = apiErrorMessage(err, 'Could not answer that request.')
  } finally {
    busyId.value = null
  }
}

/**
 * Withdrawing an invitation is a rejection of the row, not a deletion.
 *
 * The unique index allows one live row per player per club, so leaving it
 * behind as `rejected` frees the slot for a later invitation while keeping the
 * record that one was sent.
 */
async function withdrawInvite(playerId: string) {
  busyId.value = playerId
  actionError.value = ''
  try {
    await $fetch(`/api/v1/clubs/${clubId}/members/${playerId}`, {
      method: 'PATCH',
      body: { status: 'rejected' }
    })
    await refresh()
  } catch (err) {
    actionError.value = apiErrorMessage(err, 'Could not withdraw that invitation.')
  } finally {
    busyId.value = null
  }
}

function whenInvited(member: RosterMemberDto): string {
  if (!member.invited_at) return 'Invitation sent'
  return `Invited ${new Date(member.invited_at).toLocaleDateString()}`
}

const activeList = computed(() => {
  if (activeTab.value === 'incoming') return incoming.value
  if (activeTab.value === 'invited') return invited.value
  return members.value
})
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <NuxtLink
        :to="`/clubs/${clubId}`"
        class="inline-flex items-center gap-1.5 text-body-2 text-fg-muted hover:text-fg"
      >
        <UiIcon name="arrow-left" size="h-4 w-4" />
        {{ club?.name ?? 'Back to the club' }}
      </NuxtLink>

      <h1 class="mt-1 text-2xl font-bold text-fg">Members</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Everyone in the club, the requests waiting on you, and the players you have invited.
      </p>

      <div class="my-6 overflow-x-auto">
        <UiSegmented
          :model-value="activeTab"
          label="Member list"
          :items="tabs"
          @update:model-value="chooseTab"
        />
      </div>

      <p v-if="actionError" role="alert" class="mb-4 text-sm text-danger">{{ actionError }}</p>

      <div v-if="pending" class="space-y-3">
        <div v-for="i in 4" :key="i" class="h-16 animate-pulse rounded-xl bg-surface" />
      </div>

      <UiErrorState
        v-else-if="error"
        title="Could not load the roster"
        message="Only active members of this club can see who is in it."
        @retry="refresh()"
      />

      <UiEmptyState
        v-else-if="!activeList.length"
        :title="
          activeTab === 'incoming'
            ? 'No requests waiting'
            : activeTab === 'invited'
              ? 'No invitations outstanding'
              : 'Nobody in the club yet'
        "
        :message="
          activeTab === 'incoming'
            ? 'When somebody asks to join, their request appears here for you to approve or decline.'
            : activeTab === 'invited'
              ? 'Open a player’s profile and press Invite to club. Invitations you send wait here until they answer.'
              : 'Approve a request or invite a player to get started.'
        "
      />

      <ul v-else class="space-y-2">
        <li
          v-for="member in activeList"
          :key="member.id"
          class="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-4 shadow-card"
        >
          <NuxtLink
            :to="`/players/${member.player_id}`"
            class="flex min-w-0 flex-1 items-center gap-3 hover:text-primary"
          >
            <UiAvatar :name="member.display_name" size="sm" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-fg">
                {{ member.display_name }}
              </span>
              <span class="block truncate text-caption text-fg-muted">
                <template v-if="activeTab === 'members'">
                  {{ member.role === 'MEMBER' ? 'Member' : member.role.toLowerCase() }}
                  <template v-if="member.joined_at">
                    · joined {{ new Date(member.joined_at).toLocaleDateString() }}
                  </template>
                </template>
                <template v-else-if="activeTab === 'invited'">{{ whenInvited(member) }}</template>
                <template v-else>
                  Asked {{ new Date(member.created_at).toLocaleDateString() }}
                </template>
              </span>
            </span>
          </NuxtLink>

          <!-- A request needs an answer; an invitation only needs a way back. -->
          <template v-if="activeTab === 'incoming'">
            <button
              type="button"
              :disabled="busyId === member.player_id"
              class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
              @click="review(member.player_id, 'active')"
            >
              Approve
            </button>
            <button
              type="button"
              :disabled="busyId === member.player_id"
              class="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-secondary hover:border-danger hover:text-danger disabled:opacity-50"
              @click="review(member.player_id, 'rejected')"
            >
              Decline
            </button>
          </template>

          <template v-else-if="activeTab === 'invited'">
            <span class="rounded-pill bg-warning-soft px-2.5 py-1 text-xs text-warning">
              Waiting on them
            </span>
            <button
              type="button"
              :disabled="busyId === member.player_id"
              class="text-sm text-fg-muted hover:text-danger disabled:opacity-50"
              @click="withdrawInvite(member.player_id)"
            >
              Withdraw
            </button>
          </template>
        </li>
      </ul>
    </div>
  </div>
</template>
