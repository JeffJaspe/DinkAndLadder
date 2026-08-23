<script setup lang="ts">
/**
 * Player / club avatar with an initials fallback.
 *
 * Almost every list row, card and header in the mockups leads with an avatar,
 * and most real profiles have no photo — so the fallback is the common case,
 * not the edge case. Initials are tinted by a hash of the name so a list of
 * people is visually separable rather than a column of identical grey circles.
 */

const props = withDefaults(
  defineProps<{
    name?: string | null
    src?: string | null
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    /** `square` gives the rounded-square treatment the podium uses. */
    shape?: 'circle' | 'square'
    /** Ring in the brand colour — used for the podium and "this is you" rows. */
    highlighted?: boolean
  }>(),
  { name: null, src: null, size: 'md', shape: 'circle', highlighted: false }
)

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl'
} as const

/** First letters of the first two words: "Juan Dela Cruz" -> "JD". */
const initials = computed(() => {
  const parts = (props.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
})

/**
 * Deterministic tint per name. Only tokenised fills are used, so the palette
 * still flips with the theme — a random hex here would have re-introduced
 * exactly the problem Phase 2 removed.
 *
 * The *background* carries the identity; the initials are always `text-fg`.
 * Tinting the letters too was the obvious-looking choice and it failed axe in
 * both themes — `text-primary` on `bg-primary/15` measured 4.13:1 in light and
 * `text-rating-bronze` on its own wash 4.11:1 in dark, because a colour over a
 * weak wash of itself has nowhere near enough separation. `fg` is the one
 * foreground guaranteed to clear AA over any of these.
 */
const TINTS = [
  'bg-primary/15',
  'bg-accent/25',
  'bg-rating-bronze/20',
  'bg-rating-silver/20',
  'bg-rating-gold/20',
  'bg-info/15'
]

const tint = computed(() => {
  const name = props.name ?? ''
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return TINTS[hash % TINTS.length]
})

const failed = ref(false)
const showImage = computed(() => Boolean(props.src) && !failed.value)
</script>

<template>
  <div
    class="relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold"
    :class="[
      SIZES[size],
      shape === 'square' ? 'rounded-2xl' : 'rounded-full',
      showImage ? 'bg-surface-2' : `${tint} text-fg`,
      highlighted ? 'ring-2 ring-primary ring-offset-2 ring-offset-canvas' : ''
    ]"
  >
    <img
      v-if="showImage"
      :src="src!"
      :alt="name ?? ''"
      class="h-full w-full object-cover"
      loading="lazy"
      @error="failed = true"
    />
    <!-- aria-hidden: the name is always rendered as text next to the avatar in
         every place this is used, so announcing initials would just be noise. -->
    <span v-else aria-hidden="true">{{ initials }}</span>
  </div>
</template>
