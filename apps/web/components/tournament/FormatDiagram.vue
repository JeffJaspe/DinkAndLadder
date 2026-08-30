<script setup lang="ts">
import type { TournamentFormat } from '~/server/domains/event/dto/tournament.dto'

/**
 * What shape this category will be played in, drawn.
 *
 * The format picker names five formats and describes them in a sentence, which
 * is enough to tell `single_elimination` from `round_robin` but not enough to
 * picture what "round robin into a single elimination" actually produces. An
 * organiser is committing a weekend's schedule to this choice, and Generate is
 * hard to take back once entrants have seen the draw.
 *
 * Inline SVG rather than an image: it is four rectangles and some lines, it
 * inherits the theme tokens through `currentColor`, and it costs no request.
 */
const props = defineProps<{ format: TournamentFormat }>()

const hasPools = computed(
  () =>
    props.format === 'round_robin_single_elimination' ||
    props.format === 'round_robin_double_elimination'
)
const isPureRoundRobin = computed(() => props.format === 'round_robin')
const isDouble = computed(
  () => props.format === 'double_elimination' || props.format === 'round_robin_double_elimination'
)
</script>

<template>
  <svg
    viewBox="0 0 200 92"
    class="h-[92px] w-full max-w-[240px] text-fg-muted"
    role="img"
    :aria-label="`Diagram of the ${format} format`"
    fill="none"
  >
    <!-- A round robin: everyone plays everyone, so it is a grid, not a tree. -->
    <template v-if="isPureRoundRobin">
      <rect
        v-for="i in 16"
        :key="i"
        :x="40 + ((i - 1) % 4) * 30"
        :y="14 + Math.floor((i - 1) / 4) * 18"
        width="24"
        height="12"
        rx="2"
        :class="(i - 1) % 5 === 0 ? 'fill-current opacity-20' : 'fill-current opacity-50'"
      />
    </template>

    <template v-else>
      <!-- Group stage: parallel pools feeding the knockout. -->
      <template v-if="hasPools">
        <rect x="2" y="10" width="34" height="30" rx="3" class="fill-current opacity-25" />
        <rect x="2" y="52" width="34" height="30" rx="3" class="fill-current opacity-25" />
        <path d="M36 25 H52" stroke="currentColor" stroke-width="2" opacity="0.5" />
        <path d="M36 67 H52" stroke="currentColor" stroke-width="2" opacity="0.5" />
      </template>

      <!-- The knockout itself: four, two, one. -->
      <g :transform="hasPools ? 'translate(54 0)' : ''">
        <rect
          v-for="i in 4"
          :key="`r1-${i}`"
          x="0"
          :y="8 + (i - 1) * 22"
          width="34"
          height="12"
          rx="2"
          class="fill-current opacity-50"
        />
        <rect
          v-for="i in 2"
          :key="`r2-${i}`"
          x="52"
          :y="19 + (i - 1) * 44"
          width="34"
          height="12"
          rx="2"
          class="fill-current opacity-50"
        />
        <rect x="104" y="41" width="34" height="12" rx="2" class="fill-current opacity-70" />

        <!-- Connectors, mirroring the real tree's elbows. -->
        <g stroke="currentColor" stroke-width="1.5" opacity="0.4">
          <path d="M34 14 H43 V25 M34 36 H43 V25 M43 25 H52" />
          <path d="M34 58 H43 V69 M34 80 H43 V69 M43 69 H52" />
          <path d="M86 25 H95 V47 M86 69 H95 V47 M95 47 H104" />
        </g>
      </g>

      <!-- Double elimination: a second, lower path back into the final. -->
      <path
        v-if="isDouble"
        :d="hasPools ? 'M56 88 H150 V56' : 'M2 88 H150 V56'"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-dasharray="3 3"
        opacity="0.45"
      />
    </template>
  </svg>
</template>
