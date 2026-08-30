<script setup lang="ts">
import type { BracketDto, BracketRoundDto } from '~/server/domains/event/dto/bracket.dto'
import type {
  TournamentFormat,
  TournamentRegistrationWithPlayerDto
} from '~/server/domains/event/dto/tournament.dto'
import {
  championOf,
  PHASE_LABELS,
  PHASE_ORDER,
  phaseOf,
  roundLabel,
  type BracketPhase
} from '~/utils/bracket-rounds'
import { formatDescription, formatLabel, hasKnockoutStage } from '~/utils/tournament-formats'
import { buildPreviewBracket, previewDrawSize, PREVIEW_ORDER_NOTE } from '~/utils/bracket-preview'

/**
 * The bracket itself.
 *
 * Format variation lives here and nowhere else. The generator encodes the phase
 * in the round number, so this renders whatever phases are present in their
 * playing order — but WHAT each phase looks like depends on the format:
 *
 *  - a round robin is a table, because a round robin has no shape to draw;
 *  - pools are tables too, one per group, with the qualifying line marked;
 *  - every knockout phase is a connector-line tree ending in a champion.
 *
 * Previously all five formats rendered as identical unconnected columns, so the
 * one question a draw exists to answer — who plays the winner of this — was the
 * one thing it did not show.
 */
const props = defineProps<{
  bracket: BracketDto | null
  /** The CATEGORY's format, already resolved against the tournament's. */
  format: TournamentFormat
  pending: boolean
  error: boolean
  canManage: boolean
  generating: boolean
  generateError: string
  /** Frozen by the organiser: public, playable, no longer redrawable. */
  locked: boolean
  undoing: boolean
  locking: boolean
  lifecycleError: string
  /** Confirmed entries, for the "not full yet" gate on Generate. */
  confirmedCount: number
  /** True once any slot carries a played match — undo and unlock are then out. */
  hasResults: boolean
  /** Confirmed entrants, in registration order, for the placeholder draw. */
  seedPreview: TournamentRegistrationWithPlayerDto[]
  /** The category's stated size, which is the honest size for a placeholder. */
  capacity?: number | null
}>()

const emit = defineEmits<{
  generate: []
  undo: []
  'set-locked': [locked: boolean]
  'select-player': [playerId: string]
}>()

/**
 * Why Generate is unavailable, or null if it is.
 *
 * Drawing a half-full category produces a bracket the remaining entrants cannot
 * be added to, and the only way back is to regenerate — the destructive
 * operation this whole lifecycle exists to make rare. Mirrors the server's
 * CATEGORY_NOT_FULL so the button explains itself rather than failing on click.
 */
const generateBlockedReason = computed<string | null>(() => {
  if (props.locked) return 'The draw is locked. Unlock it first to redraw.'
  if (props.capacity != null && props.confirmedCount < props.capacity) {
    const short = props.capacity - props.confirmedCount
    return `${props.confirmedCount} of ${props.capacity} entries in. Wait for ${short} more, approve the entries still pending, or lower the size in Settings to draw it now.`
  }
  if (props.confirmedCount < 2) return 'Two confirmed entries are needed before a draw can be made.'
  return null
})

/** Undo and Lock only mean anything once something has been drawn. */
const canUndo = computed(() => hasBracket.value && !props.locked && !props.hasResults)
const canLock = computed(() => hasBracket.value && !props.locked)
const canUnlock = computed(() => props.locked && !props.hasResults)

const matchStatusConfig: Record<string, { bg: string; border: string }> = {
  pending: { bg: 'bg-surface-2', border: 'border-border-strong' },
  ready: { bg: 'bg-warning-soft', border: 'border-warning/30' },
  in_progress: { bg: 'bg-primary/10', border: 'border-primary/30' },
  completed: { bg: 'bg-primary/10', border: 'border-primary/30' },
  bye: { bg: 'bg-surface-2', border: 'border-border-strong' }
}

interface Phase {
  phase: BracketPhase
  rounds: BracketRoundDto[]
}

const hasBracket = computed(() => (props.bracket?.rounds.length ?? 0) > 0)

/**
 * The placeholder, built only when there is no real draw to show.
 *
 * A category used to show a numbered list and nothing else until somebody
 * pressed Generate, so the shape of the event was invisible exactly when an
 * organiser was deciding whether it was right.
 */
const previewBracket = computed(() =>
  hasBracket.value || !props.seedPreview.length
    ? null
    : buildPreviewBracket(
        props.format,
        props.seedPreview.map((reg) => ({
          id: reg.id,
          display_name: reg.display_name,
          rating: reg.rating,
          partner_display_name: reg.partner_display_name
        })),
        props.capacity ?? null
      )
)

/** Real draw if there is one, placeholder otherwise. */
const displayed = computed(() => (hasBracket.value ? props.bracket : previewBracket.value))
const isPreview = computed(() => !hasBracket.value && !!previewBracket.value)
const previewSize = computed(() =>
  previewDrawSize(props.seedPreview.length, props.capacity ?? null)
)

const phases = computed<Phase[]>(() => {
  const rounds = displayed.value?.rounds ?? []
  const grouped = new Map<BracketPhase, BracketRoundDto[]>()
  for (const round of rounds) {
    const key = phaseOf(round.round)
    const list = grouped.get(key) ?? []
    list.push(round)
    grouped.set(key, list)
  }
  return PHASE_ORDER.filter((phase) => grouped.has(phase)).map((phase) => ({
    phase,
    rounds: grouped.get(phase)!.sort((a, b) => a.round - b.round)
  }))
})

/**
 * A single-phase bracket needs no phase heading — "Winners Bracket" above the
 * only thing on screen is a label for a distinction that does not exist.
 */
const showPhaseHeadings = computed(() => phases.value.length > 1)

/**
 * A pure round robin numbers its rounds from 1 exactly as a knockout does, so
 * the round number alone cannot tell them apart — only the format can. Getting
 * this wrong would draw connector lines between fixtures that never feed each
 * other.
 */
const isRoundRobin = computed(() => props.format === 'round_robin')

const champion = computed(() => championOf(props.bracket))

/** Which phase, if any, crowns the champion — so only one panel shows it. */
const decidingPhase = computed<BracketPhase | null>(() => {
  if (!hasKnockoutStage(props.format)) return null
  const present = phases.value.map((entry) => entry.phase)
  if (present.includes('grand_final')) return 'grand_final'
  if (present.includes('playoffs')) return 'playoffs'
  if (present.includes('winners')) return 'winners'
  return null
})

function partnerLine(reg: TournamentRegistrationWithPlayerDto): string {
  return reg.partner_display_name
    ? `${reg.display_name} / ${reg.partner_display_name}`
    : reg.display_name
}
</script>

<template>
  <div class="space-y-6">
    <!-- What this category is being played in, in the words the organiser
         picked it by. A player looking at a draw they did not set up has no
         other way to know whether one loss ends their day. -->
    <div class="flex flex-wrap items-center gap-4 rounded-lg bg-canvas px-4 py-3">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-fg">{{ formatLabel(format) }}</p>
        <p class="text-xs text-fg-muted">{{ formatDescription(format) }}</p>
      </div>
      <!-- A sentence tells a knockout from a round robin; it does not let you
           picture "round robin into a single elimination". The organiser is
           committing a weekend to this, and Generate is hard to take back. -->
      <TournamentFormatDiagram :format="format" class="shrink-0" />
    </div>

    <!-- The organiser's controls, in lifecycle order: draw it, undo it while
         it is still yours, then lock it to publish it. -->
    <div v-if="canManage" class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-fg-muted">
          {{
            locked
              ? 'Locked — players can see this draw and results can be recorded.'
              : hasBracket
                ? 'Only you can see this draw. Lock it to publish it and start recording results.'
                : 'Seeded by rating, strongest first.'
          }}
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <button
            v-if="!locked"
            type="button"
            :disabled="generating || !!generateBlockedReason"
            class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
            @click="emit('generate')"
          >
            {{
              generating ? 'Generating…' : hasBracket ? 'Regenerate bracket' : 'Generate bracket'
            }}
          </button>

          <button
            v-if="canUndo"
            type="button"
            :disabled="undoing"
            class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
            @click="emit('undo')"
          >
            {{ undoing ? 'Removing…' : 'Undo generate' }}
          </button>

          <!-- Beside Generate, and live only once there is a draw to freeze. -->
          <button
            v-if="canLock"
            type="button"
            :disabled="locking"
            class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
            @click="emit('set-locked', true)"
          >
            {{ locking ? 'Locking…' : 'Lock bracket' }}
          </button>

          <span
            v-if="locked"
            class="inline-flex items-center gap-1.5 rounded-pill bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary"
          >
            <UiIcon name="check" size="h-4 w-4" />
            Draw locked
          </span>

          <button
            v-if="canUnlock"
            type="button"
            :disabled="locking"
            class="rounded-lg border border-border-strong px-3 py-2 text-sm text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
            @click="emit('set-locked', false)"
          >
            {{ locking ? 'Unlocking…' : 'Unlock' }}
          </button>
        </div>
      </div>

      <!-- Why the button is off, rather than letting the click fail. -->
      <p v-if="generateBlockedReason && !locked" class="text-sm text-warning">
        {{ generateBlockedReason }}
      </p>
      <p v-if="locked && hasResults" class="text-sm text-fg-muted">
        Results have been recorded, so this draw can no longer be reopened.
      </p>
    </div>
    <p v-if="generateError" role="alert" class="text-sm text-danger">{{ generateError }}</p>
    <p v-if="lifecycleError" role="alert" class="text-sm text-danger">{{ lifecycleError }}</p>

    <!-- A player, before the organiser has published anything. -->
    <div v-if="!canManage && !locked" class="rounded-lg bg-surface-2 px-4 py-3">
      <p class="text-sm font-medium text-fg">The organiser is still finalising the draw.</p>
      <p class="mt-0.5 text-xs text-fg-muted">
        You can see who has entered on the Players tab. The draw appears here once it is locked.
      </p>
    </div>

    <div v-if="pending" class="scroll-x flex gap-6 py-4">
      <div v-for="i in 3" :key="i" class="h-72 w-48 animate-pulse rounded-xl bg-surface-2" />
    </div>

    <div v-else-if="error" class="rounded-lg bg-danger/10 p-4 text-center">
      <p class="text-danger">Could not load the bracket.</p>
    </div>

    <template v-else-if="displayed">
      <!-- A placeholder draw, when there is no real one. Rendered through
           exactly the same components, so the shape on screen now is the shape
           that will be generated. -->
      <div v-if="isPreview" class="rounded-lg bg-surface-2 px-4 py-3">
        <p class="text-sm font-medium text-fg">
          Placeholder draw · {{ previewSize }} slots
          <span class="font-normal text-fg-muted">
            — {{ seedPreview.length }} {{ seedPreview.length === 1 ? 'entrant' : 'entrants' }} so
            far, the rest TBD
          </span>
        </p>
        <p class="mt-0.5 text-xs text-fg-muted">{{ PREVIEW_ORDER_NOTE }}</p>
      </div>

      <div class="space-y-8">
        <section v-for="entry in phases" :key="entry.phase">
          <h3 v-if="showPhaseHeadings" class="mb-3 text-sm font-semibold text-fg">
            {{ PHASE_LABELS[entry.phase] }}
          </h3>

          <!-- Pools are parallel round robins. A table is how a round robin is
             read; a tree would draw lines between fixtures that feed nothing. -->
          <template v-if="entry.phase === 'pools'">
            <TournamentBracketGroupTables
              :bracket="displayed"
              :confirmed="seedPreview"
              show-qualifiers
              @select="(id) => emit('select-player', id)"
            />
            <details class="mt-3">
              <summary class="cursor-pointer text-sm text-fg-muted hover:text-fg">
                Pool fixtures
              </summary>
              <div class="mt-3 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                <div
                  v-for="round in entry.rounds"
                  :key="round.round"
                  class="rounded-xl bg-canvas p-4"
                >
                  <h4 class="mb-3 text-sm font-semibold text-fg">{{ roundLabel(round.round) }}</h4>
                  <div class="space-y-3">
                    <BracketMatchCard
                      v-for="match in round.matches"
                      :key="match.id"
                      :match="match"
                      :status-config="matchStatusConfig"
                    />
                  </div>
                </div>
              </div>
            </details>
          </template>

          <!-- A pure round robin: one table, then the fixtures in playing order.
             The rounds are a schedule, not a progression. -->
          <template v-else-if="isRoundRobin">
            <TournamentBracketGroupTables
              :bracket="displayed"
              :confirmed="seedPreview"
              @select="(id) => emit('select-player', id)"
            />
            <div class="mt-4 space-y-4">
              <div v-for="round in entry.rounds" :key="round.round">
                <h4 class="mb-2 text-sm font-medium text-fg-secondary">
                  {{ roundLabel(round.round) }}
                </h4>
                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <BracketMatchCard
                    v-for="match in round.matches"
                    :key="match.id"
                    :match="match"
                    :status-config="matchStatusConfig"
                  />
                </div>
              </div>
            </div>
          </template>

          <!-- Every knockout phase, drawn as a draw. -->
          <TournamentBracketTree
            v-else
            :rounds="entry.rounds"
            :status-config="matchStatusConfig"
            :champion="champion"
            :show-champion="entry.phase === decidingPhase"
          />

          <p v-if="entry.phase === 'losers'" class="mt-2 text-xs text-fg-muted">
            Losers are placed by the organiser — this draw is not routed automatically yet.
          </p>
        </section>
      </div>

      <!-- The entrants as a list, still available under the placeholder: the
           draw shows where they sit, this shows who they are and how they rate. -->
      <details v-if="isPreview && seedPreview.length" class="rounded-xl bg-canvas p-4">
        <summary class="cursor-pointer text-sm text-fg-muted hover:text-fg">
          {{ seedPreview.length }} confirmed
          {{ seedPreview.length === 1 ? 'entrant' : 'entrants' }}, in registration order
        </summary>
        <ol class="mt-3 space-y-1.5">
          <li
            v-for="(reg, index) in seedPreview"
            :key="reg.id"
            class="flex items-center gap-3 text-sm"
          >
            <span class="w-6 shrink-0 text-right text-xs tabular-nums text-fg-muted">
              {{ index + 1 }}
            </span>
            <span class="min-w-0 flex-1 truncate text-fg">{{ partnerLine(reg) }}</span>
            <UiRatingBadge
              v-if="reg.rating != null"
              :rating="reg.rating"
              size="sm"
              :show-tier="false"
            />
            <span v-else class="text-xs text-fg-muted">Unrated</span>
          </li>
        </ol>
      </details>
    </template>

    <p v-else class="rounded-lg bg-canvas p-4 text-sm text-fg-muted">
      No bracket yet, and nobody is confirmed into this category — so there is not even a shape to
      show. Two confirmed registrations are needed before one can be drawn.
    </p>
  </div>
</template>
