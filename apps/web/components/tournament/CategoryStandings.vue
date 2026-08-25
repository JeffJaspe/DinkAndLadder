<script setup lang="ts">
import type { BracketDto } from '~/server/domains/event/dto/bracket.dto'
import type { TournamentRegistrationWithPlayerDto } from '~/server/domains/event/dto/tournament.dto'
import type { RankingBoardEntry } from '~/components/RankingBoard.vue'
import { computeCategoryStandings } from '~/utils/category-standings'

/**
 * Standings for one category. The ranking rule itself lives in
 * `utils/category-standings.ts` — it is the part anybody would dispute, so it
 * is testable without mounting this.
 */
const props = defineProps<{
  bracket: BracketDto | null
  /** Confirmed entrants, so a player with no result yet still appears at 0–0. */
  confirmed: TournamentRegistrationWithPlayerDto[]
  highlightPlayerId?: string | null
}>()

const emit = defineEmits<{ select: [playerId: string] }>()

const standings = computed(() => computeCategoryStandings(props.bracket, props.confirmed))

const entries = computed<RankingBoardEntry[]>(() =>
  standings.value.map((row) => ({
    rank: row.rank,
    player_id: row.player_id,
    display_name: row.display_name,
    wins: row.wins,
    losses: row.losses,
    matches_played: row.matches_played
  }))
)

const hasResults = computed(() => standings.value.some((row) => row.matches_played > 0))
</script>

<template>
  <div>
    <p v-if="entries.length && !hasResults" class="mb-4 text-sm text-fg-muted">
      No results yet — every entrant is level until the first match is decided.
    </p>
    <RankingBoard
      :entries="entries"
      variant="record"
      :highlight-id="highlightPlayerId ?? null"
      :glow="false"
      :show-podium="hasResults"
      empty-title="No standings yet"
      empty-message="Standings appear once this category has a bracket and a decided match."
      @select="emit('select', $event.player_id)"
    />
  </div>
</template>
