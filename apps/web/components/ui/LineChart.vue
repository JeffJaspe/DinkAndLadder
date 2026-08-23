<script setup lang="ts">
/**
 * Rating Progress (Dashboard) and Rating History (Player Profile).
 *
 * Hand-rolled inline SVG rather than a charting library, per docs/33 §5.8:
 * the mockup's chart is a single smoothed series with no zoom, brush or
 * legend, and a library would add 40–90KB for one shape. Inline SVG also
 * inherits the theme tokens, so it costs nothing to make it theme-aware.
 *
 * Accessibility: a chart is a data black hole for a screen reader, so the same
 * series is also rendered as a visually-hidden `<table>`. That is the whole
 * dataset, not a summary.
 */
import { formatRating } from '~/utils/rating-tiers'

export interface ChartPoint {
  /** ISO date. */
  date: string
  value: number
}

const props = withDefaults(
  defineProps<{
    points: ChartPoint[]
    /** Describes the series, e.g. "Singles rating over the last 30 days". */
    label: string
    height?: number
    /** Copy shown when there is not enough data to draw a line. */
    emptyMessage?: string
  }>(),
  {
    height: 180,
    emptyMessage: 'Play a match to start your rating history'
  }
)

// A viewBox-based coordinate space keeps the SVG responsive: it scales to its
// container instead of needing a resize observer.
const VIEW_W = 600
const PAD = { top: 12, right: 8, bottom: 22, left: 34 }

const sorted = computed(() =>
  [...props.points]
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
)

/** One point cannot make a line, so that is the empty state, not zero points. */
const hasLine = computed(() => sorted.value.length >= 2)

const bounds = computed(() => {
  const values = sorted.value.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat series would divide by zero and a hairline-tight range makes normal
  // variation look like a cliff, so always keep a little breathing room.
  const pad = Math.max((max - min) * 0.15, 0.05)
  return { min: min - pad, max: max + pad }
})

const geometry = computed(() => {
  const h = props.height
  const plotW = VIEW_W - PAD.left - PAD.right
  const plotH = h - PAD.top - PAD.bottom
  const { min, max } = bounds.value
  const span = max - min || 1

  const coords = sorted.value.map((p, i) => {
    const x = PAD.left + (sorted.value.length === 1 ? plotW / 2 : (i / (sorted.value.length - 1)) * plotW)
    const y = PAD.top + plotH - ((p.value - min) / span) * plotH
    return { x, y, ...p }
  })

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')
  const area = coords.length
    ? `${line} L${coords[coords.length - 1]!.x.toFixed(2)},${(PAD.top + plotH).toFixed(2)} L${coords[0]!.x.toFixed(2)},${(PAD.top + plotH).toFixed(2)} Z`
    : ''

  return { coords, line, area, plotH, plotW }
})

/** Three gridlines: floor, middle, ceiling. More is clutter at this size. */
const gridlines = computed(() => {
  const { min, max } = bounds.value
  const plotH = props.height - PAD.top - PAD.bottom
  return [0, 0.5, 1].map((t) => ({
    y: PAD.top + plotH - t * plotH,
    value: min + t * (max - min)
  }))
})

const xLabels = computed(() => {
  const { coords } = geometry.value
  if (coords.length < 2) return []
  const pick = [0, Math.floor(coords.length / 2), coords.length - 1]
  return [...new Set(pick)].map((i) => ({
    x: coords[i]!.x,
    text: new Date(coords[i]!.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }))
})

const hovered = ref<number | null>(null)
const active = computed(() =>
  hovered.value === null ? null : (geometry.value.coords[hovered.value] ?? null)
)

/** Nearest point to the pointer, in viewBox space. */
function onMove(event: MouseEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * VIEW_W
  let best = 0
  let bestDist = Infinity
  geometry.value.coords.forEach((c, i) => {
    const d = Math.abs(c.x - x)
    if (d < bestDist) { bestDist = d; best = i }
  })
  hovered.value = best
}

const trend = computed(() => {
  if (!hasLine.value) return 0
  const first = sorted.value[0]!.value
  const last = sorted.value[sorted.value.length - 1]!.value
  return last - first
})
</script>

<template>
  <figure class="m-0">
    <div v-if="!hasLine" class="flex items-center justify-center rounded-card border border-dashed border-border px-4 text-center" :style="{ height: `${height}px` }">
      <p class="text-body-2 text-fg-muted">{{ emptyMessage }}</p>
    </div>

    <div v-else class="relative">
      <svg
        :viewBox="`0 0 ${VIEW_W} ${height}`"
        class="w-full"
        :style="{ height: `${height}px` }"
        preserveAspectRatio="none"
        role="img"
        :aria-label="label"
        @mousemove="onMove"
        @mouseleave="hovered = null"
      >
        <defs>
          <linearGradient :id="`fill-${label.replace(/\W/g, '')}`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgb(var(--dnl-primary))" stop-opacity="0.22" />
            <stop offset="100%" stop-color="rgb(var(--dnl-primary))" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- Gridlines + y labels -->
        <g>
          <line
            v-for="(g, i) in gridlines"
            :key="`g${i}`"
            :x1="PAD.left"
            :x2="VIEW_W - PAD.right"
            :y1="g.y"
            :y2="g.y"
            stroke="rgb(var(--dnl-border))"
            stroke-width="1"
          />
          <text
            v-for="(g, i) in gridlines"
            :key="`gt${i}`"
            :x="PAD.left - 6"
            :y="g.y + 3"
            text-anchor="end"
            font-size="9"
            fill="rgb(var(--dnl-fg-muted))"
          >{{ g.value.toFixed(2) }}</text>
        </g>

        <path :d="geometry.area" :fill="`url(#fill-${label.replace(/\W/g, '')})`" />
        <path
          :d="geometry.line"
          fill="none"
          stroke="rgb(var(--dnl-primary))"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />

        <!-- X labels -->
        <text
          v-for="(l, i) in xLabels"
          :key="`x${i}`"
          :x="l.x"
          :y="height - 6"
          text-anchor="middle"
          font-size="9"
          fill="rgb(var(--dnl-fg-muted))"
        >{{ l.text }}</text>

        <!-- Hover marker -->
        <g v-if="active">
          <line
            :x1="active.x"
            :x2="active.x"
            :y1="PAD.top"
            :y2="height - PAD.bottom"
            stroke="rgb(var(--dnl-border-strong))"
            stroke-width="1"
            stroke-dasharray="3 3"
          />
          <circle
            :cx="active.x"
            :cy="active.y"
            r="4"
            fill="rgb(var(--dnl-surface))"
            stroke="rgb(var(--dnl-primary))"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        </g>
      </svg>

      <!-- Readout. Positioned above the chart rather than as a floating tooltip
           so it never clips at the container edge and works on touch. -->
      <p class="mt-1 h-4 text-caption text-fg-muted">
        <template v-if="active">
          <span class="font-semibold text-fg">{{ formatRating(active.value) }}</span>
          · {{ new Date(active.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }}
        </template>
        <template v-else>
          {{ sorted.length }} points ·
          <span :class="trend > 0 ? 'text-success' : trend < 0 ? 'text-danger' : ''">
            {{ trend > 0 ? '↑' : trend < 0 ? '↓' : '' }} {{ Math.abs(trend).toFixed(3) }} over the range
          </span>
        </template>
      </p>
    </div>

    <!-- The same series as text. A chart alone is unreadable to a screen
         reader, and a summary would hide the data rather than expose it. -->
    <figcaption class="sr-only">
      <table>
        <caption>{{ label }}</caption>
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Rating</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in sorted" :key="p.date">
            <td>{{ new Date(p.date).toLocaleDateString() }}</td>
            <td>{{ formatRating(p.value) }}</td>
          </tr>
        </tbody>
      </table>
    </figcaption>
  </figure>
</template>
