<script setup lang="ts">
/**
 * Score stepper for Submit Match.
 *
 * Justification from docs/33 §5.7: typing scores on a phone, courtside, is the
 * app's highest-friction moment. Steppers make it thumb-operable in seconds and
 * make an invalid score unreachable rather than merely rejected — the value can
 * only move between `min` and `max`.
 *
 * The number is still a real `<input>` so a keyboard user can type, and the
 * buttons are `type="button"` so they never submit the enclosing form.
 */

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
    /** Accessible name, e.g. "Your score, game 1". */
    label: string
    disabled?: boolean
    /** Disable only the plus button (e.g., when a game is complete but minus should still work for corrections). */
    plusDisabled?: boolean
  }>(),
  { min: 0, max: 99, step: 1, disabled: false, plusDisabled: false }
)

const emit = defineEmits<{ 'update:modelValue': [number] }>()

const canDecrement = computed(() => !props.disabled && props.modelValue > props.min)
const canIncrement = computed(() => !props.disabled && !props.plusDisabled && props.modelValue < props.max)

function clamp(value: number) {
  if (Number.isNaN(value)) return props.min
  return Math.min(props.max, Math.max(props.min, value))
}

function bump(direction: 1 | -1) {
  emit('update:modelValue', clamp(props.modelValue + direction * props.step))
}

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  // Strip non-numeric characters
  const cleaned = input.value.replace(/[^0-9]/g, '')
  const value = cleaned === '' ? props.min : clamp(Number(cleaned))
  emit('update:modelValue', value)
}

function onBlur(event: Event) {
  // Use nextTick to ensure Vue has processed any parent updates
  nextTick(() => {
    const input = event.target as HTMLInputElement
    // Sync the input display with the actual model value (parent may have rejected the change)
    if (input && document.body.contains(input)) {
      input.value = String(props.modelValue)
    }
  })
}

function onKeydown(event: KeyboardEvent) {
  // Allow: backspace, delete, tab, escape, enter, arrows
  const allowed = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (allowed.includes(event.key)) return
  // Allow Ctrl/Cmd+A, Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+X
  if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) return
  // Block non-numeric keys
  if (!/^[0-9]$/.test(event.key)) {
    event.preventDefault()
  }
}
</script>

<template>
  <div
    class="inline-flex items-center gap-1 rounded-button border border-border-strong bg-surface p-1"
  >
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-[6px] text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :disabled="!canDecrement"
      :aria-label="`Decrease ${label}`"
      @click="bump(-1)"
    >
      <UiIcon name="minus" size="h-4 w-4" :stroke-width="2.5" />
    </button>

    <input
      :value="modelValue"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      :aria-label="label"
      :disabled="disabled"
      class="dnl-no-spin w-12 border-0 bg-transparent text-center font-display text-heading-3 tabular-nums text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />

    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-[6px] text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :disabled="!canIncrement"
      :aria-label="`Increase ${label}`"
      @click="bump(1)"
    >
      <UiIcon name="plus" size="h-4 w-4" :stroke-width="2.5" />
    </button>
  </div>
</template>

<style scoped>
/* The native spinners duplicate the stepper's own buttons and, at this size,
   land under the thumb by accident. */
.dnl-no-spin::-webkit-outer-spin-button,
.dnl-no-spin::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}
.dnl-no-spin {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
