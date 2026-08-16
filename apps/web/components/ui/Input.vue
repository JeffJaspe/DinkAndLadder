<script setup lang="ts">
interface Props {
  modelValue?: string | number
  type?: string
  label?: string
  placeholder?: string
  error?: string
  hint?: string
  disabled?: boolean
  required?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputId = computed(() => `input-${Math.random().toString(36).slice(2, 9)}`)

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="w-full">
    <label
      v-if="label"
      :for="inputId"
      class="mb-1.5 block text-sm font-medium text-text-secondary"
    >
      {{ label }}
      <span v-if="required" class="text-error">*</span>
    </label>

    <input
      :id="inputId"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      class="w-full rounded-button border bg-surface px-4 py-2.5 text-text-primary placeholder-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
      :class="error ? 'border-error' : 'border-surface-light hover:border-primary/50'"
      @input="handleInput"
    />

    <p v-if="error" class="mt-1.5 text-sm text-error">{{ error }}</p>
    <p v-else-if="hint" class="mt-1.5 text-sm text-text-muted">{{ hint }}</p>
  </div>
</template>
