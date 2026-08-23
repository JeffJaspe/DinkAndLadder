<script setup lang="ts">
/**
 * Sun / moon sliding switch. Sun sits on the left (light), moon on the right
 * (dark), and the thumb travels between them.
 *
 * This is the quick toggle described in docs/33 §3.5 — the control that goes in
 * the desktop sidebar footer and the mobile Profile header. It is deliberately
 * binary: a two-position switch cannot express the third `system` preference,
 * which stays reachable from the Appearance section in Settings. Flipping the
 * switch resolves against what is currently on screen, so a `system` user
 * seeing dark gets light on the first press rather than a no-op.
 *
 * Accessibility: a real <button> with `role="switch"`, so screen readers
 * announce on/off state and Space/Enter work without extra key handling.
 */

withDefaults(
  defineProps<{
    /** `sm` for the mobile header, `md` for the sidebar footer. */
    size?: 'sm' | 'md'
    /** Renders the current mode beside the switch. */
    showLabel?: boolean
  }>(),
  { size: 'md', showLabel: false }
)

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <div class="flex items-center gap-2">
    <button
      type="button"
      role="switch"
      :aria-checked="isDark"
      aria-label="Dark mode"
      class="group relative inline-flex shrink-0 items-center rounded-pill border border-border bg-switch-track transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      :class="size === 'sm' ? 'h-7 w-12' : 'h-8 w-14'"
      @click="toggleTheme"
    >
      <!-- Icons sit in the track, both always visible: the one the thumb is not
           covering acts as the affordance for where pressing will take you. -->
      <span
        class="pointer-events-none absolute inset-0 flex items-center justify-between"
        :class="size === 'sm' ? 'px-1.5' : 'px-2'"
        aria-hidden="true"
      >
        <!-- Sun -->
        <svg
          class="transition-opacity"
          :class="[size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4', isDark ? 'opacity-40' : 'opacity-0']"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          />
        </svg>

        <!-- Moon -->
        <svg
          class="transition-opacity"
          :class="[size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4', isDark ? 'opacity-0' : 'opacity-40']"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      </span>

      <!-- Thumb: carries the icon for the mode you are actually in. -->
      <span
        class="dnl-thumb pointer-events-none relative z-10 flex items-center justify-center rounded-full bg-switch-thumb text-fg shadow-[0_1px_3px_rgb(0_0_0/0.25),0_1px_2px_rgb(0_0_0/0.15)]"
        :class="[
          size === 'sm' ? 'h-5 w-5' : 'h-6 w-6',
          isDark
            ? size === 'sm'
              ? 'translate-x-[1.375rem]'
              : 'translate-x-[1.75rem]'
            : 'translate-x-1'
        ]"
        aria-hidden="true"
      >
        <svg
          v-if="isDark"
          :class="size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
        <svg
          v-else
          :class="size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          />
        </svg>
      </span>
    </button>

    <span v-if="showLabel" class="text-body-2 text-fg-secondary">
      {{ isDark ? 'Dark' : 'Light' }}
    </span>
  </div>
</template>

<style scoped>
/* Transform is animated here rather than with a Tailwind `transition-transform`
   utility so the reduced-motion opt-out lives next to it. The thumb still
   moves — it just arrives immediately. */
.dnl-thumb {
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .dnl-thumb {
    transition: none;
  }
}
</style>
