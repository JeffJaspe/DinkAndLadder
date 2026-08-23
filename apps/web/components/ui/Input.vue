<script setup lang="ts">
/**
 * Text input with the mockup's leading-icon treatment
 * (Rankings "Search players…", Submit Match opponent lookup, club search).
 *
 * The label is always rendered — visually hidden when `hideLabel` is set —
 * because an input identified only by its placeholder loses its name the
 * moment the user types.
 */
import type { IconName } from '~/utils/icons'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    type?: string
    placeholder?: string
    /** Leading glyph, e.g. `search`. */
    icon?: IconName
    error?: string | null
    hint?: string | null
    disabled?: boolean
    required?: boolean
    hideLabel?: boolean
    autocomplete?: string
  }>(),
  {
    type: 'text',
    placeholder: undefined,
    icon: undefined,
    error: null,
    hint: null,
    hideLabel: false,
    autocomplete: undefined
  }
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const id = useId()
const errorId = computed(() => `${id}-error`)
const hintId = computed(() => `${id}-hint`)

const describedBy = computed(() => {
  const ids = []
  if (props.error) ids.push(errorId.value)
  else if (props.hint) ids.push(hintId.value)
  return ids.length ? ids.join(' ') : undefined
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="id" :class="hideLabel ? 'sr-only' : 'text-caption font-medium text-fg-secondary'">
      {{ label }}<span v-if="required" class="text-danger"> *</span>
    </label>

    <div class="relative flex items-center">
      <UiIcon
        v-if="icon"
        :name="icon"
        size="h-4 w-4"
        class="pointer-events-none absolute left-3 text-fg-muted"
      />
      <input
        :id="id"
        :value="modelValue"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :autocomplete="autocomplete"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="describedBy"
        class="w-full rounded-button border bg-surface py-2 pr-3 text-body-2 text-fg transition-colors placeholder:text-fg-muted focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        :class="[
          icon ? 'pl-9' : 'pl-3',
          error
            ? 'border-danger focus:border-danger focus:ring-danger/40'
            : 'border-border-strong focus:border-primary focus:ring-primary/40'
        ]"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <p v-if="error" :id="errorId" class="text-caption text-danger">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="text-caption text-fg-muted">{{ hint }}</p>
  </div>
</template>
