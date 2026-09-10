<script setup lang="ts">
import {
  DAL_CHARCOAL,
  DAL_LOGO_DARK,
  DAL_MARK_DARK,
  USE_BRAND_DEFAULTS
} from '~/utils/brand-assets'

/**
 * Cover art for events and clubs.
 *
 * The mockups show photographic covers on the Club Page and image-led Event
 * cards. Most entities have no uploaded cover, so this is what fills that space
 * instead: the Dink and Ladder logo on the brand's charcoal, which is the same
 * treatment the app icons and the social image use, and for the same reason —
 * a solid ground is what the artwork was drawn for.
 *
 * It replaces a gradient-and-monogram derived from the entity's name. That was
 * written when the platform had no artwork of its own; it does now.
 *
 * While USE_BRAND_DEFAULTS is on, uploaded covers are not displayed either.
 */

const props = withDefaults(
  defineProps<{
    /** Drives the gradient and monogram. */
    name: string
    /** Real image once one exists; falls back to generated art if it fails. */
    src?: string | null
    /** `banner` for page headers, `card` for list thumbnails. */
    variant?: 'banner' | 'card'
    /** Shown over the art, e.g. a status pill. */
    rounded?: string
    /**
     * Words to show instead of the monogram, e.g. an event's kind
     * ("TOURNAMENT"). Two initials over a gradient are a placeholder; when the
     * caller has something true to say about the entity, it earns the space.
     */
    label?: string | null
  }>(),
  { src: null, variant: 'card', rounded: 'rounded-card', label: null }
)

const failed = ref(false)
const showImage = computed(() => !USE_BRAND_DEFAULTS && Boolean(props.src) && !failed.value)

const HEIGHT = { banner: 'h-40 sm:h-56', card: 'h-28' } as const
</script>

<template>
  <div
    class="relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden"
    :class="[HEIGHT[variant], rounded]"
    :style="showImage ? undefined : { backgroundColor: DAL_CHARCOAL }"
  >
    <img
      v-if="showImage"
      :src="src!"
      :alt="name"
      class="h-full w-full object-cover"
      loading="lazy"
      @error="failed = true"
    />

    <!-- The ground is always charcoal, so the dark drawing (white letters) is
         correct in both themes and no light/dark pair is needed here.
         Decorative: the entity's name is always real text beside this. -->
    <img
      v-else
      :src="variant === 'banner' ? DAL_LOGO_DARK : DAL_MARK_DARK"
      alt=""
      aria-hidden="true"
      class="max-w-[70%] object-contain"
      :class="variant === 'banner' ? 'h-16 sm:h-20' : 'h-10'"
    />

    <!-- A real label, so unlike the artwork it is not decorative and is read
         out. It is the only thing on the cover saying what this is. -->
    <span
      v-if="label && !showImage"
      class="px-3 text-center font-display font-bold uppercase leading-tight tracking-widest text-on-scrim/90"
      :class="variant === 'banner' ? 'text-body-1' : 'text-caption'"
      >{{ label }}</span
    >

    <slot />
  </div>
</template>
