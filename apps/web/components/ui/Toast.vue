<script setup lang="ts">
const props = defineProps<{
  message: string
  variant?: 'error' | 'warning' | 'success' | 'info'
}>()
const emit = defineEmits<{ close: [] }>()

const AUTO_DISMISS_MS = 6000
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.message,
  (message) => {
    if (timer) clearTimeout(timer)
    if (message) timer = setTimeout(() => emit('close'), AUTO_DISMISS_MS)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'success':
      return 'border-primary/40 bg-surface text-primary-hover'
    case 'warning':
      return 'border-amber-500/40 bg-amber-950/90 text-amber-300'
    case 'info':
      return 'border-sky-500/40 bg-sky-950/90 text-sky-300'
    default:
      return 'border-red-500/40 bg-red-950/90 text-red-300'
  }
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="-translate-y-4 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="-translate-y-4 opacity-0"
  >
    <div
      v-if="message"
      class="fixed left-1/2 top-4 z-50 w-full max-w-md -translate-x-1/2 px-4"
      role="alert"
    >
      <div class="flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur" :class="variantClasses">
        <svg class="mt-0.5 h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p class="flex-1 text-sm">{{ message }}</p>
        <button
          type="button"
          class="text-lg leading-none opacity-70 hover:opacity-100"
          aria-label="Dismiss"
          @click="$emit('close')"
        >
          &times;
        </button>
      </div>
    </div>
  </Transition>
</template>
