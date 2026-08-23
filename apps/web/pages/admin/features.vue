<script setup lang="ts">
import type { FeatureFlagDto } from '~/server/domains/platform/dto/feature-flag.dto'

/**
 * SuperAdmin feature-flag console (docs/30-SUPER-ADMIN-SPECIFICATION.md §2.5).
 *
 * Entirely data-driven: the rows come from the `feature_flags` table, so a flag
 * added by a seed row appears here with no change to this page, and one removed
 * from the table stops being offered rather than lingering as a dead switch.
 *
 * Route middleware is defence in depth — GET and PATCH both re-check the caller
 * against platform_config.super_admin_id server-side.
 */
definePageMeta({
  middleware: ['super-admin']
})

useHead({ title: 'Platform Features' })

const { data, pending, error, refresh } = await useFetch<{ data: FeatureFlagDto[] }>(
  '/api/v1/admin/feature-flags'
)

const flags = computed(() => data.value?.data ?? [])

const notAuthorized = computed(() => (error.value as { statusCode?: number })?.statusCode === 403)

const savingKey = ref('')
const saveError = ref('')
const toast = useToast()

async function toggle(flag: FeatureFlagDto) {
  if (savingKey.value) return
  saveError.value = ''
  savingKey.value = flag.key
  const next = !flag.enabled

  try {
    await $fetch('/api/v1/admin/feature-flags', {
      method: 'PATCH',
      body: { key: flag.key, enabled: next }
    })
    // Refetched rather than patched locally: the row as stored is the truth,
    // and another admin session may have changed a different flag meanwhile.
    await refresh()
    toast.success(`${flag.label} is now ${next ? 'on' : 'off'}.`)
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    saveError.value = fetchError.data?.message ?? 'Could not update the flag.'
  } finally {
    savingKey.value = ''
  }
}

function updatedLabel(flag: FeatureFlagDto): string {
  return new Date(flag.updated_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <h1 class="text-2xl font-bold text-fg">Platform Features</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Super admin only. A feature that is off is invisible to everyone — the UI does not render it
        and the API does not serve it.
      </p>

      <!-- Loading -->
      <div v-if="pending" class="mt-6 space-y-3">
        <div v-for="i in 2" :key="i" class="h-24 animate-pulse rounded-card bg-surface" />
      </div>

      <!-- Not the super admin -->
      <div v-else-if="notAuthorized" class="mt-6 rounded-card bg-danger/10 p-6 text-center">
        <p class="text-danger">Platform settings are limited to the SuperAdmin account.</p>
      </div>

      <!-- Load failed -->
      <UiErrorState
        v-else-if="error"
        class="mt-6"
        title="Could not load feature flags"
        message="The platform configuration could not be read."
        @retry="refresh()"
      />

      <!-- No rows: either nothing is seeded yet, or the 023 migration has not run.
           Both are honest as "no flags", and the message says where they come from. -->
      <UiEmptyState
        v-else-if="!flags.length"
        class="mt-6"
        compact
        icon="settings"
        title="No feature flags yet"
        message="Flags are rows in the feature_flags table. They appear here as features are built behind them."
      />

      <div v-else class="mt-6 space-y-3">
        <p v-if="saveError" class="rounded-card bg-danger/10 px-4 py-3 text-body-2 text-danger">
          {{ saveError }}
        </p>

        <div
          v-for="flag in flags"
          :key="flag.key"
          class="flex items-start justify-between gap-4 rounded-card border border-border bg-surface p-4"
        >
          <div class="min-w-0">
            <p class="font-medium text-fg">{{ flag.label }}</p>
            <p v-if="flag.description" class="mt-1 text-body-2 text-fg-secondary">
              {{ flag.description }}
            </p>
            <p class="mt-1 text-caption text-fg-muted">
              <code>{{ flag.key }}</code>
              · updated {{ updatedLabel(flag) }}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            :aria-checked="flag.enabled"
            :aria-label="flag.label"
            :disabled="savingKey === flag.key"
            class="relative inline-flex h-8 w-14 shrink-0 items-center rounded-pill border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50"
            :class="flag.enabled ? 'bg-primary' : 'bg-switch-track'"
            @click="toggle(flag)"
          >
            <span
              class="pointer-events-none absolute h-6 w-6 rounded-pill bg-switch-thumb shadow-card transition-transform"
              :class="flag.enabled ? 'translate-x-7' : 'translate-x-1'"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
