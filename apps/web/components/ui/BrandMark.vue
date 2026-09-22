<script setup lang="ts">
import { USE_BRAND_DEFAULTS } from '~/utils/brand-assets'
/**
 * The platform's mark: the uploaded logo if the SuperAdmin set one, otherwise
 * the Dink and Ladder mark.
 *
 * The fallback used to be a monogram tile built from the platform name. Real
 * artwork exists now (assets/dal-assets), so the tile is gone — and while
 * USE_BRAND_DEFAULTS is on, the uploaded logo is not displayed either and every
 * surface shows the mark.
 *
 * Extracted because the same pair appears in the sidebar, the mobile header,
 * the drawer, the landing page and the auth screens — copies of the fallback
 * logic would drift the first time one of them changed, and in fact did: the
 * landing header, its drawer and footer, and the login/register/reset screens
 * each hard-coded a "D" tile, so an uploaded logo never reached them.
 *
 */
const { appName, logoUrl } = useBranding()

const props = withDefaults(
  defineProps<{
    /**
     * `sm` mobile header, `md` sidebar/drawer, `lg` landing header,
     * `xl` the auth screens' centred mark, `2xl` onboarding.
     */
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    /** Renders the platform name beside the mark. */
    showName?: boolean
    /** Typography for that name, so each surface keeps its own scale. */
    nameClass?: string
  }>(),
  { size: 'md', showName: true, nameClass: 'text-body-2 font-semibold' }
)

const BOX: Record<string, string> = {
  sm: 'h-7 w-7 rounded-lg text-caption',
  md: 'h-8 w-8 rounded-lg text-body-2',
  lg: 'h-9 w-9 rounded-xl text-body-2',
  xl: 'h-12 w-12 rounded-xl text-xl',
  '2xl': 'h-14 w-14 rounded-xl text-2xl'
}

const boxClass = computed(() => BOX[props.size] ?? BOX.md)

// A logo may be any aspect ratio, so it is fitted into the square the mark
// occupies rather than stretched to it.
const failed = ref(false)
const showLogo = computed(() => !USE_BRAND_DEFAULTS && !!logoUrl.value && !failed.value)
</script>

<template>
  <span class="flex items-center gap-2" role="img" :aria-label="showName ? undefined : appName">
    <img
      v-if="showLogo"
      :src="logoUrl!"
      :alt="showName ? '' : appName"
      :aria-hidden="showName ? 'true' : undefined"
      class="object-contain"
      :class="boxClass"
      @error="failed = true"
    />
    <span v-else class="flex items-center justify-center" :class="boxClass" :aria-hidden="showName ? 'true' : undefined">
      <UiBrandImage :alt="showName ? '' : appName" />
    </span>
    <span v-if="showName" class="text-fg" :class="nameClass">{{ appName }}</span>
  </span>
</template>
