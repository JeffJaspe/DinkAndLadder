<script setup lang="ts">
import { achievementIcon, achievementTier } from '~/utils/achievement-icons'

/**
 * A badge's mark: its glyph on a tier-coloured chip.
 *
 * One rendering for every place a badge appears — the gallery, the dashboard
 * picker, the showcase beside a profile name — so the same badge looks like the
 * same badge everywhere. Locked badges go grey rather than faint: the chip is
 * the only part of a tile carrying colour, so it is the only part that changes.
 *
 * Decorative by default; the name beside it does the naming. Pass `label` when
 * the mark stands alone.
 */
const props = withDefaults(
  defineProps<{
    /** The achievement key, e.g. `first_match`. */
    achievementKey: string | null | undefined
    tier?: string | null
    size?: 'sm' | 'md' | 'lg'
    locked?: boolean
    label?: string
  }>(),
  { tier: null, size: 'md', locked: false, label: undefined }
)

const icon = computed(() => achievementIcon(props.achievementKey))
const tone = computed(() => achievementTier(props.tier))

const CHIP = {
  sm: 'h-8 w-8 rounded-badge',
  md: 'h-12 w-12 rounded-card',
  lg: 'h-16 w-16 rounded-card'
} as const

const GLYPH = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8'
} as const
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center"
    :class="[CHIP[size], locked ? 'bg-surface-2 text-fg-muted' : [tone.chip, tone.text]]"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : true"
  >
    <UiIcon :name="icon" :size="GLYPH[size]" :stroke-width="size === 'sm' ? 2 : 1.75" />
  </span>
</template>
