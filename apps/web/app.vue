<script setup lang="ts">
/**
 * Document title.
 *
 * No page set one, so every route rendered as `localhost:3000/...` in the tab
 * and axe flagged `document-title` on all of them. A title is the first thing a
 * screen reader announces on navigation and the only label a user has when
 * several tabs are open, so this is a real failure rather than a lint nit.
 *
 * `titleTemplate` as a function rather than the `%s` string form: the string
 * form has no way to express "and something sensible when the page sets no
 * title", which is exactly the case that was broken.
 */
useHead({
  titleTemplate: (title?: string) =>
    title ? `${title} · DinkAndLadder` : 'DinkAndLadder — Philippine Pickleball Platform',
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
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
