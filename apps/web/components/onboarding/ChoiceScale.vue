<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { QuestionKind } from '~/server/domains/rating/data/question-bank'

/**
 * The answer control for the initial skill-rating questionnaire.
 *
 * One control, two shapes, chosen by the question's own `kind` rather than by
 * measuring its label lengths in the client:
 *
 * - `scale` — the five-stop frequency scale (Never … Always). A single
 *   segmented control, horizontal from `sm` where position carries the order,
 *   stacked below it where position cannot, so each stacked row draws a small
 *   ascending meter instead. Five identical full-width blocks read as five
 *   unrelated options; a scale has to look like a scale.
 * - `list` — the three calibration questions, whose options are sentences and
 *   are not ordered on one axis. Always a stacked, left-aligned list.
 *
 * Both shapes are one bordered group with ruled divisions rather than five
 * separate boxes. The old per-option `border-2 border-border-strong` measured
 * 1.50:1 against the card in light and 1.80:1 in dark, and the `bg-canvas`
 * fill added 1.06:1 — so the only affordance on the most-used control in a
 * 20-screen flow was under the 3:1 that WCAG 2.2 SC 1.4.11 asks of a component
 * boundary, in both themes. `border-fg-muted` is the design system's own
 * answer to that (the Visible-Line Rule): 5.18:1 light, 6.42:1 dark.
 *
 * Selection is manual, not automatic: arrows move focus, Enter/Space commits.
 * The usual "arrows also select" radiogroup behaviour is wrong here because
 * committing an answer advances the whole questionnaire, so an arrow press
 * would fire the next question before the user had read this one.
 */

const props = withDefaults(
  defineProps<{
    choices: string[]
    kind: QuestionKind
    /** Index of the committed answer, or null while the question is unanswered. */
    modelValue: number | null
    /** id of the heading that states the question — the group's accessible name. */
    labelledBy: string
    disabled?: boolean
  }>(),
  { disabled: false }
)

const emit = defineEmits<{ select: [number] }>()

const isScale = computed(() => props.kind === 'scale')

const options = ref<HTMLButtonElement[]>([])
function setOption(el: Element | ComponentPublicInstance | null, index: number) {
  if (el) options.value[index] = el as HTMLButtonElement
}
watch(
  () => props.choices.length,
  (length) => {
    options.value.length = length
  }
)

/**
 * Roving tabindex: the group is one tab stop, and arrows move within it. Lands
 * on the committed answer when there is one so returning via Back puts the
 * keyboard where the eye already is.
 */
const rovingIndex = ref(props.modelValue ?? 0)
watch(
  () => props.modelValue,
  (value) => {
    rovingIndex.value = value ?? 0
  }
)

function focusOption(index: number) {
  const bounded = (index + props.choices.length) % props.choices.length
  rovingIndex.value = bounded
  options.value[bounded]?.focus({ preventScroll: true })
}

/** Called by the page after it advances, so focus follows the question. */
function focusFirst() {
  rovingIndex.value = props.modelValue ?? 0
  options.value[rovingIndex.value]?.focus({ preventScroll: true })
}
defineExpose({ focusFirst })

function onKeydown(event: KeyboardEvent) {
  const moves: Record<string, number> = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1
  }
  if (event.key in moves) {
    event.preventDefault()
    focusOption(rovingIndex.value + moves[event.key])
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    focusOption(0)
  } else if (event.key === 'End') {
    event.preventDefault()
    focusOption(props.choices.length - 1)
  }
}

/** Ascending bars, so a stacked scale still reads as an ordered one. */
const METER_HEIGHTS = [6, 9, 12, 15, 18]
</script>

<template>
  <div
    role="radiogroup"
    :aria-labelledby="labelledBy"
    class="flex flex-col divide-y divide-fg-muted overflow-hidden rounded-button border border-fg-muted"
    :class="isScale ? 'sm:flex-row sm:divide-x sm:divide-y-0' : ''"
    @keydown="onKeydown"
  >
    <button
      v-for="(choice, index) in choices"
      :key="choice"
      :ref="(el) => setOption(el, index)"
      type="button"
      role="radio"
      :aria-checked="modelValue === index"
      :tabindex="index === rovingIndex ? 0 : -1"
      :disabled="disabled"
      class="flex items-center gap-3 px-4 py-3 text-left text-body-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50"
      :class="[
        isScale ? 'sm:min-w-0 sm:flex-1 sm:basis-0 sm:justify-center sm:px-2 sm:text-center' : '',
        modelValue === index
          ? 'bg-primary text-on-primary focus-visible:ring-on-primary'
          : 'bg-surface text-fg hover:bg-surface-2 focus-visible:ring-primary'
      ]"
      @click="emit('select', index)"
    >
      <!-- Below sm the scale loses its horizontal axis, so the order has to be
           drawn. Hidden from assistive tech: the label already says it. -->
      <span
        v-if="isScale"
        class="flex h-5 w-7 shrink-0 items-end gap-0.5 sm:hidden"
        aria-hidden="true"
      >
        <span
          v-for="(height, bar) in METER_HEIGHTS"
          :key="bar"
          class="w-1"
          :style="{ height: `${height}px` }"
          :class="
            bar <= index
              ? modelValue === index
                ? 'bg-on-primary'
                : 'bg-fg-secondary'
              : modelValue === index
                ? 'bg-on-primary/45'
                : 'bg-border-strong'
          "
        />
      </span>
      <span>{{ choice }}</span>
    </button>
  </div>
</template>
