<script setup lang="ts">
import type { BrandingAdminDto, BrandingSlot } from '~/server/domains/platform/dto/branding.dto'
import {
  DEFAULT_APP_NAME,
  MAX_HERO_SUBTITLE_LENGTH,
  MAX_HERO_TITLE_LENGTH
} from '~/server/domains/platform/dto/branding.dto'

/**
 * SuperAdmin branding console (docs/30-SUPER-ADMIN-SPECIFICATION.md §2.1).
 *
 * Name, logo and favicon. Uploads go through the server — the bucket has no
 * anon write access, and handing the browser a write-capable credential to save
 * one hop would be a far bigger hole than the extra request is a cost.
 */
definePageMeta({
  middleware: ['super-admin']
})

useHead({ title: 'Platform Branding' })

const { data, pending, error, refresh } = await useFetch<{ data: BrandingAdminDto }>(
  '/api/v1/admin/branding'
)

const branding = computed(() => data.value?.data ?? null)
const notAuthorized = computed(() => (error.value as { statusCode?: number })?.statusCode === 403)

// The live chrome reads the same endpoint, so it has to be refetched after any
// change or the sidebar keeps the old name until a hard reload.
const { refresh: refreshLiveBranding } = useBranding()

const toast = useToast()
const saveError = ref('')

/* -------------------------------------------------------- name ---------- */

const nameInput = ref('')
const savingName = ref(false)

watchEffect(() => {
  // Only mirror the stored value; typing must not be clobbered by a refresh.
  if (!savingName.value && branding.value) {
    nameInput.value = branding.value.app_name === DEFAULT_APP_NAME ? '' : branding.value.app_name
  }
})

async function saveName() {
  saveError.value = ''
  savingName.value = true
  try {
    await $fetch('/api/v1/admin/branding', {
      method: 'PATCH',
      body: { app_name: nameInput.value }
    })
    await Promise.all([refresh(), refreshLiveBranding()])
    toast.success('Platform name updated.')
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    saveError.value = fetchError.data?.message ?? 'Could not update the platform name.'
  } finally {
    savingName.value = false
  }
}

/* ------------------------------------------------------ images ---------- */

const SLOTS = [
  {
    slot: 'logo' as const,
    label: 'Logo',
    hint: 'Shown in the sidebar and mobile header. Square works best; any shape is fitted, never stretched.'
  },
  {
    slot: 'favicon' as const,
    label: 'Favicon',
    hint: 'The browser tab icon. A square PNG of 32×32 or larger.'
  },
  {
    slot: 'hero' as const,
    label: 'Landing background',
    hint: 'Sits behind the headline on the signed-out landing page. Wide, with an uncluttered middle, reads best.'
  }
]

const busySlot = ref<string | null>(null)

function urlFor(slot: BrandingSlot): string | null {
  if (slot === 'logo') return branding.value?.logo_url ?? null
  if (slot === 'favicon') return branding.value?.favicon_url ?? null
  return branding.value?.hero.background_url ?? null
}

function labelFor(slot: BrandingSlot): string {
  return SLOTS.find((entry) => entry.slot === slot)?.label ?? slot
}

async function upload(slot: BrandingSlot, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  saveError.value = ''
  busySlot.value = slot
  try {
    const form = new FormData()
    form.append('file', file)
    await $fetch(`/api/v1/admin/branding/${slot}`, { method: 'POST', body: form })
    await Promise.all([refresh(), refreshLiveBranding()])
    toast.success(`${labelFor(slot)} updated.`)
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    saveError.value = fetchError.data?.message ?? 'Could not upload the image.'
  } finally {
    busySlot.value = null
    // Lets the same file be picked again after a failure.
    input.value = ''
  }
}

async function clear(slot: BrandingSlot) {
  saveError.value = ''
  busySlot.value = slot
  try {
    await $fetch(`/api/v1/admin/branding/${slot}`, { method: 'DELETE' })
    await Promise.all([refresh(), refreshLiveBranding()])
    toast.info(`${labelFor(slot)} removed.`)
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    saveError.value = fetchError.data?.message ?? 'Could not remove the image.'
  } finally {
    busySlot.value = null
  }
}

/* -------------------------------------------------------- hero ---------- */

const heroForm = reactive({
  title: '',
  subtitle: '',
  overlay_color: '#000000',
  overlay_opacity: 0.5
})
const savingHero = ref(false)

watchEffect(() => {
  // Mirror what is stored, but never over the top of someone mid-edit.
  if (savingHero.value || !branding.value) return
  heroForm.title = branding.value.hero.title ?? ''
  heroForm.subtitle = branding.value.hero.subtitle ?? ''
  heroForm.overlay_color = branding.value.hero.overlay_color
  heroForm.overlay_opacity = branding.value.hero.overlay_opacity
})

async function saveHero() {
  saveError.value = ''
  savingHero.value = true
  try {
    await $fetch('/api/v1/admin/hero', {
      method: 'PATCH',
      body: {
        title: heroForm.title,
        subtitle: heroForm.subtitle,
        overlay_color: heroForm.overlay_color,
        // A range input hands back a string; the API takes a number.
        overlay_opacity: Number(heroForm.overlay_opacity)
      }
    })
    await Promise.all([refresh(), refreshLiveBranding()])
    toast.success('Landing hero updated.')
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    saveError.value = fetchError.data?.message ?? 'Could not update the landing hero.'
  } finally {
    savingHero.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <h1 class="text-2xl font-bold text-fg">Platform Branding</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Super admin only. The name and logo shown across the app and in every browser tab.
      </p>

      <div v-if="pending" class="mt-6 space-y-4">
        <div v-for="i in 3" :key="i" class="h-28 animate-pulse rounded-card bg-surface" />
      </div>

      <div v-else-if="notAuthorized" class="mt-6 rounded-card bg-danger/10 p-6 text-center">
        <p class="text-danger">Platform settings are limited to the SuperAdmin account.</p>
      </div>

      <UiErrorState
        v-else-if="error"
        class="mt-6"
        title="Could not load branding"
        message="The platform configuration could not be read."
        @retry="refresh()"
      />

      <div v-else class="mt-6 space-y-4">
        <p v-if="saveError" class="rounded-card bg-danger/10 px-4 py-3 text-body-2 text-danger">
          {{ saveError }}
        </p>

        <!-- Name -->
        <form class="rounded-card border border-border bg-surface p-4" @submit.prevent="saveName">
          <label for="app-name" class="block font-medium text-fg">Platform name</label>
          <p class="mt-1 text-body-2 text-fg-secondary">
            Leave empty to use the built-in name, {{ DEFAULT_APP_NAME }}.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <input
              id="app-name"
              v-model="nameInput"
              type="text"
              maxlength="60"
              :placeholder="DEFAULT_APP_NAME"
              class="min-w-0 flex-1 rounded-button border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              :disabled="savingName"
              class="rounded-button bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {{ savingName ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </form>

        <!-- Images -->
        <div
          v-for="entry in SLOTS"
          :key="entry.slot"
          class="rounded-card border border-border bg-surface p-4"
        >
          <p class="font-medium text-fg">{{ entry.label }}</p>
          <p class="mt-1 text-body-2 text-fg-secondary">{{ entry.hint }}</p>

          <div class="mt-3 flex flex-wrap items-center gap-4">
            <!-- Checkerboard-free: a logo with transparency is judged against the
                 surface it will actually sit on. -->
            <span
              class="flex h-16 w-16 shrink-0 items-center justify-center rounded-card border border-border bg-canvas"
            >
              <img
                v-if="urlFor(entry.slot)"
                :src="urlFor(entry.slot)!"
                :alt="`${entry.label} preview`"
                class="h-14 w-14 object-contain"
              />
              <span v-else class="text-caption text-fg-muted">None</span>
            </span>

            <label
              class="cursor-pointer rounded-button border border-border-strong px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2"
              :class="busySlot === entry.slot ? 'pointer-events-none opacity-50' : ''"
            >
              {{ busySlot === entry.slot ? 'Working…' : urlFor(entry.slot) ? 'Replace' : 'Upload' }}
              <input
                type="file"
                accept="image/png,image/jpeg"
                class="sr-only"
                :disabled="busySlot === entry.slot"
                @change="upload(entry.slot, $event)"
              />
            </label>

            <button
              v-if="urlFor(entry.slot)"
              type="button"
              :disabled="busySlot === entry.slot"
              class="text-body-2 text-fg-secondary underline-offset-4 hover:text-fg hover:underline disabled:opacity-50"
              @click="clear(entry.slot)"
            >
              Remove
            </button>
          </div>

          <p class="mt-3 text-caption text-fg-muted">PNG or JPEG, up to 50 MB.</p>
        </div>

        <!-- Hero copy. The image itself is the 'hero' slot above, so this card
             is only the words and the scrim that keeps them readable. -->
        <form class="rounded-card border border-border bg-surface p-4" @submit.prevent="saveHero">
          <p class="font-medium text-fg">Landing headline</p>
          <p class="mt-1 text-body-2 text-fg-secondary">
            Leave both empty to keep the built-in copy.
          </p>

          <div class="mt-3 space-y-3">
            <div>
              <label for="hero-title" class="mb-1.5 block text-caption text-fg-secondary">
                Headline
              </label>
              <input
                id="hero-title"
                v-model="heroForm.title"
                type="text"
                :maxlength="MAX_HERO_TITLE_LENGTH"
                placeholder="Play. Compete. Rise Up."
                class="w-full rounded-button border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
              >
            </div>

            <div>
              <label for="hero-subtitle" class="mb-1.5 block text-caption text-fg-secondary">
                Subheading
              </label>
              <textarea
                id="hero-subtitle"
                v-model="heroForm.subtitle"
                rows="2"
                :maxlength="MAX_HERO_SUBTITLE_LENGTH"
                placeholder="Track your rating, find tournaments, and connect with the pickleball community."
                class="w-full rounded-button border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
              />
            </div>

            <div class="flex flex-wrap items-end gap-4">
              <div>
                <label for="hero-overlay" class="mb-1.5 block text-caption text-fg-secondary">
                  Overlay colour
                </label>
                <input
                  id="hero-overlay"
                  v-model="heroForm.overlay_color"
                  type="color"
                  class="h-10 w-16 cursor-pointer rounded-button border border-border-strong bg-surface"
                >
              </div>
              <div class="min-w-[12rem] flex-1">
                <label for="hero-opacity" class="mb-1.5 block text-caption text-fg-secondary">
                  Overlay strength — {{ Math.round(Number(heroForm.overlay_opacity) * 100) }}%
                </label>
                <input
                  id="hero-opacity"
                  v-model="heroForm.overlay_opacity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  class="w-full accent-primary"
                >
              </div>
            </div>

            <p class="text-caption text-fg-muted">
              The headline sits on the overlay in white, so a darker, stronger overlay is what keeps
              it readable over a busy image. With no background image, only the words apply.
            </p>
          </div>

          <button
            type="submit"
            :disabled="savingHero"
            class="mt-4 rounded-button bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {{ savingHero ? 'Saving…' : 'Save headline' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
