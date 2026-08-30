<script setup lang="ts">
import type { SponsorDto } from '~/server/domains/platform/dto/sponsor.dto'
import { apiErrorMessage } from '~/utils/api-error-message'

/**
 * SuperAdmin sponsors console (042-sponsors).
 *
 * Same shape as the branding and feature-flag consoles: data-driven off the
 * table, route middleware as defence in depth, and every endpoint behind it
 * re-checks the caller against platform_config.super_admin_id.
 *
 * A sponsor is created first and its logo uploaded second, because the storage
 * path is keyed on the row's id — uploading before the row exists would mean
 * inventing a temporary key and moving the object afterwards.
 */
definePageMeta({ middleware: ['super-admin'] })

useHead({ title: 'Sponsors' })

const toast = useToast()

const { data, pending, error, refresh } = await useFetch<{ data: SponsorDto[] }>(
  '/api/v1/admin/sponsors'
)

const sponsors = computed(() => data.value?.data ?? [])
const notAuthorized = computed(() => (error.value as { statusCode?: number })?.statusCode === 403)

// --- Adding ------------------------------------------------------------------
const newLabel = ref('')
const newLink = ref('')
const adding = ref(false)

async function addSponsor() {
  if (!newLabel.value.trim()) return
  adding.value = true
  try {
    await $fetch('/api/v1/admin/sponsors', {
      method: 'POST',
      body: {
        label: newLabel.value.trim(),
        link_url: newLink.value.trim() || null,
        display_order: sponsors.value.length
      }
    })
    newLabel.value = ''
    newLink.value = ''
    await refresh()
    toast.success('Sponsor added. Upload a logo next.')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not add the sponsor.'))
  } finally {
    adding.value = false
  }
}

// --- Editing -----------------------------------------------------------------
const busyId = ref('')

async function patchSponsor(id: string, patch: Record<string, unknown>, message?: string) {
  if (busyId.value) return
  busyId.value = id
  try {
    await $fetch(`/api/v1/admin/sponsors/${id}`, { method: 'PATCH', body: patch })
    await refresh()
    if (message) toast.success(message)
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not update the sponsor.'))
  } finally {
    busyId.value = ''
  }
}

async function uploadLogo(id: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  busyId.value = id
  try {
    const body = new FormData()
    body.append('file', file)
    await $fetch(`/api/v1/admin/sponsors/${id}/image`, { method: 'POST', body })
    await refresh()
    toast.success('Logo updated.')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not upload the logo.'))
  } finally {
    busyId.value = ''
    // Cleared so re-picking the same file fires change again.
    input.value = ''
  }
}

const removingId = ref('')

async function removeSponsor(id: string) {
  removingId.value = id
  try {
    await $fetch(`/api/v1/admin/sponsors/${id}`, { method: 'DELETE' })
    await refresh()
    toast.success('Sponsor removed.')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not remove the sponsor.'))
  } finally {
    removingId.value = ''
  }
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <h1 class="text-2xl font-bold text-fg">Sponsors</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Super admin only. These appear on the public landing page, in the order below. A sponsor
        that is switched off keeps its logo but is hidden.
      </p>

      <!-- Add -->
      <section class="mt-6 rounded-card bg-surface p-5 shadow-card">
        <h2 class="font-semibold text-fg">Add a sponsor</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label for="sponsor-label" class="mb-1 block text-caption text-fg-secondary">
              Name
            </label>
            <input
              id="sponsor-label"
              v-model="newLabel"
              type="text"
              maxlength="80"
              placeholder="Acme Sports"
              class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label for="sponsor-link" class="mb-1 block text-caption text-fg-secondary">
              Link <span class="text-fg-muted">(optional)</span>
            </label>
            <input
              id="sponsor-link"
              v-model="newLink"
              type="url"
              placeholder="https://example.com"
              class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none"
            />
          </div>
          <div class="flex items-end">
            <UiButton :disabled="adding || !newLabel.trim()" @click="addSponsor">
              {{ adding ? 'Adding…' : 'Add' }}
            </UiButton>
          </div>
        </div>
      </section>

      <!-- Loading -->
      <div v-if="pending" class="mt-6 space-y-3">
        <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-card bg-surface" />
      </div>

      <div v-else-if="notAuthorized" class="mt-6 rounded-card bg-danger/10 p-6 text-center">
        <p class="text-danger">Sponsors are limited to the SuperAdmin account.</p>
      </div>

      <UiErrorState
        v-else-if="error"
        class="mt-6"
        title="Could not load sponsors"
        message="The sponsor list could not be read."
        @retry="refresh()"
      />

      <UiEmptyState
        v-else-if="!sponsors.length"
        class="mt-6"
        title="No sponsors yet"
        message="Add one above. The section stays hidden on the landing page until there is at least one."
      />

      <div v-else class="mt-6 space-y-3">
        <article
          v-for="sponsor in sponsors"
          :key="sponsor.id"
          class="flex flex-wrap items-center gap-4 rounded-card bg-surface p-4 shadow-card"
          :class="sponsor.enabled ? '' : 'opacity-60'"
        >
          <div class="flex h-14 w-24 shrink-0 items-center justify-center rounded-button bg-canvas">
            <img
              v-if="sponsor.image_url"
              :src="sponsor.image_url"
              :alt="sponsor.label"
              class="max-h-12 max-w-[5.5rem] object-contain"
            />
            <span v-else class="text-caption text-fg-muted">No logo</span>
          </div>

          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-fg">{{ sponsor.label }}</p>
            <p v-if="sponsor.link_url" class="truncate text-caption text-fg-muted">
              {{ sponsor.link_url }}
            </p>
            <p v-else class="text-caption text-fg-muted">Not linked</p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <label
              class="cursor-pointer rounded-button border border-border-strong px-3 py-1.5 text-caption text-fg-secondary transition-colors hover:border-primary hover:text-fg"
            >
              {{ busyId === sponsor.id ? 'Working…' : sponsor.image_url ? 'Replace' : 'Add logo' }}
              <input
                type="file"
                accept="image/png,image/jpeg"
                class="hidden"
                :disabled="busyId !== ''"
                @change="uploadLogo(sponsor.id, $event)"
              />
            </label>

            <button
              type="button"
              class="text-caption text-fg-secondary hover:text-fg"
              :disabled="busyId !== ''"
              @click="
                patchSponsor(
                  sponsor.id,
                  { enabled: !sponsor.enabled },
                  sponsor.enabled ? 'Hidden from the landing page.' : 'Now showing.'
                )
              "
            >
              {{ sponsor.enabled ? 'Hide' : 'Show' }}
            </button>

            <button
              type="button"
              class="text-caption text-danger hover:underline"
              :disabled="removingId === sponsor.id"
              @click="removeSponsor(sponsor.id)"
            >
              {{ removingId === sponsor.id ? 'Removing…' : 'Remove' }}
            </button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
