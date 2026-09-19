<script setup lang="ts">
import { DEFAULT_GAME_RULES, isGameComplete, seriesWinner, type GameRules } from '~/utils/game-rules'
import type {
  CourtSideDto,
  EventCourtDto,
  LiveGameScore
} from '~/server/domains/event/dto/event.dto'

/**
 * One court on the live board — redesigned with Team 1 / Team 2 columns.
 *
 * Two audiences in one card: a spectator and the person at the desk are
 * looking at the same court. The organiser controls appear only for canManage.
 */
const props = withDefaults(
  defineProps<{
    court: EventCourtDto
    canManage: boolean
    busy?: boolean
    wide?: boolean
    rules?: Pick<GameRules, 'targetPoints' | 'winByTwo' | 'bestOf'> | null
  }>(),
  { busy: false, wide: false, rules: null }
)

const emit = defineEmits<{
  score: [scores: LiveGameScore[]]
  submit: []
  start: []
}>()

const isLive = computed(() => props.court.status === 'playing')

const rules = computed<GameRules>(() => {
  const played = (props.court.live_score ?? []).length
  const configured = props.rules
  return {
    targetPoints: configured?.targetPoints ?? DEFAULT_GAME_RULES.targetPoints,
    winByTwo: configured?.winByTwo ?? DEFAULT_GAME_RULES.winByTwo,
    bestOf: Math.max(1, configured?.bestOf ?? DEFAULT_GAME_RULES.bestOf, played)
  }
})

const serverGames = computed(() => props.court.live_score ?? [])

const {
  displayGames,
  pending: pendingGames,
  pendingIndex,
  addPoint: adjust,
  confirm: confirmGame,
  cancel: cancelGame
} = useGameConfirm(rules, serverGames, (games) => emit('score', games))

const currentGame = computed<LiveGameScore>(
  () =>
    displayGames.value[displayGames.value.length - 1] ?? {
      game_number: 1,
      team1_score: 0,
      team2_score: 0
    }
)

const courtLabel = computed(() =>
  props.court.court_name || `Court ${props.court.court_number}`
)

function players(side: CourtSideDto | null) {
  if (!side || side.players.length === 0) return [{ id: null, name: 'TBC', rating: null }]
  return side.players.map((p) => ({
    id: p.id,
    name: p.display_name,
    rating: (p as any).rating ?? null
  }))
}

const team1Players = computed(() => players(props.court.team1))
const team2Players = computed(() => players(props.court.team2))

const winner = computed(() => seriesWinner(
  displayGames.value.map(g => ({ team1_score: g.team1_score, team2_score: g.team2_score })),
  rules.value
))

/**
 * Scoring is locked when:
 * - A game-complete confirmation is pending
 * - The current game is already complete (shouldn't happen, but safety)
 * - The match is already won
 */
const scoringLocked = computed(() => {
  if (pendingGames.value !== null) return true
  if (winner.value !== null) return true
  const game = currentGame.value
  return isGameComplete({ team1_score: game.team1_score, team2_score: game.team2_score }, rules.value)
})

const showSubmitConfirm = ref(false)
const submitSide = ref<1 | 2 | null>(null)

function requestSubmit(side: 1 | 2) {
  submitSide.value = side
  showSubmitConfirm.value = true
}

function confirmSubmit() {
  showSubmitConfirm.value = false
  emit('submit')
}

function cancelSubmit() {
  showSubmitConfirm.value = false
  submitSide.value = null
}

const team1Label = computed(() =>
  props.court.team1?.players.map((p) => p.display_name).join(' & ') ?? 'Team 1'
)
const team2Label = computed(() =>
  props.court.team2?.players.map((p) => p.display_name).join(' & ') ?? 'Team 2'
)
</script>

<template>
  <article
    class="overflow-hidden rounded-xl border shadow-card"
    :class="isLive ? 'border-warning/40 bg-surface-2' : 'border-border bg-surface'"
  >
    <!-- Header: Court number + LIVE badge -->
    <header
      class="flex items-center justify-between gap-3 px-4 py-3"
      :class="isLive ? 'bg-surface-2' : 'bg-surface'"
    >
      <div class="flex items-center gap-3">
        <h3 class="font-display text-lg font-bold text-fg">{{ courtLabel }}</h3>
        <span
          v-if="isLive"
          class="inline-flex items-center gap-1.5 rounded-md bg-danger px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
        >
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden="true" />
          Live
        </span>
      </div>
      <div class="flex items-center gap-2 text-fg-muted">
        <span v-if="isLive" class="text-sm tabular-nums">G{{ currentGame.game_number }}</span>
      </div>
    </header>

    <!-- Playing: Two-column team layout -->
    <div v-if="isLive" class="px-4 pb-4">
      <div class="grid grid-cols-2 gap-3">
        <!-- Team 1 Column -->
        <div class="rounded-lg bg-primary/10 p-3">
          <div class="mb-2 text-xs font-bold uppercase tracking-wider text-fg-secondary">
            Team 1
          </div>
          <div class="space-y-2">
            <div v-for="player in team1Players" :key="player.id ?? player.name" class="text-sm">
              <div class="flex items-center gap-1.5">
                <span class="font-medium text-fg">{{ player.name }}</span>
                <span v-if="player.rating" class="font-mono text-xs tabular-nums text-fg-muted">
                  {{ player.rating }}
                </span>
              </div>
            </div>
          </div>
          <!-- Score display -->
          <div class="mt-3 text-center">
            <span class="font-display text-4xl font-bold tabular-nums text-primary">
              {{ currentGame.team1_score }}
            </span>
          </div>
          <!-- Scoring controls -->
          <div v-if="canManage" class="mt-3 flex justify-center gap-2">
            <button
              type="button"
              class="h-10 w-10 rounded-lg border border-border-strong text-lg font-bold text-fg-secondary hover:border-primary hover:text-fg disabled:opacity-50"
              :disabled="busy || currentGame.team1_score <= 0"
              @click="adjust(1, -1)"
            >
              −
            </button>
            <button
              type="button"
              class="h-10 w-10 rounded-lg bg-primary text-lg font-bold text-on-primary hover:bg-primary-hover disabled:opacity-50"
              :disabled="busy || scoringLocked"
              @click="adjust(1, 1)"
            >
              +
            </button>
          </div>
        </div>

        <!-- VS divider (hidden, handled by gap) -->

        <!-- Team 2 Column -->
        <div class="rounded-lg bg-warning/10 p-3">
          <div class="mb-2 text-xs font-bold uppercase tracking-wider text-fg-secondary">
            Team 2
          </div>
          <div class="space-y-2">
            <div v-for="player in team2Players" :key="player.id ?? player.name" class="text-sm">
              <div class="flex items-center gap-1.5">
                <span class="font-medium text-fg">{{ player.name }}</span>
                <span v-if="player.rating" class="font-mono text-xs tabular-nums text-fg-muted">
                  {{ player.rating }}
                </span>
              </div>
            </div>
          </div>
          <!-- Score display -->
          <div class="mt-3 text-center">
            <span class="font-display text-4xl font-bold tabular-nums text-warning">
              {{ currentGame.team2_score }}
            </span>
          </div>
          <!-- Scoring controls -->
          <div v-if="canManage" class="mt-3 flex justify-center gap-2">
            <button
              type="button"
              class="h-10 w-10 rounded-lg border border-border-strong text-lg font-bold text-fg-secondary hover:border-warning hover:text-fg disabled:opacity-50"
              :disabled="busy || currentGame.team2_score <= 0"
              @click="adjust(2, -1)"
            >
              −
            </button>
            <button
              type="button"
              class="h-10 w-10 rounded-lg bg-warning text-lg font-bold text-fg hover:bg-warning/80 disabled:opacity-50"
              :disabled="busy || scoringLocked"
              @click="adjust(2, 1)"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <!-- Games summary (if multi-game) -->
      <p v-if="displayGames.length > 1" class="mt-3 text-center text-sm tabular-nums text-fg-muted">
        Games:
        {{ displayGames.slice(0, -1).map((g) => `${g.team1_score}–${g.team2_score}`).join(', ') }}
      </p>

      <!-- Win buttons / Submit -->
      <div v-if="canManage" class="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          class="rounded-lg bg-primary py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          :class="winner === 1 ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''"
          :disabled="busy"
          @click="requestSubmit(1)"
        >
          Team 1 Wins
        </button>
        <button
          type="button"
          class="rounded-lg bg-warning py-3 text-sm font-bold text-fg transition-colors hover:bg-warning/80 disabled:opacity-50"
          :class="winner === 2 ? 'ring-2 ring-warning ring-offset-2 ring-offset-surface' : ''"
          :disabled="busy"
          @click="requestSubmit(2)"
        >
          Team 2 Wins
        </button>
      </div>

      <!-- Spectator view: just the score -->
      <div v-if="!canManage" class="mt-4 text-center text-sm text-fg-muted">
        Game {{ currentGame.game_number }} in progress
      </div>
    </div>

    <!-- Free court: Start game button -->
    <div v-else class="px-4 pb-4">
      <p class="text-center text-sm text-fg-muted">No game on this court.</p>
      <button
        v-if="canManage"
        type="button"
        class="mt-3 w-full rounded-lg bg-primary py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        :disabled="busy"
        @click="emit('start')"
      >
        Start a game
      </button>
    </div>

    <!-- Up next queue -->
    <div v-if="court.up_next.length" class="border-t border-border bg-canvas px-4 py-3">
      <p class="text-xs font-bold uppercase tracking-wider text-fg-muted">Up next</p>
      <ol class="mt-2 space-y-1">
        <li
          v-for="(side, index) in court.up_next"
          :key="side.queue_id"
          class="flex items-center gap-2 text-sm text-fg-secondary"
        >
          <span class="text-xs tabular-nums text-fg-muted">{{ index + 1 }}.</span>
          <span v-if="!side.players.length">TBC</span>
          <span v-else class="flex flex-wrap items-center gap-1">
            <template v-for="(player, i) in side.players" :key="player.id ?? i">
              <span v-if="i > 0" class="text-fg-muted">&amp;</span>
              <span>{{ player.display_name }}</span>
            </template>
          </span>
        </li>
      </ol>
    </div>

    <!-- Game confirm dialog -->
    <MatchGameConfirmDialog
      :model-value="pendingGames !== null"
      :game-index="pendingIndex"
      :teams="[
        court.team1?.players.map((p) => p.display_name) ?? ['TBC'],
        court.team2?.players.map((p) => p.display_name) ?? ['TBC']
      ]"
      :team1-score="currentGame.team1_score"
      :team2-score="currentGame.team2_score"
      @confirm="confirmGame"
      @cancel="cancelGame"
      @update:model-value="!$event && cancelGame()"
    />

    <!-- Match submission confirm dialog -->
    <UiModal
      :model-value="showSubmitConfirm"
      title="Record this result?"
      hide-actions
      @update:model-value="!$event && cancelSubmit()"
      @cancel="cancelSubmit"
    >
      <p class="text-body-2 text-fg-secondary">
        This will end the game and record
        <strong class="font-medium text-fg">{{ submitSide === 1 ? team1Label : team2Label }}</strong>
        as the winner.
      </p>

      <div class="mt-4 rounded-lg border border-border bg-canvas p-4">
        <div class="flex items-center justify-between">
          <div class="text-sm">
            <p class="font-medium text-fg">{{ team1Label }}</p>
            <p class="text-fg-muted">{{ currentGame.team1_score }} points</p>
          </div>
          <span class="text-lg font-bold text-fg-muted">vs</span>
          <div class="text-right text-sm">
            <p class="font-medium text-fg">{{ team2Label }}</p>
            <p class="text-fg-muted">{{ currentGame.team2_score }} points</p>
          </div>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <UiButton @click="confirmSubmit">Yes, record result</UiButton>
        <UiButton variant="secondary" @click="cancelSubmit">No, go back</UiButton>
      </div>
    </UiModal>
  </article>
</template>
