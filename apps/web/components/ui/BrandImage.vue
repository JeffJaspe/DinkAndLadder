<script setup lang="ts">
import { DAL_LOGO_DARK, DAL_LOGO_LIGHT, DAL_MARK_DARK, DAL_MARK_LIGHT } from '~/utils/brand-assets'

/**
 * The brand artwork, drawn for whichever theme is active.
 *
 * Both the light and the dark file are rendered and the document's `dark` class
 * picks one. That is why this exists rather than an `:src` bound to the theme
 * composable: the correct drawing is painted before hydration (the theme is
 * applied by the pre-hydration script in nuxt.config), and it follows the app's
 * own toggle, which the `-auto` SVGs cannot do — they only read the OS setting.
 */
const props = withDefaults(
  defineProps<{
    /** `mark` is the DAL monogram, `logo` adds the wordmark. */
    variant?: 'mark' | 'logo'
    /**
     * `auto` follows the app theme. Force `dark` (white letters) or `light`
     * (charcoal letters) when the ground is a fixed colour that does not flip
     * with the theme — a brand-coloured tile, or the charcoal cover art.
     */
    theme?: 'auto' | 'dark' | 'light'
    /**
     * Alt text. Empty by default: this is almost always shown beside the name
     * it stands for, so announcing it again would be noise. Pass a value only
     * where the image is the only thing identifying the entity.
     */
    alt?: string
    /** Sizing, e.g. `h-full w-full`. */
    imgClass?: string
  }>(),
  { variant: 'mark', theme: 'auto', alt: '', imgClass: 'h-full w-full' }
)

const light = computed(() => (props.variant === 'logo' ? DAL_LOGO_LIGHT : DAL_MARK_LIGHT))
const dark = computed(() => (props.variant === 'logo' ? DAL_LOGO_DARK : DAL_MARK_DARK))
</script>

<template>
  <!-- Forced to one theme: a single image, and no `dark:` switching. -->
  <img
    v-if="theme !== 'auto'"
    :src="theme === 'dark' ? dark : light"
    :alt="alt"
    :aria-hidden="alt ? undefined : 'true'"
    class="object-contain"
    :class="imgClass"
  />
  <span v-else class="contents">
    <img
      :src="light"
      :alt="alt"
      :aria-hidden="alt ? undefined : 'true'"
      class="object-contain dark:hidden"
      :class="imgClass"
    />
    <img
      :src="dark"
      alt=""
      aria-hidden="true"
      class="hidden object-contain dark:block"
      :class="imgClass"
    />
  </span>
</template>
