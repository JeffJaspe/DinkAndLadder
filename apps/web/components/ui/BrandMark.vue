<script setup lang="ts">
/**
 * The platform's mark: the uploaded logo if the SuperAdmin set one, otherwise
 * the monogram tile that has always been there.
 *
 * Extracted because the same pair appears in the sidebar, the mobile header,
 * the drawer, the landing page and the auth screens — copies of the fallback
 * logic would drift the first time one of them changed, and in fact did: the
 * landing header, its drawer and footer, and the login/register/reset screens
 * each hard-coded a "D" tile, so an uploaded logo never reached them.
 *
 * The monogram comes from the platform name rather than a hard-coded "D", so
 * renaming the platform renames its mark too.
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
    /** The landing page's gradient treatment for the monogram tile. */
    gradient?: boolean
  }>(),
  { size: 'md', showName: true, nameClass: 'text-body-2 font-semibold', gradient: false }
)

const monogram = computed(() => appName.value.trim().charAt(0).toUpperCase() || 'D')

const BOX: Record<string, string> = {
  sm: 'h-7 w-7 rounded-lg text-caption',
  md: 'h-8 w-8 rounded-lg text-body-2',
  lg: 'h-9 w-9 rounded-xl text-body-2',
  xl: 'h-12 w-12 rounded-xl text-xl',
  '2xl': 'h-14 w-14 rounded-xl text-2xl'
}

const boxClass = computed(() => BOX[props.size] ?? BOX.md)

const tileClass = computed(() =>
  props.gradient ? 'bg-gradient-to-br from-primary to-primary-hover' : 'bg-primary'
)

// A logo may be any aspect ratio, so it is fitted into the square the monogram
// occupies rather than stretched to it.
const failed = ref(false)
const showLogo = computed(() => !!logoUrl.value && !failed.value)
</script>

<template>
  <span class="flex items-center gap-2">
    <img
      v-if="showLogo"
      :src="logoUrl!"
      :alt="appName"
      class="object-contain"
      :class="boxClass"
      @error="failed = true"
    />
    <span
      v-else
      class="flex items-center justify-center font-bold text-on-primary"
      :class="[boxClass, tileClass]"
      aria-hidden="true"
      >{{ monogram }}</span
    >
    <span v-if="showName" class="text-fg" :class="nameClass">{{ appName }}</span>
  </span>
</template>
