<script setup lang="ts">
/**
 * Document title and favicon.
 *
 * No page set a title, so every route rendered as `localhost:3000/...` in the
 * tab and axe flagged `document-title` on all of them. A title is the first
 * thing a screen reader announces on navigation and the only label a user has
 * when several tabs are open, so this is a real failure rather than a lint nit.
 *
 * `titleTemplate` as a function rather than the `%s` string form: the string
 * form has no way to express "and something sensible when the page sets no
 * title", which is exactly the case that was broken.
 *
 * The platform name comes from branding (docs/30 §2.1), so renaming the
 * platform renames every tab with it. It falls back to the built-in name, which
 * is what every page showed before branding existed.
 */
const { appName, faviconUrl } = useBranding()

useHead({
  titleTemplate: (title?: string) =>
    title ? `${title} · ${appName.value}` : `${appName.value} — Philippine Pickleball Platform`,
  link: computed(() =>
    // Only when one is uploaded: the static /favicon.ico in public/ is the
    // default, and emitting an empty href would break the tab icon entirely.
    faviconUrl.value ? [{ rel: 'icon', href: faviconUrl.value }] : []
  ),
  meta: [
    {
      name: 'description',
      content:
        'Track your pickleball rating, find tournaments, and connect with the Philippine pickleball community.'
    }
  ]
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <!-- Navigation feedback. Pages await their data before rendering, so a
         slow route previously looked like a dead click for a second or more
         with nothing on screen changing. Colour follows the brand token. -->
    <NuxtLoadingIndicator color="rgb(var(--dnl-primary))" :height="2" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
