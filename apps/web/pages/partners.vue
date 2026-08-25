<script setup lang="ts">
/**
 * Retired route.
 *
 * Duo partners were a top-level page while Community held every other list of
 * people — and Community's own first tab was called "Partners" too, meaning
 * something else entirely. The whole page now lives under Community's Partners
 * tab (`components/community/DuoPartnersPanel.vue`), and the play-history list
 * that used to hold that name is the Teammates tab beside it.
 *
 * Kept as a redirect rather than deleted because the old path sat in the
 * sidebar and is therefore bookmarkable.
 *
 * The router resolves `redirect` before this component is ever rendered; the
 * template below only exists so the SFC is a valid component if it somehow is.
 */
definePageMeta({
  redirect: { path: '/community', query: { tab: 'partners' } }
})
</script>

<template>
  <div class="min-h-screen bg-canvas p-6">
    <p class="text-sm text-fg-muted">
      Redirecting to
      <NuxtLink to="/community?tab=partners" class="text-primary hover:underline"
        >Community · Partners</NuxtLink
      >…
    </p>
  </div>
</template>
