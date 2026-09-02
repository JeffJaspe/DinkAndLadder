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
  gamesNeeded,
  rulesForRound,
  seriesWinner,
  type GameRules,
  type GameScore,
  type MatchResultType
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

/**
 * The rules this match is played under.
 *
 * From the category when the caller passes one — that is what makes a
 * best-of-five final possible (SC-1) — and the standard defaults otherwise.
 *
 * Declared before the scoring block below, which passes it to a composable and
 * therefore reads it during setup rather than lazily.
 */
const rules = computed<GameRules>(() => rulesForRound(props.category ?? null, props.round))

/**
 * A point replaces the last game rather than mutating it: the parent owns the
 * array and posts the whole thing, so handing back a mutated reference would
 * make the optimistic update indistinguishable from the server's answer.
 *
 * The point that finishes a game is held rather than posted — see
 * `useGameConfirm`, which is where the "is this the final score?" step lives.
 */
const serverGames = computed(() => props.match.live_score ?? [])

const {
  displayGames,
  pending: pendingGames,
  pendingIndex,
  addPoint: adjust,
  confirm: confirmGame,
  cancel: cancelGame
} = useGameConfirm(rules, serverGames, (games) => emit('score', props.match.id, games))

/** The game in progress: the last one entered, or a fresh 0-0. */
const currentGame = computed<LiveBracketScore>(
  () =>
    displayGames.value[displayGames.value.length - 1] ?? {
      game_number: 1,
      team1_score: 0,
      team2_score: 0
    }
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

// --- Reading back a finished result ---

/**
 * The stored score as games.
 *
 * `GameScore` is positional — its place in the array is the game number — so
 * the rows are ordered by `set_number` rather than carrying it. (`set_number`
 * is the column's name, not the sport's; the column was deliberately left alone
 * when the vocabulary changed.)
 */
const recordedGames = computed<GameScore[]>(() =>
  [...props.match.scores]
    .sort((a, b) => a.set_number - b.set_number)
    .map((score) => ({
      team1_score: score.participant1_score,
      team2_score: score.participant2_score
    }))
)

const recordedSide = computed<1 | 2 | null>(() =>
  winnerIsSide1.value ? 1 : winnerIsSide2.value ? 2 : null
)

/**
 * Whether the sheet may read the winner off the score, or must be told.
 *
 * A match whose games decide it is `normal`. One with a recorded winner the
 * games do NOT support was abandoned — a retirement or a walkover — and the
 * sheet has to be handed the winner rather than deducing one that is not there.
 * The bracket row does not carry `result_type`, so this infers the distinction
 * from the only evidence it has, which is enough for the W to land on the right
 * line.
 */
const recordedResultType = computed<MatchResultType>(() =>
  seriesWinner(recordedGames.value, rules.value) ? 'normal' : 'retired'
)

// --- Recording a result ---
/**
 * The same score sheet the rest of the product uses.
 *
 * This panel kept its own form long after `MatchScoreSheet` landed: three rows
 * hard-coded to best-of-three, labelled "Set", with a winner the organiser had
 * to pick by hand. Three things wrong with that. The row count ignored the
 * category's own rules, so a one-game session showed two boxes that could not
 * be played and a best-of-five could not record games four and five at all. The
 * vocabulary contradicted the decision recorded for the rest of the codebase —
 * these are **games**, not sets. And "who won" was decided by counting rows
 * where one number exceeded the other, which is not the rule: 11-10 is not a
 * finished game, and being ahead is not winning.
 *
 * Everything here now comes from `utils/game-rules.ts`, which the server
 * validates against, so this surface cannot disagree with the others.
 */
/** One blank game per game the rules allow, so the grid matches the format. */
function blankGames(): GameScore[] {
  return Array.from({ length: gamesNeeded(rules.value) }, () => ({
    team1_score: null,
    team2_score: null
  }))
}

const games = ref<GameScore[]>(blankGames())
const resultType = ref<MatchResultType>('normal')

/**
 * Who won, when the score cannot say.
 *
 * A walkover or a DQ has no score to read a winner from (SC-3), so the
 * organiser names one. A played-out match never asks: the games decide it.
 */
const explicitWinner = ref<1 | 2 | null>(null)

/**
 * The sheet fills itself in from the live score.
 *
 * These were two disconnected surfaces: points went into the stepper above and
 * the sheet below stayed empty, so an organiser who had just scored a whole
 * game had to read their own numbers off the top of the card and type them in
 * again. Confirming a game now writes it straight into the sheet, which is what
 * makes the confirmation worth answering — it is the moment the game becomes a
 * recorded fact rather than a running tally.
 *
 * Only games the live board has actually reached are copied; the rest of the
 * grid stays blank and typeable, so a match scored partly on paper and partly
 * on the stepper still works.
 */
watch(
  [displayGames, rules],
  ([live]) => {
    const grid = blankGames()
    live.forEach((game, index) => {
      if (index < grid.length) {
        grid[index] = { team1_score: game.team1_score, team2_score: game.team2_score }
      }
    })
    games.value = grid
  },
  { immediate: true, deep: true }
)

/** The winner the sheet has arrived at: from the games, or named for a walkover. */
const resolvedSide = computed<1 | 2 | null>(() => {
  const fromScore = seriesWinner(games.value, rules.value)
  if (fromScore) return fromScore
  return resultType.value === 'normal' ? null : explicitWinner.value
})

const winnerRegistrationId = computed(() =>
  resolvedSide.value === 1
    ? (props.match.participant1_registration_id ?? '')
    : resolvedSide.value === 2
      ? (props.match.participant2_registration_id ?? '')
      : ''
)

/**
 * Games with both numbers in. A blank trailing game simply was not played.
 *
 * Numbered by position before filtering, so a gap cannot renumber the games
 * after it — game 3 stays game 3 even if game 2 was left empty.
 */
const playedGames = computed(() =>
  games.value
    .map((game, index) => ({ game, number: index + 1 }))
    .filter(({ game }) => game.team1_score !== null && game.team2_score !== null)
    .map(({ game, number }) => ({
      set_number: number,
      participant1_score: game.team1_score as number,
      participant2_score: game.team2_score as number
    }))
)

/**
 * How a match ended can only be answered once it has started.
 *
 * The select sat enabled on a match nobody had begun, offering "Retired" for a
 * game that had not been played. It unlocks when the match goes live and stays
 * unlocked afterwards, because a retirement is decided at the moment play stops
 * — which is exactly when this is needed.
 */
const canSetResultType = computed(() => isLive.value || playedGames.value.length > 0)

/**
 * What each ending means, said in the row rather than left to the word alone.
 *
 * "DQ" and "Walkover" are not interchangeable and an organiser under pressure
 * should not have to remember which is which — one is a decision against a
 * player, the other is nobody turning up.
 */
const RESULT_REASONS: Record<MatchResultType, string> = {
  normal: '',
  retired: 'A player stopped mid-match. The score so far is kept and the other side takes the win.',
  dq: 'A player was disqualified. Any score played is kept and the win is awarded against them.',
  walkover: 'Nobody played. No score is recorded and the win is awarded outright.'
}

const resultReason = computed(() => RESULT_REASONS[resultType.value])

/**
 * Anything but "played out" can be saved without a full score.
 *
 * A played-out match must be decided by its games — that is what the sheet is
 * for. The other three endings are decided by the organiser naming a winner,
 * which is the whole reason they exist (SC-3), so requiring a finished score
 * for them would make an abandoned match impossible to record.
 */
const canSubmit = computed(() => {
  if (!winnerRegistrationId.value) return false
  return resultType.value !== 'normal' || playedGames.value.length > 0
})

const submitHint = computed(() => {
  if (canSubmit.value) return ''
  if (resultType.value !== 'normal') return 'Pick who takes the win.'
  if (playedGames.value.length === 0) return 'Enter the score of at least one game.'
  return `No one has won yet — a game goes to ${rules.value.targetPoints}${
    rules.value.winByTwo ? ', win by two' : ''
  }.`
})

function submit() {
  if (!canSubmit.value) return
  emit('record', props.match.id, {
    winner_registration_id: winnerRegistrationId.value,
    // The API still says `set_number`; the column was deliberately left alone
    // when the vocabulary changed. Only the wording above the input moved.
    scores: playedGames.value
  })
}

// Nothing to close on success any more — the sheet is always on screen, and
// once the result lands `canRecord` turns false and it is replaced by the
// recorded score.
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

      <!-- The finished score, in the same sheet it was entered on. This was a
           hand-built table — the third divergent rendering of one result that
           MatchScoreSheet exists to prevent, and the last place still saying
           "Set". The server orients the columns to these two slots, so they
           read in the same order as the names above. -->
      <MatchScoreSheet
        v-if="match.scores.length"
        readonly
        :teams="[[side1], [side2]]"
        :games="recordedGames"
        :rules="rules"
        :result-type="recordedResultType"
        :explicit-winner="recordedSide"
      />

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
            Reaching {{ rules.targetPoints }}{{ rules.winByTwo ? ' with two clear' : '' }} asks you
            to confirm the game. Submit the final score below to decide the match.
          </span>
        </div>

        <MatchGameConfirmDialog
          :model-value="pendingGames !== null"
          :game-index="pendingIndex"
          :teams="[[side1], [side2]]"
          :team1-score="currentGame.team1_score"
          :team2-score="currentGame.team2_score"
          @confirm="confirmGame"
          @cancel="cancelGame"
          @update:model-value="!$event && cancelGame()"
        />
      </div>

      <!-- Organiser: write down what happened. This is the only path that links
           a slot to a played match.

           Always on screen, never behind a "Record result" button. The sheet is
           where the score of the match being played is read, and hiding it
           meant the organiser scoring a live game could not see what they were
           accumulating without pressing a button that implied the match was
           over. It also fills itself in as each game is confirmed, so by the
           time the match ends there is usually nothing left to type. -->
      <div v-if="canRecord">
        <div class="space-y-3 rounded-lg bg-surface p-3">
          <!-- The paper score sheet, same component as match submission and the
               match view — one row per side, one column per game, the winner
               marked on the row. It replaces three hard-coded "Set" rows that
               ignored the category's format and let the organiser name a winner
               the score did not support. -->
          <MatchScoreSheet
            v-model:games="games"
            :teams="[[side1], [side2]]"
            :rules="rules"
            :result-type="resultType"
            :explicit-winner="explicitWinner"
          />

          <div class="flex flex-wrap items-end gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-xs text-fg-secondary">How did it end?</span>
              <select
                v-model="resultType"
                :disabled="!canSetResultType"
                :title="
                  canSetResultType ? undefined : 'Available once the match is under way.'
                "
                class="rounded-lg border border-border-strong bg-canvas px-3 py-1.5 text-sm text-fg focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="normal">Played out</option>
                <option value="retired">Retired</option>
                <option value="dq">Disqualification</option>
                <option value="walkover">Walkover</option>
              </select>
            </label>

            <!-- Only asked when the score cannot answer it. A played-out match
                 is decided by its games, so offering a radio there would invite
                 an organiser to contradict the sheet above. -->
            <fieldset v-if="resultType !== 'normal'">
              <legend class="mb-1.5 text-xs text-fg-secondary">Who takes the win?</legend>
              <div class="flex flex-wrap gap-3">
                <label class="flex items-center gap-1.5 text-sm text-fg">
                  <input
                    v-model="explicitWinner"
                    type="radio"
                    :value="1"
                    class="accent-primary"
                  />
                  {{ side1 }}
                </label>
                <label class="flex items-center gap-1.5 text-sm text-fg">
                  <input
                    v-model="explicitWinner"
                    type="radio"
                    :value="2"
                    class="accent-primary"
                  />
                  {{ side2 }}
                </label>
              </div>
            </fieldset>
          </div>

          <!-- What the chosen ending actually does to the result, so DQ and
               walkover are not two words an organiser has to tell apart from
               memory while a court is waiting. -->
          <p v-if="resultReason" class="rounded-button bg-warning-soft px-3 py-1.5 text-xs text-warning">
            {{ resultReason }}
          </p>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              :disabled="!canSubmit || recording"
              class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
              @click="submit"
            >
              {{ recording ? 'Saving…' : 'Save result' }}
            </button>
            <!-- No Cancel: there is no longer a form to back out of, and the
                 sheet holds nothing that is not either typed or already on the
                 live board. -->
            <span v-if="submitHint" class="text-xs text-fg-muted">{{ submitHint }}</span>
          </div>

          <p v-if="recordError" role="alert" class="text-xs text-danger">{{ recordError }}</p>
        </div>
      </div>
    </div>
  </li>
</template>
