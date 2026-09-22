<script setup lang="ts">
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const showBanner = ref(false)
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)

const DISMISS_KEY = 'dal-pwa-install-dismissed'
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

function isDismissed(): boolean {
  if (import.meta.server) return true
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (!dismissed) return false
    const timestamp = parseInt(dismissed, 10)
    return Date.now() - timestamp < DISMISS_DURATION
  } catch {
    return false
  }
}

function dismiss() {
  showBanner.value = false
  try {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
  } catch {
    // Storage unavailable
  }
}

async function install() {
  if (!deferredPrompt.value) return
  await deferredPrompt.value.prompt()
  const { outcome } = await deferredPrompt.value.userChoice
  if (outcome === 'accepted') {
    showBanner.value = false
  }
  deferredPrompt.value = null
}

onMounted(() => {
  if (isDismissed()) return

  // Check if already installed (standalone mode)
  if (window.matchMedia('(display-mode: standalone)').matches) return

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e as BeforeInstallPromptEvent
    showBanner.value = true
  })

  // iOS doesn't fire beforeinstallprompt — show manual instructions
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  if (isIOS && isSafari) {
    showBanner.value = true
  }
})
</script>

<template>
  <Transition name="slide-down">
    <div
      v-if="showBanner"
      class="fixed left-0 right-0 top-0 z-50 flex items-center gap-3 bg-primary px-4 py-2.5 text-on-primary shadow-card lg:hidden"
    >
      <img
        src="/icons/icon-192.png"
        alt=""
        class="h-10 w-10 shrink-0 rounded-lg"
        width="40"
        height="40"
      />
      <div class="min-w-0 flex-1">
        <p class="text-body-2 font-semibold">Install DinkAndLadder</p>
        <p class="text-caption opacity-90">Add to home screen for the best experience</p>
      </div>
      <button
        v-if="deferredPrompt"
        class="shrink-0 rounded-button bg-on-primary px-3 py-1.5 text-caption font-semibold text-primary transition-colors hover:bg-on-primary/90"
        @click="install"
      >
        Install
      </button>
      <button
        class="shrink-0 rounded-button p-1.5 transition-colors hover:bg-white/20"
        aria-label="Dismiss"
        @click="dismiss"
      >
        <UiIcon name="x" size="h-5 w-5" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
