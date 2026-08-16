<script setup lang="ts">
interface Props {
  type?: 'success' | 'error' | 'warning' | 'info'
  message: string
  visible: boolean
  duration?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  duration: 4000
})

const emit = defineEmits<{
  close: []
}>()

const typeConfig = {
  success: { bg: 'bg-success', icon: 'check' },
  error: { bg: 'bg-error', icon: 'x' },
  warning: { bg: 'bg-warning', icon: 'alert' },
  info: { bg: 'bg-info', icon: 'info' }
}

const config = computed(() => typeConfig[props.type])

let timeout: ReturnType<typeof setTimeout> | null = null

watch(() => props.visible, (val) => {
  if (val && props.duration > 0) {
    timeout = setTimeout(() => emit('close'), props.duration)
  } else if (timeout) {
    clearTimeout(timeout)
  }
})

onUnmounted(() => {
  if (timeout) clearTimeout(timeout)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="visible"
        class="fixed right-4 top-20 z-50 max-w-sm"
      >
        <div
          class="flex items-center gap-3 rounded-card px-4 py-3 shadow-lg"
          :class="config.bg"
        >
          <svg v-if="config.icon === 'check'" class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <svg v-else-if="config.icon === 'x'" class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <svg v-else-if="config.icon === 'alert'" class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <svg v-else class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>

          <p class="flex-1 text-sm font-medium text-white">{{ message }}</p>

          <button
            class="rounded p-1 text-white/80 hover:text-white"
            @click="emit('close')"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
