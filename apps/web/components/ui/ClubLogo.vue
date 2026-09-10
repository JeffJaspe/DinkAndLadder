<script setup lang="ts">
import { USE_BRAND_DEFAULTS } from '~/utils/brand-assets'

/**
 * A club's logo tile.
 *
 * Clubs without a logo used to render a one-letter initials tile, written out
 * four separate times with four different treatments. The fallback is now the
 * platform mark, so an unbranded club reads as part of Dink and Ladder rather
 * than as a missing image.
 *
 * While USE_BRAND_DEFAULTS is on, uploaded logos are not displayed either — see
 * that flag for why, and for how to bring them back.
 */
const props = withDefaults(
  defineProps<{
    /** Used for the alt text on an uploaded logo. */
    name: string
    /** The club's `logo_url`, when it has one. */
    src?: string | null
    /** Size and shape of the tile, e.g. `h-14 w-14 rounded-card`. */
    boxClass?: string
    /** Extra classes for the tile, e.g. the overlap and border on a header. */
    tileClass?: string
  }>(),
  { src: null, boxClass: 'h-14 w-14 rounded-card', tileClass: '' }
)

// An upload can 404 (deleted object, expired signed URL); the mark is the
// fallback for that too rather than a broken-image icon.
const failed = ref(false)
watch(
  () => props.src,
  () => {
    failed.value = false
  }
)
const showUploaded = computed(() => !USE_BRAND_DEFAULTS && !!props.src && !failed.value)
</script>

<template>
  <img
    v-if="showUploaded"
    :src="src!"
    :alt="`${name} logo`"
    class="flex-shrink-0 object-cover"
    :class="[boxClass, tileClass]"
    @error="failed = true"
  />
  <span
    v-else
    class="flex flex-shrink-0 items-center justify-center bg-surface-2 p-1.5"
    :class="[boxClass, tileClass]"
  >
    <UiBrandImage :alt="`${name} logo`" />
  </span>
</template>
