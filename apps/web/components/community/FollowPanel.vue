<script setup lang="ts">
/**
 * Following and followers, with follow-back in place.
 *
 * Replaces the TeamUp panel (066-follow-and-kudos). Team-up was a roster you
 * built by asking and waiting; follow needs no permission, so there is no
 * pending section and nothing here waits on anybody — the panel is two lists
 * and one button.
 *
 * `/following` existed as a page all along and could list and unfollow, but
 * nothing in the product could ever create a follow and it was linked from no
 * navigation. Both lists were therefore permanently empty. This is the same
 * data on a surface people actually reach.
 *
 * **Mutual is called out** rather than left to be inferred by cross-referencing
 * the two tabs: two people following each other is what lets either enter the
 * other into an open play session, which is the one consequence of following
 * that costs somebody something.
 */
interface FollowRow {
  player_id: string
  display_name: string
  avatar_url: string | null
  /** True when the relationship runs both ways. */
  mutual: boolean
  since: string
}

type Section = 'following' | 'followers'

const section = ref<Section>('following')

const { data, pending, refresh } = await useFetch<{
  data: { following: FollowRow[]; followers: FollowRow[] }
}>('/api/v1/players/me/follows', {
  server: false,
  ignoreResponseError: true,
  default: () => ({ data: { following: [], followers: [] } })
})

const following = computed(() => data.value?.data?.following ?? [])
const followers = computed(() => data.value?.data?.followers ?? [])

const sectionItems = computed(() => [
  { value: 'following', label: 'Following', count: following.value.length },
  { value: 'followers', label: 'Followers', count: followers.value.length }
])

const rows = computed(() => (section.value === 'following' ? following.value : followers.value))

const busyId = ref<string | null>(null)
const error = ref('')

async function unfollow(playerId: string) {
  busyId.value = playerId
  error.value = ''
  try {
    await $fetch(`/api/v1/players/${playerId}/follow`, { method: 'DELETE' })
    await refresh()
  } catch (err) {
    error.value = apiErrorMessage(err, 'Could not unfollow.')
  } finally {
    busyId.value = null
  }
}

async function followBack(playerId: string) {
  busyId.value = playerId
  error.value = ''
  try {
    await $fetch(`/api/v1/players/${playerId}/follow`, { method: 'POST' })
    await refresh()
  } catch (err) {
    error.value = apiErrorMessage(err, 'Could not follow back.')
  } finally {
    busyId.value = null
  }
}

function since(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
}
</script>

<template>
  <div>
    <UiSegmented v-model="section" :items="sectionItems" size="sm" label="Follows" class="w-max" />

    <p class="mt-3 max-w-prose text-body-2 text-fg-secondary">
      Following somebody needs no permission and tells them nothing they have to answer. When you
      follow each other, either of you can enter the other into an open play session.
    </p>

    <p v-if="error" role="alert" class="mt-3 text-body-2 text-danger">{{ error }}</p>

    <div v-if="pending" class="mt-4 space-y-2">
      <UiSkeleton v-for="i in 3" :key="i" variant="rectangular" height="3.5rem" />
    </div>

    <UiEmptyState
      v-else-if="!rows.length"
      class="mt-4"
      icon="players"
      compact
      :title="section === 'following' ? 'Not following anyone yet' : 'No followers yet'"
      :message="
        section === 'following'
          ? 'Follow the people you play with from their profile, and their results show up in your feed.'
          : 'When somebody follows you they will appear here, and you can follow them back.'
      "
      action-label="Find players"
      action-to="/players"
    />

    <ul v-else class="mt-4">
      <li
        v-for="row in rows"
        :key="row.player_id"
        class="flex items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
      >
        <UiAvatar :name="row.display_name" :src="row.avatar_url" size="sm" />

        <div class="min-w-0 flex-1">
          <UiPlayerLink
            :player-id="row.player_id"
            :name="row.display_name"
            class="block truncate text-body-2 font-medium"
          />
          <p class="text-caption text-fg-muted">
            <template v-if="row.mutual">You follow each other</template>
            <template v-else-if="section === 'following'"
              >Following since {{ since(row.since) }}</template
            >
            <template v-else>Following you since {{ since(row.since) }}</template>
          </p>
        </div>

        <!-- Follow back is the whole reason the Followers list is worth
             opening, so it is the only button that gets any weight. -->
        <button
          v-if="!row.mutual && section === 'followers'"
          type="button"
          class="shrink-0 rounded-button bg-primary px-3 py-1.5 text-caption font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          :disabled="busyId === row.player_id"
          @click="followBack(row.player_id)"
        >
          {{ busyId === row.player_id ? '…' : 'Follow back' }}
        </button>
        <button
          v-else-if="section === 'following'"
          type="button"
          class="shrink-0 rounded-button border border-border-strong px-3 py-1.5 text-caption font-medium text-fg-secondary transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
          :disabled="busyId === row.player_id"
          @click="unfollow(row.player_id)"
        >
          {{ busyId === row.player_id ? '…' : 'Unfollow' }}
        </button>
      </li>
    </ul>
  </div>
</template>
