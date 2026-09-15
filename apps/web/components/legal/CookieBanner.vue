<script setup lang="ts">
/**
 * The cookie bar. Shows until a choice is stored, then never again unless
 * CONSENT_VERSION moves (docs/38 §6).
 *
 * Two equal-weight buttons and no "×": a close that silently counts as
 * acceptance is the pattern the NPC and every EU regulator have called out,
 * and a bar that can be dismissed without answering just comes back on the
 * next page, which is worse than answering. It is a landmark region rather
 * than a modal — it must not trap focus or block the page underneath, because
 * a visitor reading rankings has every right to ignore it.
 *
 * `aboveTabBar` lifts it clear of the mobile bottom tab bar in the app shell;
 * the chromeless auth layout leaves it at the very bottom.
 */

defineProps<{ aboveTabBar?: boolean }>()

const { hasChosen, accept } = useConsent()
</script>

<template>
  <section
    v-if="!hasChosen"
    role="region"
    aria-labelledby="cookie-banner-title"
    data-testid="cookie-banner"
    class="fixed left-0 right-0 z-40 border-t border-border bg-canvas shadow-card"
    :class="aboveTabBar ? 'bottom-16 lg:bottom-0' : 'bottom-0'"
  >
    <div
      class="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:py-7"
    >
      <div class="flex min-w-0 items-start gap-3">
        <span
          class="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary sm:flex"
          aria-hidden="true"
        >
          <UiIcon name="shield" size="h-5 w-5" />
        </span>
        <div class="min-w-0">
          <h2 id="cookie-banner-title" class="font-display text-heading-3 text-fg">Cookies</h2>
          <p class="mt-1 text-body-2 text-fg-secondary">
            We use cookies to keep you signed in and remember your settings. Nothing here is used
            for advertising or tracking.
            <NuxtLink
              to="/legal/cookies"
              class="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >See exactly what is set</NuxtLink
            >
          </p>
        </div>
      </div>
      <div class="flex shrink-0 flex-col gap-3 sm:flex-row lg:w-auto">
        <UiButton variant="secondary" class="sm:min-w-[10rem]" @click="accept('essential')">
          Essential only
        </UiButton>
        <UiButton class="sm:min-w-[10rem]" @click="accept('all')">Accept all</UiButton>
      </div>
    </div>
  </section>
</template>
