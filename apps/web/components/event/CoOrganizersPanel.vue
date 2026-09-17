<script setup lang="ts">
import type {
  EventCoOrganizerDto,
  FriendDto
} from '~/server/domains/event/dto/event-co-organizer.dto'

/**
 * Who runs this event alongside its creator, and — for the creator — the
 * control to change that.
 *
 * Three rules, all visible on the surface: only the creator edits the list
 * (a co-organiser sees it read-only with a line saying why), it can be edited
 * at any time (no status gate), and the picker offers friends only — duo
 * partners and team-ups — because that is the set the server accepts. A
 * player who is not a friend simply is not in the list; there is no search
 * that could find them and then fail.
 */
const props = defineProps<{
  eventId: string
  coOrganizers: EventCoOrganizerDto[]
  /** The creator. Co-organisers get the list without the controls. */
  canEdit: boolean
}>()

const emit = defineEmits<{ updated: [EventCoOrganizerDto[]] }>()

const toast = useToast()
const pickerOpen = ref(false)
const busyId = ref<string | null>(null)

/**
 * Friends are only fetched when the picker opens: it is the creator's own
 * list, of no use to anyone else reading the panel, and the picker is opened
 * rarely.
 */
const {
  data: friendsData,
  pending: friendsPending,
  execute: loadFriends
} = useFetch<{ data: FriendDto[] }>('/api/v1/players/me/friends', {
  immediate: false,
  server: false,
  default: () => ({ data: [] })
})

const appointedIds = computed(() => new Set(props.coOrganizers.map((c) => c.player_id)))
const candidates = computed(() =>
  (friendsData.value?.data ?? []).filter((f) => !appointedIds.value.has(f.player_id))
)

async function openPicker() {
  pickerOpen.value = true
  if (!friendsData.value?.data.length) await loadFriends()
}

function viaLabel(via: FriendDto['via']): string {
  return via === 'partner' ? 'Duo partner' : 'Team-up'
}

async function add(friend: FriendDto) {
  busyId.value = friend.player_id
  try {
    const res = await $fetch<{ data: EventCoOrganizerDto[] }>(
      `/api/v1/events/${props.eventId}/co-organizers`,
      { method: 'POST', body: { player_id: friend.player_id } }
    )
    emit('updated', res.data)
    toast.success(`${friend.display_name} can now run this event with you.`)
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not add that co-organiser.'))
  } finally {
    busyId.value = null
  }
}

async function remove(person: EventCoOrganizerDto) {
  busyId.value = person.player_id
  try {
    const res = await $fetch<{ data: EventCoOrganizerDto[] }>(
      `/api/v1/events/${props.eventId}/co-organizers/${person.player_id}`,
      { method: 'DELETE' }
    )
    emit('updated', res.data)
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not remove that co-organiser.'))
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <section class="rounded-xl bg-surface p-6 shadow-card" aria-labelledby="co-organizers-heading">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 id="co-organizers-heading" class="font-display text-heading-3 text-fg">
          Co-organisers
        </h2>
        <p class="mt-1 text-caption text-fg-muted">
          <template v-if="canEdit">
            Friends who can run this event with you — record results, start it, work the courts.
            Change this any time.
          </template>
          <template v-else>
            Appointed by the event's creator. Only they can change this list.
          </template>
        </p>
      </div>
      <UiButton v-if="canEdit" size="sm" variant="secondary" @click="openPicker">
        <UiIcon name="plus" size="h-4 w-4" :stroke-width="2.5" />
        Add
      </UiButton>
    </div>

    <!-- Empty: one sentence, no illustration. It is a short list on a busy page. -->
    <p v-if="coOrganizers.length === 0" class="mt-4 text-body-2 text-fg-secondary">
      <template v-if="canEdit">Nobody yet. You run this one alone.</template>
      <template v-else>None.</template>
    </p>

    <ul v-else class="mt-4 divide-y divide-border">
      <li
        v-for="person in coOrganizers"
        :key="person.player_id"
        class="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
      >
        <UiAvatar
          :name="person.display_name"
          :src="person.avatar_url"
          :identity-key="person.player_id"
          size="sm"
        />
        <NuxtLink
          :to="`/players/${person.player_id}`"
          class="dnl-press min-w-0 flex-1 truncate rounded-badge text-body-2 font-medium text-fg transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {{ person.display_name }}
        </NuxtLink>
        <button
          v-if="canEdit"
          type="button"
          class="dnl-press shrink-0 rounded-button p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50"
          :disabled="busyId === person.player_id"
          :aria-label="`Remove ${person.display_name} as co-organiser`"
          @click="remove(person)"
        >
          <UiIcon name="x" size="h-4 w-4" :stroke-width="2" />
        </button>
      </li>
    </ul>

    <UiModal
      v-model="pickerOpen"
      title="Add a co-organiser"
      description="Duo partners and team-ups only. They can record results and run the event; only you can change who is on this list."
      hide-actions
    >
      <div v-if="friendsPending" class="space-y-2">
        <UiSkeleton v-for="n in 3" :key="n" height="2.75rem" />
      </div>

      <div v-else-if="candidates.length === 0" class="rounded-lg bg-canvas p-5 text-center">
        <p class="text-body-2 text-fg-secondary">
          <template v-if="(friendsData?.data.length ?? 0) === 0">
            You have no duo partners or team-ups yet. Add someone on the Community page first.
          </template>
          <template v-else>Everyone you could add is already a co-organiser.</template>
        </p>
        <NuxtLink
          v-if="(friendsData?.data.length ?? 0) === 0"
          to="/community"
          class="mt-3 inline-block text-body-2 font-medium text-primary hover:underline"
        >
          Go to Community
        </NuxtLink>
      </div>

      <ul v-else class="max-h-80 divide-y divide-border overflow-y-auto">
        <li v-for="friend in candidates" :key="friend.player_id">
          <button
            type="button"
            class="dnl-row flex w-full items-center gap-3 py-2.5 text-left focus-visible:outline-none disabled:opacity-50"
            :disabled="busyId === friend.player_id"
            @click="add(friend)"
          >
            <UiAvatar
              :name="friend.display_name"
              :src="friend.avatar_url"
              :identity-key="friend.player_id"
              size="sm"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-body-2 font-medium text-fg">
                {{ friend.display_name }}
              </span>
              <span class="block text-caption text-fg-muted">{{ viaLabel(friend.via) }}</span>
            </span>
            <UiIcon name="plus" size="h-4 w-4" :stroke-width="2" class="shrink-0 text-fg-muted" />
          </button>
        </li>
      </ul>
    </UiModal>
  </section>
</template>
