<script setup lang="ts">
import type { PlayerLine } from '~/utils/player-line'
import type { GameRules, GameScore } from '~/utils/game-rules'

/**
 * Every match on one panel, grouped the way a draw is read.
 *
 * Live scores existed only inside a category, so a spectator watching the whole
 * tournament had nowhere to look — they had to open each category in turn and
 * hold the picture in their head. This sits below the event header and
 * aggregates across every category.
 *
 * It used to draw one wide table per group: two rows per match, a column per
 * game, names stacked in a MATCH column. That reads at a desk and not at all on
 * a phone, and it gave a finished match from three hours ago exactly as much
 * room as the one being played. Each match is now a card that collapses to a
 * line and opens to the score sheet it was entered on (MatchCard), which is the
 * same shape the draw uses — one result, one rendering, everywhere.
 *
 * Read-only by construction: it takes no callbacks and emits nothing. The
 * scoring rules come from `utils/game-rules.ts`, the same module the entry
 * sheet uses, so a result reads identically wherever it appears.
 */
export interface BoxScoreMatch {
  id: string
  /** Players per side, one name per line. */
  teams: [PlayerLine[], PlayerLine[]]
  games: GameScore[]
  /** Category, round, court — whatever places this match. */
  context?: string | null
  /**
   * Which group this match belongs to, e.g. "Round 2" or "On court".
   *
   * A tournament is read a round at a time — "who is still in after the
   * quarters" is one question, not eight — so matches sharing a group sit under
   * one heading. Matches with no group fall together into a single unheaded
   * run, which is what a plain open-play event gets.
   */
  group?: string | null
  /**
   * The recorded winner, when the source knows one.
   *
   * Deriving the winner from the games alone is wrong more often than it looks:
   * `seriesWinner` applies win-by-two, so a game recorded 11-10 — which is what
   * a house rule of "first to 11" produces — has no winner, and a match of them
   * has no winner either. That is how a row could read FINAL with no ✓ against
   * anybody. Where the result was actually recorded (a match with a won/lost
   * participant, a bracket slot with a winner) that answer wins; the derived
   * one is the fallback for a live or unrecorded score.
   */
  winner?: 1 | 2 | null
  /** Which game is being played right now, 1-based. Null when not live. */
  liveGame?: number | null
  complete?: boolean
  /** Shown beside the state when a match did not play out. */
  resultNote?: string | null
  rules?: GameRules
}

const props = defineProps<{ matches: BoxScoreMatch[] }>()

/**
 * The matches split into groups, in the order they were handed over.
 *
 * Insertion order rather than a sort: the caller knows whether the live round
 * belongs above the finished ones, and re-sorting here would fight it.
 */
const groups = computed(() => {
  const byLabel = new Map<string, BoxScoreMatch[]>()
  for (const match of props.matches) {
    const label = match.group ?? ''
    const bucket = byLabel.get(label)
    if (bucket) bucket.push(match)
    else byLabel.set(label, [match])
  }
  return [...byLabel.entries()].map(([label, matches]) => ({ label, matches }))
})

/** A group is live when any match in it is being played right now. */
function groupIsLive(matches: BoxScoreMatch[]): boolean {
  return matches.some((match) => match.liveGame != null)
}
</script>

<template>
  <div v-if="matches.length" class="space-y-5">
    <section v-for="bucket in groups" :key="bucket.label || 'all'" class="space-y-2">
      <!-- The heading says which round these are; the LIVE chip beside it means
           the round being played is findable without opening a single card. -->
      <h4 v-if="bucket.label" class="flex items-center gap-2 px-0.5">
        <span class="text-caption font-semibold uppercase tracking-wider text-fg-muted">
          {{ bucket.label }}
        </span>
        <span
          v-if="groupIsLive(bucket.matches)"
          class="inline-flex items-center gap-1.5 rounded-pill bg-danger-soft px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-danger"
        >
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
          Live
        </span>
      </h4>

      <!-- Extra vertical room between cards where one of them glows, so the
           halo has somewhere to fall. -->
      <div :class="groupIsLive(bucket.matches) ? 'space-y-3' : 'space-y-2'">
        <MatchCard v-for="match in bucket.matches" :key="match.id" :match="match" />
      </div>
    </section>
  </div>
</template>
