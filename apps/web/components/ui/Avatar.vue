<script setup lang="ts">
import { USE_BRAND_DEFAULT_AVATARS } from '~/utils/brand-assets'
import { avatarIdentity } from '~/utils/avatar-identity'
import { initialsFor } from '~/utils/initials'
/**
 * Player / club avatar.
 *
 * Almost every list row, card and header in the mockups leads with an avatar,
 * and most real profiles have no photo — so the fallback is the common case,
 * not the edge case. It is now the Dink and Ladder mark rather than tinted
 * initials, so a photoless profile reads as part of the platform.
 *
 * A player's uploaded photo wins when there is one (USE_BRAND_DEFAULT_AVATARS,
 * now off). Identity mode below is the fallback, and the mark is the last
 * resort for a caller that passes neither.
 *
 * IDENTITY MODE. Pass `identity-key` (a player id) and a photoless avatar
 * becomes that player's initials on a gradient generated from the key instead
 * of the mark. The mark is right on a profile header, where there is one of
 * them; it is wrong in a bracket, which showed sixteen of the same logo, and in
 * a queue, which showed eight. An avatar that cannot tell two people apart is
 * weight without information.
 *
 * Opt-in rather than the default, so the club and event usages keep the mark —
 * a gradient of a club's initials would claim a brand the club did not choose.
 * See utils/avatar-identity.ts for why the colour is generated in OKLCH and how
 * the initials stay above AA on every hue.
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
    /**
     * A player id. Present and photoless ⇒ initials on that player's own
     * gradient. Absent ⇒ the brand mark, exactly as before.
     */
    identityKey?: string | null
  }>(),
  {
    name: null,
    src: null,
    size: 'md',
    shape: 'circle',
    highlighted: false,
    identityKey: null
  }
)

const SIZES = {
  xs: 'h-6 w-6 text-caption',
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
const showImage = computed(() => !USE_BRAND_DEFAULT_AVATARS && Boolean(props.src) && !failed.value)

/** Only when there is a key and no photo to show instead. */
const identity = computed(() =>
  !showImage.value && props.identityKey ? avatarIdentity(props.identityKey) : null
)
/**
 * One letter at xs, two above it.
 *
 * A 24px circle fits two initials only by dropping below the type ramp's 12px
 * floor, which is what the old `text-[10px]` here was doing. One letter at
 * 12px is legible; two at 10px is a smudge at the size a bracket slot uses.
 */
const initials = computed(() => initialsFor(props.name, props.size === 'xs' ? 1 : 2))
</script>

<template>
  <div
    class="relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold"
    :class="[
      SIZES[size],
      shape === 'square' ? 'rounded-2xl' : 'rounded-full',
      'bg-surface-2',
      // Padding is the mark's breathing room. The gradient is a fill and wants
      // the whole circle, so identity mode opts out of it.
      showImage || identity ? '' : PADDING[size],
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
    <!-- Decorative in every branch: the name is always rendered as text beside
         the avatar wherever this is used, so announcing it again is noise. -->
    <span
      v-else-if="identity"
      class="flex h-full w-full items-center justify-center leading-none tracking-tight"
      :style="{ backgroundImage: identity.gradient, color: identity.ink }"
      aria-hidden="true"
      >{{ initials }}</span
    >
    <UiBrandImage v-else />
  </div>
</template>
