<script setup lang="ts">
/**
 * One court, full screen, for the person running it.
 *
 * Scoring used to happen inside the live board, on a card in a feed that
 * reorders itself every five seconds as other courts finish. That is fine for
 * watching and wrong for operating: the desk runs a court for twenty minutes at
 * a stretch, and a +1 button that moves under the cursor between taps puts the
 * point on the wrong court.
 *
 * So it is a page, opened per court in its own tab. The desk ends up with one
 * tab per court and leaves them open for the session, which is the actual
 * working pattern this replaces a scrap of paper for.
 *
 * Sized for a laptop at a desk rather than a phone at the fence: the score is
 * the largest thing on screen and the two +1 targets are the width of half the
 * page each, so they can be hit without looking.
 */
import { apiErrorMessage } from '~/utils/api-error-message'
import { rulesForEvent } from '~/utils/game-rules'
import type { EventDto, EventQueueDto, LiveGameScore } from '~/server/domains/event/dto/event.dto'

const route = useRoute()
const eventId = computed(() => route.params.eventId as string)
const courtId = computed(() => route.params.courtId as string)

const { isClubMode } = useAccountMode()

// GET /api/v1/events/:id returns the DTO itself, not a { data } envelope -
// unlike its /courts and /queue siblings, which do. This page read
// `eventData.value.data`, so `event` was ALWAYS null, so `canManage` was always
// false and the organiser's own scoring page only ever showed "Not yours to
// score". Found while wiring the session's game rules through it.
const { data: eventData } = await useFetch<EventDto>(() => `/api/v1/events/${eventId.value}`)
const event = computed(() => eventData.value ?? null)

// Same envelope mistake as the event fetch above, and the second independent
// reason canManage could never be true here: /api/v1/players/me returns the
// profile itself. pages/events/[eventId]/index.vue reads both unwrapped.
const { data: profileData } = await useFetch<{ id: string } | null>('/api/v1/players/me', {
  key: 'score-my-profile'
})
const myProfile = computed(() => profileData.value ?? null)

/**
 * The same gate the event page uses: ownership AND club mode. An owner browsing
 * in player mode is a participant everywhere else, and must be here too.
 */
const canManage = computed(
  () =>
    !!myProfile.value &&
    !!event.value &&
    event.value.created_by_player_id === myProfile.value.id &&
    isClubMode.value
)

const { courts, refresh: refreshCourts, lastUpdated } = useLiveScores(eventId)

const court = computed(() => courts.value.find((c) => c.id === courtId.value) ?? null)

/** The session's scoring rules. See 054 — open play used to be 11 or nothing. */
const rules = computed(() => rulesForEvent(event.value))

const busy = ref(false)

/**
 * The waiting queue, so the next game can be started from this tab.
 *
 * Without it the desk had to go back to the event page between every game,
 * which defeats the point of a tab per court: a court frees the instant a score
 * is submitted, and if nobody was queued to auto-advance onto it, the operator
 * is standing at a live court with no way to put the next pair on.
 */
const { data: queueData, refresh: refreshQueue } = await useFetch<{ data: EventQueueDto[] }>(
  () => `/api/v1/events/${eventId.value}/queue`
)

const waitingEntries = computed(
  () => queueData.value?.data.filter((q) => q.status === 'waiting') ?? []
)

/** A queue entry as one line: the player, plus their partner for doubles. */
function queueEntryLabel(entry: EventQueueDto): string {
  const names = [entry.player?.display_name, entry.partner?.display_name].filter(Boolean)
  return names.length ? names.join(' & ') : 'Unknown player'
}

const queueOptions = computed(() =>
  waitingEntries.value.map((entry) => ({ value: entry.id, label: queueEntryLabel(entry) }))
)

const team1 = ref('')
const team2 = ref('')
const starting = ref(false)

/**
 * Pre-picked to the two who have waited longest, which is the answer the
 * operator wants nine times out of ten. Re-seeded whenever the court frees, so
 * the picker is never left holding the pair that has just come off.
 */
watch(
  [waitingEntries, court],
  () => {
    if (court.value?.status === 'playing') return
    if (!team1.value) team1.value = waitingEntries.value[0]?.id ?? ''
    if (!team2.value) team2.value = waitingEntries.value[1]?.id ?? ''
  },
  { immediate: true }
)

const canStart = computed(() => !!team1.value && !!team2.value && team1.value !== team2.value)

async function startCourt() {
  if (!canStart.value || starting.value) return
  starting.value = true
  try {
    await $fetch(`/api/v1/events/${eventId.value}/courts/${courtId.value}/start`, {
      method: 'POST',
      body: { team1_queue_id: team1.value, team2_queue_id: team2.value }
    })
    team1.value = ''
    team2.value = ''
    await Promise.all([refreshCourts(), refreshQueue()])
    useToast().success('Court started.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not start the court.'))
  } finally {
    starting.value = false
  }
}

/**
 * One request per point, no re-read behind it — same reasoning as the board:
 * the card shows the tap immediately, so the write is all that is left and a
 * failure is what triggers the re-read that puts the number back.
 */
async function updateScore(scores: LiveGameScore[]) {
  try {
    await $fetch(`/api/v1/events/${eventId.value}/courts/${courtId.value}/score`, {
      method: 'PATCH',
      body: { scores }
    })
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not update the score.'))
    await refreshCourts()
  }
}

async function submitScore() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await $fetch<{ warnings?: string[] }>(
      `/api/v1/events/${eventId.value}/courts/${courtId.value}/submit`,
      { method: 'POST' }
    )
    // The queue is re-read too: submitting frees the court and may auto-advance
    // the next pair onto it, so both the board and the picker are stale.
    await Promise.all([refreshCourts(), refreshQueue()])
    // The court is freed even when the match or the auto-advance failed, so a
    // warning has to be shown rather than a blanket success.
    if (result.warnings?.length) useToast().info(result.warnings.join(' '))
    else useToast().success('Score submitted. Next pair is on.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not submit the score.'))
  } finally {
    busy.value = false
  }
}

const courtLabel = computed(() =>
  court.value ? court.value.court_name || `Court ${court.value.court_number}` : 'Court'
)

useHead(() => ({
  // The tab title is how the desk tells six open tabs apart, so it leads with
  // the court rather than the event.
  title: `${courtLabel.value} — ${event.value?.name ?? 'Scoring'}`
}))
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6">
    <UiPageHeader :to="`/events/${eventId}`" />

    <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="font-display text-heading-2 text-fg">{{ courtLabel }}</h1>
        <p class="mt-0.5 truncate text-body-2 text-fg-muted">
          <NuxtLink :to="`/events/${eventId}`" class="hover:text-fg hover:underline">
            {{ event?.name ?? 'Event' }}
          </NuxtLink>
          <span v-if="lastUpdated"> · updated {{ lastUpdated.toLocaleTimeString() }}</span>
        </p>
      </div>

      <UiButton variant="ghost" size="sm" @click="refreshCourts">Refresh</UiButton>
    </header>

    <UiEmptyState
      v-if="!canManage"
      title="Not yours to score"
      message="Only the organiser, in club mode, can run a court. Switch to club mode if this is your event."
    />

    <UiEmptyState
      v-else-if="!court"
      title="Court not found"
      message="This court is not part of the session, or the event has not been started yet."
    />

    <!-- The card carries every scoring rule there is — the confirm-on-game-point
         dialog, deuce, taking a point back — so the page hands it the court and
         a `wide` flag rather than reimplementing any of it at a larger size. -->
    <template v-else>
      <!-- `can-manage` is false while the court is free so the card does not
           draw its own "Start a game" button: on this page starting a game is
           the panel below, which picks the two sides. Two buttons meaning the
           same thing, one of which opens a picker somewhere else, is how the
           card ended up with a button wired to nothing. -->
      <EventCourtCard
        :court="court"
        :can-manage="canManage && court.status === 'playing'"
        :rules="rules"
        :busy="busy"
        wide
        @score="updateScore"
        @submit="submitScore"
      />

      <!-- Starting the next game, without leaving the tab. A court frees the
           moment a score goes in, and if nobody was queued to auto-advance the
           operator is standing at an empty court. -->
      <section
        v-if="canManage && court.status !== 'playing'"
        class="mt-4 rounded-card border border-border bg-surface p-6"
      >
        <h2 class="font-display text-heading-3 text-fg">Put the next pair on</h2>

        <p v-if="waitingEntries.length < 2" class="mt-2 text-body-2 text-fg-muted">
          {{
            waitingEntries.length === 0
              ? 'Nobody is waiting in the queue.'
              : 'Only one side is waiting — a game needs two.'
          }}
          Players join from the event page.
        </p>

        <template v-else>
          <div class="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <UiSelect v-model="team1" label="Side 1" :options="queueOptions" />
            <span class="hidden pb-2.5 text-caption font-semibold uppercase text-fg-muted sm:block">
              vs
            </span>
            <UiSelect v-model="team2" label="Side 2" :options="queueOptions" />
          </div>

          <p v-if="team1 && team1 === team2" class="mt-2 text-caption text-danger">
            A side cannot play against itself.
          </p>

          <UiButton class="mt-4" :disabled="!canStart || starting" @click="startCourt">
            {{ starting ? 'Starting…' : 'Start game' }}
          </UiButton>
        </template>
      </section>
    </template>
  </div>
</template>
