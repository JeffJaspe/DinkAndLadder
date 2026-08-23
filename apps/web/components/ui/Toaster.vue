<script setup lang="ts">
/**
 * Renders the `useToast()` queue. Mounted once, in the layout.
 *
 * Teleported to `<body>` so a toast is never clipped by an ancestor's
 * `overflow` or trapped under a stacking context, and positioned above the
 * mobile tab bar so it does not cover the navigation it might be telling you
 * to use.
 */
const { toasts, dismiss } = useToast()

const VARIANTS = {
  success: { icon: 'check', wrap: 'border-success/40 bg-success/10', tone: 'text-success' },
  error: { icon: 'alert', wrap: 'border-danger/40 bg-danger/10', tone: 'text-danger' },
  info: { icon: 'info', wrap: 'border-info/40 bg-info/10', tone: 'text-info' }
} as const
</script>

<template>
  <Teleport to="body">
    <!-- polite, not assertive: these confirm an action the user just took, so
         interrupting whatever the screen reader is saying would be rude. -->
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-6"
      role="status"
      aria-live="polite"
    >
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-2 opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="translate-y-1 opacity-0"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border bg-surface px-4 py-3 shadow-card-hover"
          :class="VARIANTS[toast.variant].wrap"
        >
          <UiIcon
            :name="VARIANTS[toast.variant].icon"
            size="h-5 w-5"
            :stroke-width="2"
            class="mt-0.5 shrink-0"
            :class="VARIANTS[toast.variant].tone"
          />
          <p class="flex-1 text-body-2 text-fg">{{ toast.message }}</p>
          <button
            type="button"
            class="shrink-0 rounded p-0.5 text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Dismiss"
            @click="dismiss(toast.id)"
          >
            <UiIcon name="x" size="h-4 w-4" :stroke-width="2" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
