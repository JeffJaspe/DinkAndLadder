<script setup lang="ts">
/**
 * Retired route.
 *
 * Verified clubs were a screen of their own while /clubs was a separate,
 * unlinked directory — two club listings, one of them reachable from the nav
 * and the other not. They are one screen now: /clubs is "Discover Clubs" and
 * carries a Verified-only filter, so this path forwards to it with that filter
 * already applied.
 *
 * Kept as a redirect rather than deleted because the old path was public, sat
 * in the sidebar, and is therefore linkable and bookmarkable.
 *
 * The router resolves `redirect` before this component is ever rendered; the
 * template below only exists so the SFC is a valid component if it somehow is.
 */
definePageMeta({
  redirect: { path: '/clubs', query: { verified: '1' } }
})
</script>

<template>
  <div class="min-h-screen bg-canvas p-6">
    <p class="text-sm text-fg-muted">
      Redirecting to
      <NuxtLink to="/clubs?verified=1" class="text-primary hover:underline">Discover Clubs</NuxtLink
      >…
    </p>
  </div>
</template>
