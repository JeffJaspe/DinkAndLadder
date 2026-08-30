<script setup lang="ts">
/**
 * Chromeless shell for the routes you use when you cannot get into the app:
 * sign in, register, reset, set a new password, confirm.
 *
 * These pages used to inherit `layouts/default.vue`, which draws the sidebar,
 * mobile drawer, bottom tab bar and account switcher whenever a session exists.
 * A password-recovery link *is* a session, so the reset form arrived wrapped in
 * the full app, and every nav item was an exit from the flow with the password
 * still unchanged.
 *
 * Each of these pages already renders its own centred, full-height card, so
 * this layout adds no wrapper of its own — only the toast host, which they
 * would otherwise lose along with the rest of the shell.
 */
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <slot />
    <UiToaster />
  </div>
</template>
