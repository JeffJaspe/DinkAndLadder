<script setup lang="ts">
import type { BracketMatchDto, BracketParticipantDto } from '~/server/domains/event/dto/bracket.dto'

/**
 * One slot in a bracket. Extracted so the pool grid and the knockout rail
 * render identical cards — they previously duplicated this markup, which is how
 * the two views drifted apart.
 *
 * The set scores are rendered here rather than only in the schedule row. A draw
 * that names a winner but not a score answers "who is through" and nothing
 * else; the number is the thing people crowd round the sheet to read, and it
 * has been on `BracketMatchDto.scores` — oriented to these two slots by the
 * server — the whole time.
 */
const props = defineProps<{
  match: BracketMatchDto
  statusConfig: Record<string, { bg: string; border: string }>
  /**
   * Compact form for the connector-line tree, where a card is one node in a
   * column and vertical rhythm has to stay predictable: the status line is
   * dropped and the rows tighten.
   */
  dense?: boolean
}>()

/**
 * A slot is one of three things: an entrant, a slot whose feeder has not
 * finished, or — in a doubles category — a pair. `getBracket` hydrates the
 * names; before that this card rendered `registration_id.slice(0, 8)`, so a
 * bracket was eight hex characters against eight other hex characters.
 */
interface Slot {
  participant: BracketParticipantDto | null
  isWinner: boolean
  /** This slot's column of the score line, already oriented by the server. */
  setScores: number[]
}

const orderedScores = computed(() =>
  [...props.match.scores].sort((a, b) => a.set_number - b.set_number)
)

/**
 * Whether this match has a result yet. A bye is not a contest, so it is not
 * marked W/L — nobody beat anybody.
 */
const isDecided = computed(
  () => !!props.match.winner_registration_id && props.match.status !== 'bye'
)

function slot(
  participant: BracketParticipantDto | null,
  registrationId: string | null,
  side: 1 | 2
): Slot {
  return {
    participant,
    isWinner: Boolean(registrationId) && props.match.winner_registration_id === registrationId,
    setScores: orderedScores.value.map((set) =>
      side === 1 ? set.participant1_score : set.participant2_score
    )
  }
}

const slot1 = computed(() =>
  slot(props.match.participant1, props.match.participant1_registration_id, 1)
)
const slot2 = computed(() =>
  slot(props.match.participant2, props.match.participant2_registration_id, 2)
)

const rows = computed(() =>
  props.match.status === 'bye' ? [slot1.value] : [slot1.value, slot2.value]
)

/**
 * The rating badge and the score columns compete for the same strip of card,
 * and on a tree node there is not room for both. Once a match has been played
 * the score is the more useful of the two, so the badge stands down.
 */
const showRatings = computed(() => !orderedScores.value.length)
</script>

<template>
  <div
    class="rounded-lg border"
    :class="[
      statusConfig[match.status]?.bg,
      statusConfig[match.status]?.border,
      dense ? 'p-2' : 'p-3'
    ]"
  >
    <div v-for="(entry, index) in rows" :key="index">
      <!-- The separator sits between the two rows, never above the first. -->
      <div v-if="index > 0 && !dense" class="my-1 text-center text-xs text-fg-muted">vs</div>
      <div v-else-if="index > 0" class="h-1" />

      <div
        class="flex items-center gap-2 rounded-md px-2 py-1"
        :class="entry.isWinner ? 'bg-primary/20' : 'bg-canvas'"
      >
        <span class="min-w-0 flex-1">
          <span
            class="block truncate text-sm"
            :class="entry.isWinner ? 'font-semibold text-fg' : 'font-medium text-fg'"
          >
            {{ entry.participant?.display_name ?? 'TBD' }}
          </span>
          <span
            v-if="entry.participant?.partner_display_name"
            class="block truncate text-xs text-fg-muted"
          >
            with {{ entry.participant.partner_display_name }}
          </span>
        </span>

        <!-- One column per set, so the two rows line up as a readable
             11-9 / 8-11 / 11-6 grid rather than a sentence. -->
        <span
          v-for="(score, setIndex) in entry.setScores"
          :key="setIndex"
          class="w-6 shrink-0 text-right text-sm tabular-nums"
          :class="entry.isWinner ? 'font-semibold text-fg' : 'text-fg-secondary'"
        >
          {{ score }}
        </span>

        <UiRatingBadge
          v-if="showRatings && entry.participant?.rating != null"
          :rating="entry.participant.rating"
          size="sm"
          :show-tier="false"
        />
        <!--
          W and L, both of them, in a fixed-width cell.

          Only the winner was marked before, so the two rows ended at different
          widths and the score columns above them did not line up between the
          rows of a match — the reported misalignment. A decided match now marks
          both sides; an undecided one marks neither and keeps the same space.
        -->
        <span
          v-if="isDecided"
          class="w-5 shrink-0 rounded-badge text-center text-xs font-bold"
          :class="entry.isWinner ? 'bg-primary text-on-primary' : 'bg-danger-soft text-danger'"
        >
          {{ entry.isWinner ? 'W' : 'L' }}
        </span>
        <span v-else class="w-5 shrink-0" aria-hidden="true" />
      </div>
    </div>

    <!-- A bye has no opponent, so "vs TBD" would misrepresent it. -->
    <div
      v-if="match.status === 'bye'"
      class="mt-1 text-center text-xs italic text-fg-muted"
      :class="dense ? '' : 'my-1'"
    >
      advances on a bye
    </div>

    <div v-if="!dense" class="mt-2 text-center">
      <span class="text-xs capitalize text-fg-muted">{{ match.status.replace('_', ' ') }}</span>
    </div>
  </div>
</template>
