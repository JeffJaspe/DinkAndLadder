<script setup lang="ts">
/**
 * Picks the point in the landing background that every crop keeps in view.
 *
 * The image is shown whole, uncropped, with a marker the operator drags (or
 * clicks) to where the subject is. The same two values are also exposed as
 * range inputs, which is the keyboard and screen-reader route and doubles as a
 * readout. Both write the same 0..1 fractions the API stores.
 */
const props = defineProps<{
  src: string
  /** 0..1 across the image's width. */
  x: number
  /** 0..1 down the image's height. */
  y: number
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:x': [number]; 'update:y': [number] }>()

const image = ref<HTMLImageElement | null>(null)
const dragging = ref(false)

const markerStyle = computed(() => ({
  left: `${clamp01(props.x) * 100}%`,
  top: `${clamp01(props.y) * 100}%`
}))

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5
}

/** Two decimals: what numeric(3,2) stores, and finer than a pointer can place. */
function round2(value: number): number {
  return Math.round(clamp01(value) * 100) / 100
}

function placeFrom(event: PointerEvent) {
  const el = image.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  emit('update:x', round2((event.clientX - rect.left) / rect.width))
  emit('update:y', round2((event.clientY - rect.top) / rect.height))
}

function onPointerDown(event: PointerEvent) {
  if (props.disabled) return
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  placeFrom(event)
}

function onPointerMove(event: PointerEvent) {
  if (dragging.value) placeFrom(event)
}

function onPointerUp() {
  dragging.value = false
}

function onRange(axis: 'x' | 'y', event: Event) {
  const value = round2(Number((event.target as HTMLInputElement).value))
  if (axis === 'x') emit('update:x', value)
  else emit('update:y', value)
}
</script>

<template>
  <div class="space-y-3">
    <!-- The image's true shape, on the surface it is judged against. -->
    <div
      class="relative inline-block max-w-full select-none touch-none overflow-hidden rounded-card border border-border bg-surface-2"
      :class="disabled ? 'opacity-60' : 'cursor-crosshair'"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <img
        ref="image"
        :src="src"
        alt=""
        draggable="false"
        class="block max-h-64 w-auto max-w-full"
      />
      <!-- Crosshair: a ring that reads on any image, light or dark, plus the
           hairlines so the axes are legible when the ring sits on busy art. -->
      <span
        class="pointer-events-none absolute inset-y-0 w-px bg-white/70 mix-blend-difference"
        :style="{ left: markerStyle.left }"
        aria-hidden="true"
      />
      <span
        class="pointer-events-none absolute inset-x-0 h-px bg-white/70 mix-blend-difference"
        :style="{ top: markerStyle.top }"
        aria-hidden="true"
      />
      <span
        class="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
        :style="markerStyle"
        aria-hidden="true"
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label for="hero-focal-x" class="mb-1 block text-caption text-fg-secondary">
          Horizontal — {{ Math.round(clamp01(x) * 100) }}% from the left
        </label>
        <input
          id="hero-focal-x"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="clamp01(x)"
          :disabled="disabled"
          class="w-full accent-primary"
          @input="onRange('x', $event)"
        />
      </div>
      <div>
        <label for="hero-focal-y" class="mb-1 block text-caption text-fg-secondary">
          Vertical — {{ Math.round(clamp01(y) * 100) }}% from the top
        </label>
        <input
          id="hero-focal-y"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="clamp01(y)"
          :disabled="disabled"
          class="w-full accent-primary"
          @input="onRange('y', $event)"
        />
      </div>
    </div>
  </div>
</template>
