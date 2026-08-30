<script setup lang="ts">
/**
 * The public landing page and nothing else.
 *
 * `pages/index.vue` renders its own fixed marketing header, its own mobile nav
 * panel and its own footer. Under `layouts/default.vue` a signed-in visitor got
 * all of that *plus* the app sidebar and bottom tab bar — two headers, two navs,
 * and a `lg:pl-52` offset shoving the hero sideways. Signed-in visitors are now
 * redirected away by `middleware/guest-only.global.ts`; this layout makes sure
 * the page is chromeless even if they arrive some other way.
 */
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <slot />
    <UiToaster />
  </div>
</template>
