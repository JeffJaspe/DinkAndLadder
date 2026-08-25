<script setup lang="ts">
import type { BracketDto } from '~/server/domains/event/dto/bracket.dto'
import type { TournamentRegistrationWithPlayerDto } from '~/server/domains/event/dto/tournament.dto'
import { computeStandingsGroups } from '~/utils/category-standings'
import { QUALIFIERS_PER_POOL } from '~/utils/bracket-rounds'

/**
 * The group stage as a set of tables: who is in each pool and how they stand.
 *
 * A pool is played as a round robin, and a round robin is read as a table, not
 * as a tree — the draw view rendered the fixtures and left the organiser to
 * total the wins on paper. The ranking rule lives in
 * `utils/category-standings.ts`, so what this file owns is only the layout.
 */
const props = defineProps<{
  bracket: BracketDto | null
  /** Confirmed entrants, so somebody yet to play still appears at 0–0. */
  confirmed: TournamentRegistrationWithPlayerDto[]
  /**
   * Whether finishing in the top places carries a player into a playoff. False
   * for a plain round robin, where the table IS the result and marking a
   * qualifying line would invent a stage that does not exist.
   */
  showQualifiers?: boolean
  highlightPlayerId?: string | null
}>()

const emit = defineEmits<{ select: [playerId: string] }>()

const groups = computed(() => computeStandingsGroups(props.bracket, props.confirmed))
</script>

<template>
  <div v-if="groups.length" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <section
      v-for="group in groups"
      :key="group.round ?? 'all'"
      class="overflow-hidden rounded-xl bg-canvas"
    >
      <h4 class="bg-accent-soft px-3 py-2 text-center text-sm font-semibold text-on-accent">
        {{ group.label }}
      </h4>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-xs uppercase tracking-wide text-fg-muted">
            <th scope="col" class="px-3 py-1.5 text-left font-medium">Player</th>
            <th scope="col" class="w-8 py-1.5 text-right font-medium">W</th>
            <th scope="col" class="w-8 px-3 py-1.5 text-right font-medium">L</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in group.entries"
            :key="entry.registration_id"
            class="border-t border-border/60"
            :class="[
              entry.player_id === highlightPlayerId ? 'bg-primary-soft' : '',
              // The line under the last qualifying place is the whole reason an
              // organiser reads a pool table mid-event.
              showQualifiers && entry.rank === QUALIFIERS_PER_POOL
                ? 'border-b-2 border-b-primary/50'
                : ''
            ]"
          >
            <td class="px-3 py-1.5">
              <button
                type="button"
                class="flex min-w-0 items-center gap-2 text-left hover:text-primary"
                @click="emit('select', entry.player_id)"
              >
                <span class="w-4 shrink-0 text-xs tabular-nums text-fg-muted">
                  {{ entry.rank }}
                </span>
                <span class="truncate text-fg">{{ entry.display_name }}</span>
              </button>
            </td>
            <td class="py-1.5 text-right tabular-nums text-fg">{{ entry.wins }}</td>
            <td class="px-3 py-1.5 text-right tabular-nums text-fg-secondary">
              {{ entry.losses }}
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="showQualifiers" class="border-t border-border/60 px-3 py-1.5 text-xs text-fg-muted">
        Top {{ QUALIFIERS_PER_POOL }} go through
      </p>
    </section>
  </div>
</template>
