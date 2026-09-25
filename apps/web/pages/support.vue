<script setup lang="ts">
useHead({ title: 'Contact Support' })

const supportEmail = 'support@dinkandladder.app'
const toast = useToast()
const copied = ref(false)

async function copyEmail() {
  try {
    await navigator.clipboard.writeText(supportEmail)
    copied.value = true
    toast.success('Email copied!')
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    toast.error('Could not copy')
  }
}
</script>

<template>
  <div class="page-shell min-h-screen bg-canvas p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <UiPageHeader to="/" back-label="Home" title="Contact Support" />

      <div class="mt-8 rounded-card border border-border bg-surface p-6 shadow-card">
        <div class="flex items-start gap-4">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft">
            <UiIcon name="mail" class="text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="font-display text-heading-3 text-fg">Get in touch</h2>
            <p class="mt-2 text-body-2 text-fg-secondary">
              Have a question, found a bug, or need help with your account? Send us an email and we'll get back to you as soon as possible.
            </p>
          </div>
        </div>

        <div class="mt-6 rounded-button border border-border bg-surface-2 p-4">
          <p class="text-caption font-semibold uppercase tracking-widest text-fg-muted">Email us at</p>
          <div class="mt-2 flex items-center gap-3">
            <span class="select-all font-display text-heading-2 text-fg">
              {{ supportEmail }}
            </span>
            <button
              type="button"
              class="shrink-0 rounded-button p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
              :aria-label="copied ? 'Copied' : 'Copy email'"
              @click="copyEmail"
            >
              <UiIcon v-if="copied" name="check" size="h-5 w-5" class="text-primary" />
              <UiIcon v-else name="link" size="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div class="mt-8 space-y-4">
        <h3 class="font-display text-heading-3 text-fg">Common questions</h3>

        <details class="rounded-card border border-border bg-surface p-4">
          <summary class="cursor-pointer text-body-1 font-medium text-fg">
            How do I reset my password?
          </summary>
          <p class="mt-3 text-body-2 text-fg-secondary">
            Go to the login page and click "Forgot password". Enter your email address and we'll send you a link to reset your password.
          </p>
        </details>

        <details class="rounded-card border border-border bg-surface p-4">
          <summary class="cursor-pointer text-body-1 font-medium text-fg">
            How do I join a club?
          </summary>
          <p class="mt-3 text-body-2 text-fg-secondary">
            Browse clubs in the Clubs section, find one near you, and click "Request to join". The club admin will review your request.
          </p>
        </details>

        <details class="rounded-card border border-border bg-surface p-4">
          <summary class="cursor-pointer text-body-1 font-medium text-fg">
            How is my rating calculated?
          </summary>
          <p class="mt-3 text-body-2 text-fg-secondary">
            Your rating is based on match results recorded by club organizers. Only verified matches at registered clubs affect your rating.
          </p>
        </details>

        <details class="rounded-card border border-border bg-surface p-4">
          <summary class="cursor-pointer text-body-1 font-medium text-fg">
            How do I report a problem with a match result?
          </summary>
          <p class="mt-3 text-body-2 text-fg-secondary">
            Contact the club organizer who recorded the match. If you can't resolve it with them, email us with the match details.
          </p>
        </details>
      </div>
    </div>
  </div>
</template>
