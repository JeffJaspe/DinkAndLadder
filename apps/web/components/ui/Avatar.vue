<script setup lang="ts">
import { USE_BRAND_DEFAULTS } from '~/utils/brand-assets'
/**
 * Player / club avatar.
 *
 * Almost every list row, card and header in the mockups leads with an avatar,
 * and most real profiles have no photo — so the fallback is the common case,
 * not the edge case. It is now the Dink and Ladder mark rather than tinted
 * initials, so a photoless profile reads as part of the platform.
 *
 * While USE_BRAND_DEFAULTS is on, uploaded photos are not displayed either and
 * every avatar is the mark.
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

/**
 * The mark needs breathing room inside a circle, and the amount that reads as
 * deliberate rather than cramped does not scale linearly with the box.
 */
const PADDING = {
  xs: 'p-1',
  sm: 'p-1.5',
  md: 'p-2',
  lg: 'p-3',
  xl: 'p-5'
} as const

const failed = ref(false)
const showImage = computed(() => !USE_BRAND_DEFAULTS && Boolean(props.src) && !failed.value)
</script>

<template>
  <div
    class="relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold"
    :class="[
      SIZES[size],
      shape === 'square' ? 'rounded-2xl' : 'rounded-full',
      'bg-surface-2',
      showImage ? '' : PADDING[size],
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
    <!-- No alt: the name is always rendered as text next to the avatar in every
         place this is used, so announcing it again would just be noise. -->
    <UiBrandImage v-else />
  </div>
</template>
