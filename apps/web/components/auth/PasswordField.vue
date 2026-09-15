<script setup lang="ts">
/**
 * A password input with a show/hide control, for the four places a password
 * is typed (register, login, and both fields on update-password).
 *
 * A masked field on a phone keyboard is where most sign-up typos happen, and
 * the only feedback the visitor got was a rejected login later. The toggle is a
 * real button inside the field: 44px square so it is a thumb target, labelled
 * for a screen reader, `aria-pressed` so its state is announced, and it never
 * takes the tab stop away from the input — Tab goes input → toggle → next field.
 *
 * The visitor's choice is per-field and never remembered: revealing a password
 * is a deliberate act each time, not a preference.
 */
const props = withDefaults(
  defineProps<{
    id: string
    modelValue: string
    label: string
    autocomplete: 'current-password' | 'new-password'
    placeholder?: string
    minlength?: number
    required?: boolean
    /** Helper line under the field, e.g. "Minimum 8 characters". */
    hint?: string
  }>(),
  { placeholder: '', minlength: undefined, required: true, hint: '' }
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const revealed = ref(false)
const input = ref<HTMLInputElement | null>(null)

/**
 * Sync the DOM value into the model before flipping `type`. Characters typed
 * before hydration finished never reached the model, and re-rendering the
 * input with `:value=""` would have wiped the password the visitor could see
 * themselves typing.
 */
function toggle() {
  if (input.value && input.value.value !== props.modelValue) {
    emit('update:modelValue', input.value.value)
  }
  revealed.value = !revealed.value
}

const hintId = computed(() => (props.hint ? `${props.id}-hint` : undefined))
</script>

<template>
  <div>
    <label :for="id" class="mb-1.5 block text-sm font-medium text-fg-secondary">{{ label }}</label>
    <div class="relative">
      <input
        :id="id"
        ref="input"
        :value="modelValue"
        :type="revealed ? 'text' : 'password'"
        :required="required"
        :autocomplete="autocomplete"
        :minlength="minlength"
        :placeholder="placeholder"
        :aria-describedby="hintId"
        spellcheck="false"
        class="w-full rounded-lg border border-border-strong bg-canvas py-2.5 pl-4 pr-12 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        :aria-label="revealed ? 'Hide password' : 'Show password'"
        :aria-pressed="revealed"
        :aria-controls="id"
        class="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        @click="toggle"
      >
        <UiIcon :name="revealed ? 'eye-off' : 'eye'" size="h-5 w-5" />
      </button>
    </div>
    <p v-if="hint" :id="hintId" class="mt-1.5 text-xs text-fg-muted">{{ hint }}</p>
  </div>
</template>
