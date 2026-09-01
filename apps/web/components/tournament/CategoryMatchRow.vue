<script setup lang="ts">
import type {
  BracketMatchDto,
  LiveBracketScore,
  RecordBracketResultInput
} from '~/server/domains/event/dto/bracket.dto'
import { participantLabel } from '~/utils/bracket-schedule'
import { roundLabel } from '~/utils/bracket-rounds'
import type { TournamentCategoryDto } from '~/server/domains/event/dto/tournament-category.dto'
import {
  isGameComplete,
  rulesForRound,
  seriesWinner,
  type GameRules,
  type GameScore
} from '~/utils/game-rules'

/**
 * One line of the order of play, which opens to show what actually happened.
 *
 * Collapsed it answers "who is playing and is it on yet". Opened it answers
 * "what was the score", which used to be answerable only by leaving the page:
 * the old Matches view listed completed matches with no score at all, because a
 * bracket row has never carried one.
 */
const props = defineProps<{
  match: BracketMatchDto
  round: number
  /** Position in the up-next queue. Absent for waiting and completed rows. */
  index?: number | null
  canManage?: boolean
  /**
   * The category this match belongs to, for its game rules. Optional: a
   * tournament may run one flat draw with no category at all, in which case the
   * standard rules apply.
   */
  category?: TournamentCategoryDto | null
  recording?: boolean
  recordError?: string
}>()

const emit = defineEmits<{
  record: [bracketMatchId: string, input: RecordBracketResultInput]
  start: [bracketMatchId: string]
  score: [bracketMatchId: string, scores: LiveBracketScore[]]
}>()

const expanded = ref(false)

const side1 = computed(() => participantLabel(props.match, 1))
const side2 = computed(() => participantLabel(props.match, 2))

const isBye = computed(() => props.match.status === 'bye')
const isDone = computed(() => props.match.status === 'completed')
const onCourt = computed(() => props.match.status === 'in_progress')

/**
 * Being played right now — started, and undecided.
 *
 * Distinct from `onCourt`, which reads the draw's status and only ever meant
 * "scheduled onto a court". This one is backed by a running scoreboard.
 */
const isLive = computed(() => props.match.is_live)

// A computed rather than a ternary chain in the template: three states and
// two conditions is past the point where an inline expression reads.
const rowTone = computed(() => {
  if (isLive.value) return 'bg-danger/10 ring-1 ring-danger/30'
  if (onCourt.value) return 'bg-primary/10'
  return 'bg-canvas'
})

/** The game in progress: the last one entered, or a fresh 0-0. */
const currentGame = computed<LiveBracketScore>(() => {
  const games = props.match.live_score ?? []
  return games[games.length - 1] ?? { game_number: 1, team1_score: 0, team2_score: 0 }
})

/**
 * A point replaces the last game rather than mutating it: the parent owns the
 * array and posts the whole thing, so handing back a mutated reference would
 * make the optimistic update indistinguishable from the server's answer.
 */
function adjust(team: 1 | 2, delta: number) {
  const games = [...(props.match.live_score ?? [])]
  const index = Math.max(0, games.length - 1)
  const game = games[index] ?? { game_number: 1, team1_score: 0, team2_score: 0 }

  const next = {
    ...game,
    team1_score: team === 1 ? Math.max(0, game.team1_score + delta) : game.team1_score,
    team2_score: team === 2 ? Math.max(0, game.team2_score + delta) : game.team2_score
  }
  games[index] = next

  /**
   * A finished game opens the next one by itself — the "Next game" button that
   * used to sit below this was a second, divergent way to do the same thing,
   * and pressing it early opened a game nobody had played.
   *
   * Only on a point being added: correcting a mistake by taking one back must
   * never spawn a game.
   */
  if (delta > 0 && isGameComplete(toGameScore(next), rules.value)) {
    const played = games.map(toGameScore)
    if (!seriesWinner(played, rules.value)) {
      games.push({ game_number: games.length + 1, team1_score: 0, team2_score: 0 })
    }
  }

  emit('score', props.match.id, games)
}

function toGameScore(game: { team1_score: number; team2_score: number }): GameScore {
  return { team1_score: game.team1_score, team2_score: game.team2_score }
}

/**
 * The rules this match is played under.
 *
 * From the category when the caller passes one — that is what makes a
 * best-of-five final possible (SC-1) — and the standard defaults otherwise.
 */
const rules = computed<GameRules>(() =>
  rulesForRound(props.category ?? null, props.round)
)

/** Both slots filled and nothing recorded yet — the only state worth a form. */
const canRecord = computed(
  () =>
    props.canManage &&
    !props.match.match_id &&
    !!props.match.participant1_registration_id &&
    !!props.match.participant2_registration_id &&
    !isBye.value
)

/** Startable once both slots are filled and nothing has been recorded. */
const canStart = computed(
  () => canRecord.value && !isLive.value && !props.match.winner_registration_id
)

const winnerIsSide1 = computed(
  () =>
    !!props.match.winner_registration_id &&
    props.match.winner_registration_id === props.match.participant1_registration_id
)
const winnerIsSide2 = computed(
  () =>
    !!props.match.winner_registration_id &&
    props.match.winner_registration_id === props.match.participant2_registration_id
)

/**
 * What this match is doing, derived from what is actually happening to it.
 *
 * `isLive` comes first and used to be missing entirely. The label was computed
 * from the DRAW's status, which only ever means "scheduled onto a court" — so a
 * match with a running scoreboard, points going in, still read "Ready to
 * start". A live match is being played whatever the draw says about it.
 */
const statusLabel = computed(() => {
  if (isBye.value) return 'Bye'
  if (isDone.value) return 'Completed'
  if (isLive.value) return 'In progress'
  if (onCourt.value) return 'On court'
  if (props.match.status === 'ready') return 'Ready to start'
  return 'Waiting on an earlier result'
})

/** Same three states, in colour, so the row reads without being parsed. */
const statusTone = computed(() => {
  if (isDone.value) return 'bg-primary-soft text-primary'
  if (isLive.value) return 'bg-warning-fill text-fg'
  if (onCourt.value) return 'bg-warning-soft text-warning'
  return 'bg-surface-2 text-fg-muted'
})

// --- Recording a result ---
// Three rows because best-of-three is the common case; a blank row is simply
// not submitted, so a two-set win needs no interaction to leave the third out.
interface SetRow {
  participant1_score: string
  participant2_score: string
}

const showForm = ref(false)
const winner = ref('')
const sets = reactive<SetRow[]>([
  { participant1_score: '', participant2_score: '' },
  { participant1_score: '', participant2_score: '' },
  { participant1_score: '', participant2_score: '' }
])

function openForm() {
  winner.value = ''
  for (const set of sets) {
    set.participant1_score = ''
    set.participant2_score = ''
  }
  showForm.value = true
  expanded.value = true
}

/** Only rows where both numbers were filled in count as a played set. */
const filledSets = computed(() =>
  sets
    .map((set, i) => ({ set, number: i + 1 }))
    .filter(({ set }) => set.participant1_score !== '' && set.participant2_score !== '')
    .map(({ set, number }) => ({
      set_number: number,
      participant1_score: Number(set.participant1_score),
      participant2_score: Number(set.participant2_score)
    }))
)

/**
 * Offered rather than enforced: the server deliberately allows a winner who
 * took fewer sets, because a retirement is a real outcome. This just saves the
 * organiser a click in the ordinary case.
 */
const setsWonBySide1 = computed(
  () => filledSets.value.filter((s) => s.participant1_score > s.participant2_score).length
)
const setsWonBySide2 = computed(
  () => filledSets.value.filter((s) => s.participant2_score > s.participant1_score).length
)

watch(filledSets, () => {
  if (winner.value) return
  if (setsWonBySide1.value > setsWonBySide2.value) {
    winner.value = props.match.participant1_registration_id ?? ''
  } else if (setsWonBySide2.value > setsWonBySide1.value) {
    winner.value = props.match.participant2_registration_id ?? ''
  }
})

const canSubmit = computed(() => !!winner.value && filledSets.value.length > 0)

function submit() {
  if (!canSubmit.value) return
  emit('record', props.match.id, {
    winner_registration_id: winner.value,
    scores: filledSets.value
  })
}

// The parent clears `recording` when the request settles; no error left behind
// means it landed, which is the signal to close.
watch(
  () => props.recording,
  (isRecording, wasRecording) => {
    if (wasRecording && !isRecording && !props.recordError) showForm.value = false
  }
)
</script>

<template>
  <li class="rounded-lg" :class="rowTone">
    <button
      type="button"
      class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span
        v-if="index != null"
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold tabular-nums text-primary"
      >
        {{ index }}
      </span>

      <span class="min-w-0 flex-1 text-sm text-fg">
        <template v-if="isBye">
          {{ side1 }} <span class="italic text-fg-muted">advanced on a bye</span>
        </template>
        <template v-else>
          <span :class="winnerIsSide1 ? 'font-semibold' : ''">{{ side1 }}</span>
          <span class="text-fg-muted"> vs </span>
          <span :class="winnerIsSide2 ? 'font-semibold' : ''">{{ side2 }}</span>
        </template>
      </span>

      <span class="text-xs text-fg-muted">{{ roundLabel(round) }}</span>

      <!-- LIVE outranks "On court": one says a match is scheduled somewhere,
           the other says the score on screen is changing as you read it. -->
      <span
        v-if="isLive"
        class="inline-flex items-center gap-1.5 rounded-pill bg-danger/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-danger"
      >
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
        Live
      </span>
      <span v-else-if="onCourt" class="rounded-pill bg-primary/20 px-2 py-0.5 text-xs text-primary">
        On court
      </span>

      <!-- The running score on the collapsed row: a spectator should not have
           to open anything to see it. -->
      <span v-if="isLive" class="text-sm font-bold tabular-nums text-fg">
        {{ currentGame.team1_score }}<span class="mx-1 text-fg-muted">-</span
        >{{ currentGame.team2_score }}
      </span>

      <UiIcon
        :name="expanded ? 'chevron-up' : 'chevron-down'"
        size="h-4 w-4"
        class="shrink-0 text-fg-muted"
      />
    </button>

    <div v-if="expanded" class="space-y-3 border-t border-border-strong/40 px-3 pb-3 pt-3">
      <p class="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
        <span>{{ roundLabel(round) }}</span>
        <span>·</span>
        <span class="rounded-badge px-1.5 py-0.5 font-medium" :class="statusTone">
          {{ statusLabel }}
        </span>
      </p>

      <!-- The score, oriented on the server to these two slots so the columns
           read in the same order as the names above. -->
      <table v-if="match.scores.length" class="w-full text-sm">
        <thead>
          <tr>
            <th class="sr-only">Entrant</th>
            <th v-for="set in match.scores" :key="set.set_number" class="sr-only">
              Set {{ set.set_number }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr :class="winnerIsSide1 ? 'font-semibold text-fg' : 'text-fg-secondary'">
            <td class="py-1 pr-3">{{ side1 }}</td>
            <td
              v-for="set in match.scores"
              :key="set.set_number"
              class="w-10 py-1 text-right tabular-nums"
            >
              {{ set.participant1_score }}
            </td>
            <td class="w-6 py-1 text-right text-xs text-primary">
              {{ winnerIsSide1 ? 'W' : '' }}
            </td>
          </tr>
          <tr :class="winnerIsSide2 ? 'font-semibold text-fg' : 'text-fg-secondary'">
            <td class="py-1 pr-3">{{ side2 }}</td>
            <td
              v-for="set in match.scores"
              :key="set.set_number"
              class="w-10 py-1 text-right tabular-nums"
            >
              {{ set.participant2_score }}
            </td>
            <td class="w-6 py-1 text-right text-xs text-primary">
              {{ winnerIsSide2 ? 'W' : '' }}
            </td>
          </tr>
        </tbody>
      </table>

      <p v-else-if="isDone" class="text-sm text-fg-muted">
        Won by {{ winnerIsSide1 ? side1 : side2 }} — no score recorded.
      </p>

      <NuxtLink
        v-if="match.match_id"
        :to="`/matches/${match.match_id}`"
        class="inline-block text-sm text-primary hover:underline"
      >
        View match
      </NuxtLink>

      <!-- Organiser: start the match and keep the score while it is played.
           Deliberately above the result form — a match is played before it is
           written down, and the live score is what the room is watching. -->
      <div v-if="canStart" class="flex items-center gap-2">
        <UiButton size="sm" variant="secondary" @click="emit('start', match.id)">
          Start match
        </UiButton>
        <span class="text-xs text-fg-muted">Opens a live scoreboard for spectators.</span>
      </div>

      <div v-if="isLive && canManage" class="space-y-2 rounded-lg bg-surface p-3">
        <div class="grid grid-cols-[1fr_auto] items-center gap-2">
          <span class="min-w-0 truncate text-sm text-fg">{{ side1 }}</span>
          <span class="flex items-center gap-1.5">
            <button
              type="button"
              class="h-8 w-8 rounded-button border border-border-strong text-fg-secondary hover:border-primary"
              :aria-label="`Remove a point from ${side1}`"
              @click="adjust(1, -1)"
            >
              −
            </button>
            <span class="w-8 text-center text-lg font-bold tabular-nums text-fg">
              {{ currentGame.team1_score }}
            </span>
            <button
              type="button"
              class="h-8 w-8 rounded-button bg-primary font-semibold text-on-primary hover:bg-primary-hover"
              :aria-label="`Add a point for ${side1}`"
              @click="adjust(1, 1)"
            >
              +
            </button>
          </span>
        </div>

        <div class="grid grid-cols-[1fr_auto] items-center gap-2">
          <span class="min-w-0 truncate text-sm text-fg">{{ side2 }}</span>
          <span class="flex items-center gap-1.5">
            <button
              type="button"
              class="h-8 w-8 rounded-button border border-border-strong text-fg-secondary hover:border-primary"
              :aria-label="`Remove a point from ${side2}`"
              @click="adjust(2, -1)"
            >
              −
            </button>
            <span class="w-8 text-center text-lg font-bold tabular-nums text-fg">
              {{ currentGame.team2_score }}
            </span>
            <button
              type="button"
              class="h-8 w-8 rounded-button bg-primary font-semibold text-on-primary hover:bg-primary-hover"
              :aria-label="`Add a point for ${side2}`"
              @click="adjust(2, 1)"
            >
              +
            </button>
          </span>
        </div>

        <div class="flex items-center justify-between gap-2 pt-1">
          <span class="text-xs text-fg-muted">
            A finished game opens the next one. Submit the final score below to decide the match.
          </span>
        </div>
      </div>

      <!-- Organiser: write down what happened. This is the only path that links
           a slot to a played match. -->
      <div v-if="canRecord">
        <button
          v-if="!showForm"
          type="button"
          class="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-secondary hover:border-primary hover:text-fg"
          @click="openForm"
        >
          Record result
        </button>

        <div v-else class="space-y-3 rounded-lg bg-surface p-3">
          <div class="space-y-2">
            <div v-for="(set, i) in sets" :key="i" class="flex items-center gap-2">
              <span class="w-12 shrink-0 text-xs text-fg-muted">Set {{ i + 1 }}</span>
              <input
                v-model="set.participant1_score"
                type="number"
                min="0"
                :aria-label="`Set ${i + 1}, ${side1}`"
                class="w-16 rounded-lg border border-border-strong bg-canvas px-2 py-1.5 text-sm tabular-nums text-fg focus:border-primary focus:outline-none"
              />
              <span class="text-fg-muted">–</span>
              <input
                v-model="set.participant2_score"
                type="number"
                min="0"
                :aria-label="`Set ${i + 1}, ${side2}`"
                class="w-16 rounded-lg border border-border-strong bg-canvas px-2 py-1.5 text-sm tabular-nums text-fg focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <fieldset>
            <legend class="mb-1.5 text-xs text-fg-secondary">Winner</legend>
            <div class="flex flex-wrap gap-3">
              <label class="flex items-center gap-1.5 text-sm text-fg">
                <input
                  v-model="winner"
                  type="radio"
                  :value="match.participant1_registration_id"
                  class="accent-primary"
                />
                {{ side1 }}
              </label>
              <label class="flex items-center gap-1.5 text-sm text-fg">
                <input
                  v-model="winner"
                  type="radio"
                  :value="match.participant2_registration_id"
                  class="accent-primary"
                />
                {{ side2 }}
              </label>
            </div>
          </fieldset>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              :disabled="!canSubmit || recording"
              class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
              @click="submit"
            >
              {{ recording ? 'Saving…' : 'Save result' }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:text-fg"
              @click="showForm = false"
            >
              Cancel
            </button>
            <span v-if="!canSubmit" class="text-xs text-fg-muted">
              Enter at least one set and pick the winner.
            </span>
          </div>

          <p v-if="recordError" role="alert" class="text-xs text-danger">{{ recordError }}</p>
        </div>
      </div>
    </div>
  </li>
</template>
