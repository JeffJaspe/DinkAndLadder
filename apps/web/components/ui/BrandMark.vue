<script setup lang="ts">
/**
 * The platform's mark: the uploaded logo if the SuperAdmin set one, otherwise
 * the monogram tile that has always been there.
 *
 * Extracted because the same pair appears in the sidebar, the mobile header and
 * the drawer — three copies of the fallback logic would drift the first time
 * one of them changed.
 *
 * The monogram comes from the platform name rather than a hard-coded "D", so
 * renaming the platform renames its mark too.
 */
const { appName, logoUrl } = useBranding()

withDefaults(
  defineProps<{
    /** `sm` for the mobile header, `md` everywhere else. */
    size?: 'sm' | 'md'
    /** Renders the platform name beside the mark. */
    showName?: boolean
  }>(),
  { size: 'md', showName: true }
)

const monogram = computed(() => appName.value.trim().charAt(0).toUpperCase() || 'D')

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
      class="rounded-lg object-contain"
      :class="size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'"
      @error="failed = true"
    />
    <span
      v-else
      class="flex items-center justify-center rounded-lg bg-primary font-bold text-on-primary"
      :class="size === 'sm' ? 'h-7 w-7 text-caption' : 'h-8 w-8 text-body-2'"
      aria-hidden="true"
      >{{ monogram }}</span
    >
    <span v-if="showName" class="text-body-2 font-semibold text-fg">{{ appName }}</span>
  </span>
</template>
