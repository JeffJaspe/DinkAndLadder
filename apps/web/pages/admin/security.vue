<script setup lang="ts">
/**
 * The SuperAdmin's one two-factor tool: reset an account whose owner has lost
 * both the authenticator and the recovery codes. Route middleware is defence in
 * depth — both endpoints re-check the caller, and the server middleware refuses
 * every /api/v1/admin call from a session without aal2.
 */
definePageMeta({
  middleware: ['super-admin']
})

useHead({ title: 'Account security' })

interface LookedUp {
  id: string
  email: string
  mfa_enrolled_at: string | null
  is_self: boolean
}

const email = ref('')
const searching = ref(false)
const searchError = ref('')
const found = ref<LookedUp | null>(null)

const confirmOpen = ref(false)
const resetting = ref(false)
const resetError = ref('')
const resetDone = ref('')

async function lookup() {
  searchError.value = ''
  resetDone.value = ''
  found.value = null
  if (!email.value.trim()) return
  searching.value = true
  try {
    const response = await $fetch<{ data: LookedUp }>('/api/v1/admin/users/lookup', {
      query: { email: email.value }
    })
    found.value = response.data
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    searchError.value = fetchError.data?.message ?? 'Could not look that account up.'
  } finally {
    searching.value = false
  }
}

async function reset() {
  if (!found.value) return
  resetError.value = ''
  resetting.value = true
  try {
    await $fetch(`/api/v1/admin/users/${found.value.id}/mfa-reset`, { method: 'POST' })
    resetDone.value = `Two-factor authentication was reset for ${found.value.email}. They can sign in with their password and set it up again.`
    found.value = { ...found.value, mfa_enrolled_at: null }
    confirmOpen.value = false
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    resetError.value = fetchError.data?.message ?? 'Could not reset two-factor authentication.'
  } finally {
    resetting.value = false
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <h1 class="font-display text-heading-1 text-fg">Account security</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Super admin only. Reset two-factor authentication for someone who has lost both their
        authenticator and their recovery codes. Every reset is audit-logged.
      </p>

      <form class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start" @submit.prevent="lookup">
        <div class="flex-1">
          <label for="lookup-email" class="sr-only">Account email</label>
          <input
            id="lookup-email"
            v-model="email"
            type="email"
            required
            autocomplete="off"
            placeholder="Account email"
            class="w-full rounded-button border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p v-if="searchError" role="alert" class="mt-2 text-body-2 text-danger">
            {{ searchError }}
          </p>
        </div>
        <button
          type="submit"
          :disabled="searching"
          class="rounded-button bg-primary px-6 py-2.5 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {{ searching ? 'Looking up…' : 'Look up' }}
        </button>
      </form>

      <p
        v-if="resetDone"
        role="status"
        class="mt-4 rounded-button bg-primary-soft px-4 py-3 text-body-2 text-primary"
      >
        {{ resetDone }}
      </p>

      <div
        v-if="found"
        class="mt-6 flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center"
      >
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-surface-2 text-fg-secondary"
        >
          <UiIcon name="shield" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-fg">{{ found.email }}</p>
          <p class="mt-0.5 text-body-2 text-fg-muted">
            <template v-if="found.mfa_enrolled_at"
              >Two-factor on since {{ formatDate(found.mfa_enrolled_at) }}</template
            >
            <template v-else>Two-factor is off</template>
          </p>
        </div>
        <p v-if="found.is_self" class="text-body-2 text-fg-muted">
          That's you — use a recovery code instead.
        </p>
        <button
          v-else-if="found.mfa_enrolled_at"
          type="button"
          class="rounded-button border border-danger px-4 py-2.5 font-medium text-danger transition-colors hover:bg-danger-soft"
          @click="confirmOpen = true"
        >
          Reset two-factor
        </button>
      </div>

      <UiModal
        v-model="confirmOpen"
        title="Reset two-factor authentication?"
        :description="`${found?.email ?? 'This account'} will sign in with a password alone until they set it up again. Only do this after you have confirmed who you are talking to.`"
        confirm-label="Reset"
        destructive
        :loading="resetting"
        @confirm="reset"
      >
        <p v-if="resetError" role="alert" class="text-body-2 text-danger">{{ resetError }}</p>
      </UiModal>
    </div>
  </div>
</template>
