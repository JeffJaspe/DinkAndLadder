<script setup lang="ts">
/**
 * Confirmation dialog — the mockup's "Confirm Verification / Are you sure you
 * want to verify this match? / Cancel · Confirm".
 *
 * This is the pattern for every irreversible action (docs/33 §7): verify,
 * dispute, leave club, delete.
 *
 * Focus handling is the part that is easy to get wrong and matters most: focus
 * moves into the dialog on open, is trapped inside while it is open, and
 * returns to whatever opened it on close. Without that, a keyboard user tabs
 * straight out of the dialog into the page behind it.
 */

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    description?: string | null
    confirmLabel?: string
    cancelLabel?: string
    /** Styles Confirm as destructive. */
    destructive?: boolean
    /** Disables both buttons and shows a spinner while the action runs. */
    loading?: boolean
    /** Hides the built-in button row when the default slot supplies its own. */
    hideActions?: boolean
  }>(),
  {
    description: null,
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    destructive: false,
    loading: false,
    hideActions: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: []
  cancel: []
}>()

const panel = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

const titleId = useId()
const descId = useId()

function close() {
  emit('cancel')
  emit('update:modelValue', false)
}

function focusables(): HTMLElement[] {
  if (!panel.value) return []
  return Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  )
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab') return

  const items = focusables()
  if (!items.length) return

  const first = items[0]!
  const last = items[items.length - 1]!
  const current = document.activeElement as HTMLElement | null

  // Wrap at both ends so Tab can never leave the dialog.
  if (event.shiftKey && (current === first || !panel.value?.contains(current))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && current === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!import.meta.client) return

    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null
      // The page behind must not scroll under the dialog.
      document.body.style.overflow = 'hidden'
      await nextTick()
      ;(focusables()[0] ?? panel.value)?.focus()
    } else {
      document.body.style.overflow = ''
      previouslyFocused?.focus()
      previouslyFocused = null
    }
  }
)

onBeforeUnmount(() => {
  if (import.meta.client) document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
        @click.self="close"
        @keydown="onKeydown"
      >
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descId : undefined"
          tabindex="-1"
          class="w-full max-w-md rounded-card border border-border bg-surface p-5 shadow-card-hover focus:outline-none"
        >
          <div class="flex items-start justify-between gap-4">
            <h2 :id="titleId" class="font-display text-heading-3 text-fg">{{ title }}</h2>
            <button
              type="button"
              class="-m-1 rounded p-1 text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close"
              @click="close"
            >
              <UiIcon name="x" size="h-5 w-5" :stroke-width="2" />
            </button>
          </div>

          <p v-if="description" :id="descId" class="mt-2 text-body-2 text-fg-secondary">
            {{ description }}
          </p>

          <div v-if="$slots.default" class="mt-4">
            <slot />
          </div>

          <div v-if="!hideActions" class="mt-5 flex justify-end gap-2">
            <UiButton variant="secondary" :disabled="loading" @click="close">
              {{ cancelLabel }}
            </UiButton>
            <UiButton
              :variant="destructive ? 'danger' : 'primary'"
              :loading="loading"
              @click="emit('confirm')"
            >
              {{ confirmLabel }}
            </UiButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
