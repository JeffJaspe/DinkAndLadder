<script setup lang="ts">
import type { BracketDto, LiveBracketScore, RecordBracketResultInput } from '~/server/domains/event/dto/bracket.dto'
import type {
  TournamentFormat,
  TournamentRegistrationWithPlayerDto
} from '~/server/domains/event/dto/tournament.dto'
import type { TournamentCategoryDto } from '~/server/domains/event/dto/tournament-category.dto'
import { partitionSchedule } from '~/utils/bracket-schedule'
import { hasGroupStage } from '~/utils/tournament-formats'

/**
 * The order of play for one category.
 *
 * This was the "Queue" tab, which it never was — a queue is the open-play
 * feature where players join and get assigned a court. Nothing here is joinable;
 * it is the draw read in the order it can be played, which is a schedule.
 *
 * The grouping comes from `partitionSchedule` rather than local computeds so
 * that the one-line "Up next" on a collapsed card and this list can never
 * disagree about what is on next.
 */
const props = defineProps<{
  bracket: BracketDto | null
  /** Confirmed entrants, so somebody yet to play still appears at 0–0. */
  confirmed: TournamentRegistrationWithPlayerDto[]
  format: TournamentFormat
  /** The category, for game rules per round. */
  category?: TournamentCategoryDto | null
  myPlayerId?: string | null
  canManage?: boolean
  recordingId?: string | null
  recordError?: string
  /** Match currently having its live ended. */
  endingLiveId?: string | null
}>()

const emit = defineEmits<{
  record: [bracketMatchId: string, input: RecordBracketResultInput]
  start: [bracketMatchId: string]
  score: [bracketMatchId: string, scores: LiveBracketScore[]]
  endLive: [bracketMatchId: string]
  'select-player': [playerId: string]
}>()

const schedule = computed(() => partitionSchedule(props.bracket))
const hasAny = computed(
  () =>
    schedule.value.ongoing.length +
      schedule.value.upNext.length +
      schedule.value.waiting.length +
      schedule.value.done.length >
    0
)

const showCompleted = ref(false)

/**
 * The running table, shown from the first result rather than at the end.
 *
 * Deliberately NOT the same thing as the Results tab. Results is the FINAL
 * standing, published when the organiser declares the category done, and that
 * gate is what stops an abandoned draw from announcing a winner on its own.
 * This is the live scoreboard everybody at the venue is asking about between
 * matches, and it is only ever a statement of what has happened so far.
 */
const showStandings = ref(true)

/**
 * Group tables where the format is played in groups, one table otherwise. The
 * qualifying line is only meaningful when finishing high actually carries a
 * player into a playoff.
 */
const isGrouped = computed(() => hasGroupStage(props.format))
const hasResults = computed(() => schedule.value.done.some((e) => e.match.status === 'completed'))
</script>

<template>
  <div class="space-y-5">
    <p v-if="!hasAny" class="rounded-lg bg-canvas p-4 text-sm text-fg-muted">
      No order of play yet — this category has no draw.
    </p>

    <template v-else>
      <section v-if="confirmed.length">
        <button
          type="button"
          class="mb-2 flex w-full items-center gap-2 text-left"
          :aria-expanded="showStandings"
          @click="showStandings = !showStandings"
        >
          <h4 class="flex-1 text-sm font-medium text-fg-secondary">
            {{ isGrouped ? 'Group standings' : 'Standings' }}
            <span class="font-normal text-fg-muted">
              · {{ hasResults ? 'so far' : 'no results yet' }}
            </span>
          </h4>
          <UiIcon
            :name="showStandings ? 'chevron-up' : 'chevron-down'"
            size="h-4 w-4"
            class="shrink-0 text-fg-muted"
          />
        </button>
        <TournamentBracketGroupTables
          v-if="showStandings"
          :bracket="bracket"
          :confirmed="confirmed"
          :show-qualifiers="isGrouped"
          :highlight-player-id="myPlayerId"
          @select="(id) => emit('select-player', id)"
        />
      </section>

      <!-- ONGOING: Matches currently being played -->
      <section v-if="schedule.ongoing.length" class="rounded-xl border-2 border-danger/30 bg-danger/5 p-4">
        <h4 class="mb-3 flex items-center gap-2 text-sm font-semibold text-danger">
          <span class="inline-flex items-center gap-1.5 rounded-pill bg-danger px-2 py-0.5 text-xs font-bold uppercase text-white">
            <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Live
          </span>
          On Court Now
        </h4>
        <ul class="space-y-2">
          <TournamentCategoryMatchRow
            v-for="entry in schedule.ongoing"
            :key="entry.match.id"
            :match="entry.match"
            :round="entry.round"
            :can-manage="canManage"
            :category="category"
            :recording="recordingId === entry.match.id"
            :record-error="recordingId === entry.match.id ? recordError : ''"
            :ending-live="endingLiveId === entry.match.id"
            @record="(id, input) => emit('record', id, input)"
            @start="(id) => emit('start', id)"
            @score="(id, scores) => emit('score', id, scores)"
            @end-live="(id) => emit('endLive', id)"
          />
        </ul>
      </section>

      <!-- UP NEXT: Ready to start -->
      <section class="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h4 class="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
          <UiIcon name="clock" size="h-4 w-4" />
          Up Next
          <span v-if="schedule.upNext.length" class="text-xs font-normal text-fg-muted">
            · {{ schedule.upNext.length }} {{ schedule.upNext.length === 1 ? 'match' : 'matches' }}
          </span>
        </h4>
        <ul v-if="schedule.upNext.length" class="space-y-2">
          <TournamentCategoryMatchRow
            v-for="(entry, i) in schedule.upNext"
            :key="entry.match.id"
            :match="entry.match"
            :round="entry.round"
            :index="i + 1"
            :can-manage="canManage"
            :category="category"
            :recording="recordingId === entry.match.id"
            :record-error="recordingId === entry.match.id ? recordError : ''"
            :ending-live="endingLiveId === entry.match.id"
            @record="(id, input) => emit('record', id, input)"
            @start="(id) => emit('start', id)"
            @score="(id, scores) => emit('score', id, scores)"
            @end-live="(id) => emit('endLive', id)"
          />
        </ul>
        <p v-else class="text-sm text-fg-muted">
          Nothing is ready to start — every remaining match is waiting on a result.
        </p>
      </section>

      <!-- WAITING: Pending matches -->
      <section v-if="schedule.waiting.length" class="rounded-xl border border-border bg-surface p-4">
        <h4 class="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-secondary">
          <UiIcon name="clock" size="h-4 w-4" />
          Waiting on Earlier Results
          <span class="text-xs font-normal text-fg-muted">· {{ schedule.waiting.length }}</span>
        </h4>
        <ul class="space-y-2">
          <TournamentCategoryMatchRow
            v-for="entry in schedule.waiting"
            :key="entry.match.id"
            :match="entry.match"
            :round="entry.round"
            :can-manage="canManage"
            :category="category"
            :recording="recordingId === entry.match.id"
            :record-error="recordingId === entry.match.id ? recordError : ''"
            :ending-live="endingLiveId === entry.match.id"
            @record="(id, input) => emit('record', id, input)"
            @start="(id) => emit('start', id)"
            @score="(id, scores) => emit('score', id, scores)"
            @end-live="(id) => emit('endLive', id)"
          />
        </ul>
      </section>

      <!-- COMPLETED: Finished matches -->
      <section v-if="schedule.done.length" class="rounded-xl border border-border-strong/30 bg-canvas p-4">
        <button
          type="button"
          class="flex w-full items-center gap-2 text-left"
          :aria-expanded="showCompleted"
          @click="showCompleted = !showCompleted"
        >
          <h4 class="flex flex-1 items-center gap-2 text-sm font-semibold text-fg-muted">
            <UiIcon name="check" size="h-4 w-4" />
            Completed
            <span class="text-xs font-normal">· {{ schedule.done.length }}</span>
          </h4>
          <UiIcon
            :name="showCompleted ? 'chevron-up' : 'chevron-down'"
            size="h-4 w-4"
            class="shrink-0 text-fg-muted"
          />
        </button>
        <ul v-if="showCompleted" class="mt-3 space-y-2">
          <TournamentCategoryMatchRow
            v-for="entry in schedule.done"
            :key="entry.match.id"
            :match="entry.match"
            :round="entry.round"
            :can-manage="canManage"
            :category="category"
            :recording="recordingId === entry.match.id"
            :record-error="recordingId === entry.match.id ? recordError : ''"
            :ending-live="endingLiveId === entry.match.id"
            @record="(id, input) => emit('record', id, input)"
            @start="(id) => emit('start', id)"
            @score="(id, scores) => emit('score', id, scores)"
            @end-live="(id) => emit('endLive', id)"
          />
        </ul>
      </section>
    </template>
  </div>
</template>
