<script setup lang="ts">
/**
 * A nudge, not a nag: shown to a signed-in player who has not set up
 * two-factor, until they either do or dismiss it. Dismissal is remembered in
 * this browser for 30 days, keyed by user so a shared machine does not hide
 * it from the next person. Most players have never used an authenticator
 * app, so the card says what it is in one line and hands off to the wizard,
 * which carries the full walkthrough.
 *
 * Client-only: status comes from /api/v1/mfa/status after mount (a signed-out
 * viewer simply gets a 401 and no card), and nothing renders until it has - an
 * SSR flash of "set up 2FA" at someone who already has it would be worse than
 * a late card.
 */
const SNOOZE_DAYS = 30

const user = useSupabaseUser()
const show = ref(false)

function snoozeKey(): string {
  return `dnl:mfa-reminder:${user.value?.id ?? 'anon'}`
}

function isSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(snoozeKey()) ?? 0) > Date.now()
  } catch {
    return false
  }
}

function dismiss() {
  show.value = false
  try {
    localStorage.setItem(snoozeKey(), String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000))
  } catch {
    // Storage blocked: the card simply returns next visit.
  }
}

onMounted(async () => {
  if (isSnoozed()) return
  try {
    const { data } = await $fetch<{ data: { enrolled: boolean; required: boolean } }>(
      '/api/v1/mfa/status'
    )
    // A required account is steered by the admin guard instead; no nudge needed.
    show.value = !data.enrolled && !data.required
  } catch {
    show.value = false
  }
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="-translate-y-1 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
  >
    <aside
      v-if="show"
      role="status"
      aria-label="Two-factor authentication reminder"
      class="flex flex-col gap-3 rounded-card border border-primary/30 bg-primary-soft p-4 sm:flex-row sm:items-center"
    >
      <span
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-surface text-primary"
      >
        <UiIcon name="shield" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="font-medium text-fg">Protect your account with two-factor authentication</p>
        <p class="mt-0.5 text-body-2 text-fg-secondary">
          A 6-digit code from a free app on your phone, on top of your password. Takes two
          minutes — no SMS, nothing sent to anyone.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <NuxtLink
          to="/settings/security/two-factor"
          class="inline-flex items-center rounded-button bg-primary px-4 py-2 text-body-2 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Set up
        </NuxtLink>
        <button
          type="button"
          class="inline-flex items-center rounded-button px-3 py-2 text-body-2 font-medium text-fg-secondary transition-colors hover:bg-surface hover:text-fg"
          @click="dismiss"
        >
          Later
        </button>
      </div>
    </aside>
  </Transition>
</template>
