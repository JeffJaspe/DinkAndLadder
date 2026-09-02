<script setup lang="ts">
import type {
  BracketDto,
  LiveBracketScore,
  RecordBracketResultInput
} from '~/server/domains/event/dto/bracket.dto'
import { stageLabels } from '~/utils/bracket-rounds'

/**
 * Every match in the category as one flat list, ordered by what needs doing.
 *
 * The draw answers "who plays the winner of this"; it is a poor place to enter
 * a score, because the card that needs a result is wherever the tree happens to
 * put it and an organiser at a venue is scanning for the next unplayed match,
 * not navigating a diagram. Score entry lived under Schedule, which mixed it
 * with the running order and the standings table.
 *
 * So: playable matches first, then everything still waiting on a feeder, then
 * what is already done. Same `CategoryMatchRow` the Schedule tab uses — this is
 * a different ordering of the same rows, not a second way to record a result.
 */
const props = defineProps<{
  bracket: BracketDto | null
  canManage: boolean
  recordingId: string | null
  recordError: string
}>()

const emit = defineEmits<{
  record: [bracketMatchId: string, input: RecordBracketResultInput]
  start: [bracketMatchId: string]
  score: [bracketMatchId: string, scores: LiveBracketScore[]]
}>()

type Bucket = 'ready' | 'waiting' | 'done'

interface Row {
  match: BracketDto['rounds'][number]['matches'][number]
  round: number
  bucket: Bucket
}

const rows = computed<Row[]>(() => {
  const all = (props.bracket?.rounds ?? []).flatMap((round) =>
    round.matches.map((match) => {
      // A bye is decided by definition; nobody plays it.
      const done = !!match.match_id || match.status === 'completed' || match.status === 'bye'
      const playable =
        !done && !!match.participant1_registration_id && !!match.participant2_registration_id
      return {
        match,
        round: round.round,
        bucket: (done ? 'done' : playable ? 'ready' : 'waiting') as Bucket
      }
    })
  )

  const order: Record<Bucket, number> = { ready: 0, waiting: 1, done: 2 }
  return all.sort(
    (a, b) =>
      order[a.bucket] - order[b.bucket] || a.round - b.round || a.match.position - b.match.position
  )
})

const HEADINGS: Record<Bucket, string> = {
  ready: 'Ready to play',
  waiting: 'Waiting on an earlier match',
  done: 'Played'
}

/**
 * A dot of colour per section.
 *
 * All three headings were the same weight and colour, so "Played · 6" and
 * "Ready to play · 2" were distinguishable only by reading them — the state
 * that matters most on a running draw took the longest to find.
 */
const BUCKET_TONES: Record<Bucket, string> = {
  ready: 'bg-warning-fill',
  waiting: 'bg-border-strong',
  done: 'bg-primary'
}

/**
 * Round names, not round numbers.
 *
 * The Scores panel headed its results FINAL, SEMIFINALS, QUARTERFINALS — the
 * way anybody actually asks about a draw — while this tab piled every result
 * under one "Played". Now that the scores are read here, they are grouped the
 * same way in both places, off the same `stageLabels`.
 */
const stages = computed(() => stageLabels(props.bracket?.rounds ?? []))

interface Group {
  key: string
  bucket: Bucket
  heading: string
  rows: Row[]
}

const groups = computed<Group[]>(() => {
  const list: Group[] = []

  // What is still to play stays ungrouped: an organiser scanning for the next
  // match is asking "what can go on a court now", not which round it is.
  for (const bucket of ['ready', 'waiting'] as const) {
    const bucketRows = rows.value.filter((r) => r.bucket === bucket)
    if (bucketRows.length) {
      list.push({ key: bucket, bucket, heading: HEADINGS[bucket], rows: bucketRows })
    }
  }

  // Played: a section per round, the final first — the last result is the
  // answer to the question a reader opened this for.
  const byRound = new Map<number, Row[]>()
  for (const row of rows.value) {
    if (row.bucket !== 'done') continue
    const bucketRows = byRound.get(row.round) ?? []
    bucketRows.push(row)
    byRound.set(row.round, bucketRows)
  }

  for (const [round, roundRows] of [...byRound.entries()].sort((a, b) => b[0] - a[0])) {
    list.push({
      key: `done-${round}`,
      bucket: 'done',
      heading: stages.value.get(round) ?? `Round ${round}`,
      rows: roundRows
    })
  }

  return list
})

const locked = computed(() => props.bracket?.locked ?? false)
</script>

<template>
  <div class="space-y-6">
    <!-- Results attach to a locked draw only: an unlocked one can still be
         redrawn, which would strand the matches recorded against it. -->
    <div v-if="canManage && !locked && rows.length" class="rounded-lg bg-warning-soft px-4 py-3">
      <p class="text-sm font-medium text-warning">Lock the draw before recording results.</p>
      <p class="mt-0.5 text-xs text-fg-muted">
        An unlocked draw can still be regenerated, which would strand any result entered against it.
        The Lock button is on the Draw tab.
      </p>
    </div>

    <p v-if="recordError" role="alert" class="text-sm text-danger">{{ recordError }}</p>

    <div v-if="!rows.length" class="rounded-lg bg-canvas p-4 text-sm text-fg-muted">
      No matches yet. They appear here as soon as the draw is generated.
    </div>

    <section v-for="group in groups" :key="group.key">
      <h4 class="mb-2 flex items-center gap-2 text-sm font-medium text-fg-secondary">
        <span class="h-2 w-2 shrink-0 rounded-pill" :class="BUCKET_TONES[group.bucket]" />
        <span :class="group.bucket === 'done' ? 'uppercase tracking-wider text-fg-muted' : ''">
          {{ group.heading }}
        </span>
        <span class="font-normal text-fg-muted">· {{ group.rows.length }}</span>
      </h4>
      <div class="space-y-2">
        <TournamentCategoryMatchRow
          v-for="row in group.rows"
          :key="row.match.id"
          :match="row.match"
          :round="row.round"
          :can-manage="canManage && locked"
          :recording="recordingId === row.match.id"
          @record="(id, input) => emit('record', id, input)"
          @start="(id) => emit('start', id)"
          @score="(id, scores) => emit('score', id, scores)"
        />
      </div>
    </section>
  </div>
</template>
