<script setup lang="ts">
import type { TeamMemberDto } from '~/server/domains/partnership/dto/team-up.dto'

/**
 * Your roster: the people you may register for an open play session.
 *
 * Deliberately its own tab rather than merged into Partners. A duo partner is
 * who you pair with in a doubles draw; a team-up is who you may bring to a
 * session. Both lists usually overlap and neither implies the other, and
 * collapsing them would mean either creating doubles partnerships nobody agreed
 * to, or letting anyone register anyone.
 *
 * Incoming requests sit at the top because they are the only thing on this
 * screen that needs an answer.
 */
const { data, pending, refresh } = await useFetch<{
  team: TeamMemberDto[]
  incoming: TeamMemberDto[]
}>('/api/v1/players/me/team', {
  server: false,
  ignoreResponseError: true,
  default: () => ({ team: [], incoming: [] })
})

const accepted = computed(() => (data.value?.team ?? []).filter((m) => m.status === 'accepted'))
const outgoing = computed(() => (data.value?.team ?? []).filter((m) => m.status === 'pending'))
const incoming = computed(() => data.value?.incoming ?? [])

const busyId = ref<string | null>(null)
const errorMessage = ref('')
const toast = useToast()

async function respond(id: string, accept: boolean) {
  busyId.value = id
  errorMessage.value = ''
  try {
    await $fetch(`/api/v1/team-ups/${id}/respond`, { method: 'POST', body: { accept } })
    await refresh()
    toast.success(accept ? 'You joined their team.' : 'Request declined.')
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Could not answer that request.')
  } finally {
    busyId.value = null
  }
}

async function remove(id: string) {
  busyId.value = id
  errorMessage.value = ''
  try {
    await $fetch(`/api/v1/team-ups/${id}`, { method: 'DELETE' })
    await refresh()
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Could not update your team.')
  } finally {
    busyId.value = null
  }
}

function ratingOf(member: TeamMemberDto): number | null {
  return member.doubles_rating ?? member.singles_rating
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="errorMessage" role="alert" class="text-sm text-danger">{{ errorMessage }}</p>

    <div v-if="pending" class="space-y-3">
      <div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-xl bg-surface-2" />
    </div>

    <template v-else>
      <!-- The only thing here that needs an answer. -->
      <section v-if="incoming.length">
        <h3 class="mb-2 text-sm font-medium text-fg">
          Asked you to join their team
          <span class="font-normal text-fg-muted">· {{ incoming.length }}</span>
        </h3>
        <ul class="space-y-2">
          <li
            v-for="member in incoming"
            :key="member.id"
            class="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-4 shadow-card"
          >
            <NuxtLink
              :to="`/players/${member.player_id}`"
              class="min-w-0 flex-1 text-sm font-medium text-fg hover:underline"
            >
              {{ member.display_name }}
            </NuxtLink>
            <UiRatingBadge v-if="ratingOf(member)" :rating="ratingOf(member)!" size="sm" />
            <button
              type="button"
              :disabled="busyId === member.id"
              class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
              @click="respond(member.id, true)"
            >
              Accept
            </button>
            <button
              type="button"
              :disabled="busyId === member.id"
              class="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-secondary hover:border-danger hover:text-danger disabled:opacity-50"
              @click="respond(member.id, false)"
            >
              Decline
            </button>
          </li>
        </ul>
      </section>

      <section>
        <h3 class="mb-1 text-sm font-medium text-fg">Your team</h3>
        <p class="mb-3 text-sm text-fg-muted">
          You can register these players for an open play session alongside yourself.
        </p>

        <ul v-if="accepted.length" class="space-y-2">
          <li
            v-for="member in accepted"
            :key="member.id"
            class="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-4 shadow-card"
          >
            <NuxtLink
              :to="`/players/${member.player_id}`"
              class="min-w-0 flex-1 text-sm font-medium text-fg hover:underline"
            >
              {{ member.display_name }}
              <span v-if="member.city" class="font-normal text-fg-muted">· {{ member.city }}</span>
            </NuxtLink>
            <UiRatingBadge v-if="ratingOf(member)" :rating="ratingOf(member)!" size="sm" />
            <button
              type="button"
              :disabled="busyId === member.id"
              class="text-sm text-fg-muted hover:text-danger disabled:opacity-50"
              @click="remove(member.id)"
            >
              Remove
            </button>
          </li>
        </ul>

        <UiEmptyState
          v-else
          title="Nobody on your team yet"
          message="Open a player's profile and press Team Up. Once they accept, you can enter them for open play alongside yourself."
        />
      </section>

      <section v-if="outgoing.length">
        <h3 class="mb-2 text-sm font-medium text-fg">
          Waiting on a reply
          <span class="font-normal text-fg-muted">· {{ outgoing.length }}</span>
        </h3>
        <ul class="space-y-2">
          <li
            v-for="member in outgoing"
            :key="member.id"
            class="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-4 shadow-card"
          >
            <span class="min-w-0 flex-1 text-sm text-fg-secondary">{{ member.display_name }}</span>
            <span class="rounded-pill bg-warning-soft px-2.5 py-1 text-xs text-warning">
              Pending
            </span>
            <button
              type="button"
              :disabled="busyId === member.id"
              class="text-sm text-fg-muted hover:text-danger disabled:opacity-50"
              @click="remove(member.id)"
            >
              Cancel
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
