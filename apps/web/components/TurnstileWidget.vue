<script setup lang="ts">
const props = defineProps<{ siteKey: string }>()
const emit = defineEmits<{
  verified: [token: string]
  expired: []
  error: []
}>()

const container = ref<HTMLElement | null>(null)
let widgetId: string | undefined

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`)
  if (existing) {
    return new Promise((resolve) => existing.addEventListener('load', () => resolve()))
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Turnstile'))
    document.head.appendChild(script)
  })
}

onMounted(async () => {
  try {
    await loadScript()
  } catch {
    emit('error')
    return
  }
  if (!container.value || !window.turnstile) return
  widgetId = window.turnstile.render(container.value, {
    sitekey: props.siteKey,
    callback: (token: string) => emit('verified', token),
    'expired-callback': () => emit('expired'),
    'error-callback': () => emit('error')
  })
})

onBeforeUnmount(() => {
  if (widgetId) window.turnstile?.remove(widgetId)
})

function reset() {
  if (widgetId) window.turnstile?.reset(widgetId)
}

defineExpose({ reset })
</script>

<template>
  <div ref="container" />
</template>
