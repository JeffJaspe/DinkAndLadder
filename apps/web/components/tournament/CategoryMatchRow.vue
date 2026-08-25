<script setup lang="ts">
import type {
  BracketMatchDto,
  RecordBracketResultInput
} from '~/server/domains/event/dto/bracket.dto'
import { participantLabel } from '~/utils/bracket-schedule'
import { roundLabel } from '~/utils/bracket-rounds'

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
  recording?: boolean
  recordError?: string
}>()

const emit = defineEmits<{
  record: [bracketMatchId: string, input: RecordBracketResultInput]
}>()

const expanded = ref(false)

const side1 = computed(() => participantLabel(props.match, 1))
const side2 = computed(() => participantLabel(props.match, 2))

const isBye = computed(() => props.match.status === 'bye')
const isDone = computed(() => props.match.status === 'completed')
const onCourt = computed(() => props.match.status === 'in_progress')

/** Both slots filled and nothing recorded yet — the only state worth a form. */
const canRecord = computed(
  () =>
    props.canManage &&
    !props.match.match_id &&
    !!props.match.participant1_registration_id &&
    !!props.match.participant2_registration_id &&
    !isBye.value
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

const statusLabel = computed(() => {
  if (isBye.value) return 'Bye'
  if (onCourt.value) return 'On court'
  if (isDone.value) return 'Completed'
  if (props.match.status === 'ready') return 'Ready to start'
  return 'Waiting on an earlier result'
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
  <li class="rounded-lg" :class="onCourt ? 'bg-primary/10' : 'bg-canvas'">
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

      <span v-if="onCourt" class="rounded-pill bg-primary/20 px-2 py-0.5 text-xs text-primary">
        On court
      </span>

      <UiIcon
        :name="expanded ? 'chevron-up' : 'chevron-down'"
        size="h-4 w-4"
        class="shrink-0 text-fg-muted"
      />
    </button>

    <div v-if="expanded" class="space-y-3 border-t border-border-strong/40 px-3 pb-3 pt-3">
      <p class="text-xs text-fg-muted">{{ roundLabel(round) }} · {{ statusLabel }}</p>

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
