<script setup lang="ts">
import type { BracketMatchDto } from '~/server/domains/event/dto/bracket.dto'

/**
 * One slot in a bracket. Extracted so the pool grid and the knockout rail
 * render identical cards — they previously duplicated this markup, which is how
 * the two views drifted apart.
 */
defineProps<{
  match: BracketMatchDto
  statusConfig: Record<string, { bg: string; border: string }>
}>()

/** Registration ids are opaque; show a short prefix until names are joined in. */
function label(registrationId: string | null): string {
  return registrationId ? registrationId.slice(0, 8) : 'TBD'
}
</script>

<template>
  <div
    class="rounded-lg border p-3"
    :class="[statusConfig[match.status]?.bg, statusConfig[match.status]?.border]"
  >
    <div
      class="flex items-center justify-between rounded-md px-2 py-1"
      :class="
        match.winner_registration_id &&
        match.winner_registration_id === match.participant1_registration_id
          ? 'bg-primary/20'
          : 'bg-canvas'
      "
    >
      <span class="truncate text-sm font-medium text-fg">
        {{ label(match.participant1_registration_id) }}
      </span>
      <span
        v-if="
          match.winner_registration_id &&
          match.winner_registration_id === match.participant1_registration_id
        "
        class="text-xs text-primary"
      >
        W
      </span>
    </div>

    <!-- A bye has no opponent, so "vs TBD" would misrepresent it. -->
    <template v-if="match.status !== 'bye'">
      <div class="my-1 text-center text-xs text-fg-muted">vs</div>

      <div
        class="flex items-center justify-between rounded-md px-2 py-1"
        :class="
          match.winner_registration_id &&
          match.winner_registration_id === match.participant2_registration_id
            ? 'bg-primary/20'
            : 'bg-canvas'
        "
      >
        <span class="truncate text-sm font-medium text-fg">
          {{ label(match.participant2_registration_id) }}
        </span>
        <span
          v-if="
            match.winner_registration_id &&
            match.winner_registration_id === match.participant2_registration_id
          "
          class="text-xs text-primary"
        >
          W
        </span>
      </div>
    </template>
    <div v-else class="my-1 text-center text-xs italic text-fg-muted">advances on a bye</div>

    <div class="mt-2 text-center">
      <span class="text-xs capitalize text-fg-muted">{{ match.status.replace('_', ' ') }}</span>
    </div>
  </div>
</template>
