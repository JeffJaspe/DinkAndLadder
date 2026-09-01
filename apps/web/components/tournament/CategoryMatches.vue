<script setup lang="ts">
import type {
  BracketDto,
  LiveBracketScore,
  RecordBracketResultInput
} from '~/server/domains/event/dto/bracket.dto'

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

const groups = computed(() =>
  (['ready', 'waiting', 'done'] as Bucket[])
    .map((bucket) => ({ bucket, rows: rows.value.filter((r) => r.bucket === bucket) }))
    .filter((group) => group.rows.length)
)

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

    <section v-for="group in groups" :key="group.bucket">
      <h4 class="mb-2 flex items-center gap-2 text-sm font-medium text-fg-secondary">
        <span class="h-2 w-2 shrink-0 rounded-pill" :class="BUCKET_TONES[group.bucket]" />
        {{ HEADINGS[group.bucket] }}
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
