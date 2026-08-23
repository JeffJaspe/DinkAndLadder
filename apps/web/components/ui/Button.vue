<script setup lang="ts">
/**
 * The mockup's button set: Primary (solid brand), Secondary (outlined),
 * Accent (accent fill), plus Danger for the Match Details "Dispute" action and
 * Ghost for low-emphasis controls.
 *
 * Danger is an *outline*, not a solid fill: disputing a match is legitimate but
 * should not be the visually easiest thing on the page (docs/33 §5.6).
 *
 * Renders as `<a>`/`<NuxtLink>` when given `to` or `href`, so a link that looks
 * like a button is still a link — middle-click and "open in new tab" keep
 * working, which they would not on a `<button>` with a click handler.
 */

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    disabled?: boolean
    fullWidth?: boolean
    type?: 'button' | 'submit' | 'reset'
    to?: string
    href?: string
  }>(),
  { variant: 'primary', size: 'md', type: 'button', to: undefined, href: undefined }
)

const VARIANTS = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border-strong text-fg hover:bg-surface-2',
  accent: 'bg-accent text-on-accent hover:bg-accent/85',
  danger: 'border border-danger text-danger hover:bg-danger/10',
  ghost: 'text-fg-secondary hover:bg-surface-2 hover:text-fg'
} as const

const SIZES = {
  sm: 'px-3 py-1.5 text-caption',
  // 40px tall — meets the 44px touch target once the surrounding gap is counted
  md: 'px-4 py-2 text-body-2',
  lg: 'px-6 py-3 text-body-1'
} as const

const isDisabled = computed(() => props.disabled || props.loading)

/** A disabled link is not a thing in HTML, so those render as buttons. */
const tag = computed(() => {
  if (isDisabled.value) return 'button'
  if (props.to) return resolveComponent('NuxtLink')
  if (props.href) return 'a'
  return 'button'
})
</script>

<template>
  <component
    :is="tag"
    :to="!isDisabled && to ? to : undefined"
    :href="!isDisabled && href ? href : undefined"
    :type="tag === 'button' ? type : undefined"
    :disabled="tag === 'button' ? isDisabled : undefined"
    :aria-disabled="isDisabled || undefined"
    :aria-busy="loading || undefined"
    class="inline-flex items-center justify-center gap-2 rounded-button font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50"
    :class="[VARIANTS[variant], SIZES[size], fullWidth ? 'w-full' : '']"
  >
    <svg v-if="loading" class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
    <slot />
  </component>
</template>
