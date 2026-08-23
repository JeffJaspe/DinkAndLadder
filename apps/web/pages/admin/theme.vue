<script setup lang="ts">
import type { ThemePaletteDto } from '~/server/domains/platform/dto/theme-palette.dto'

/**
 * SuperAdmin theme console (docs/30-SUPER-ADMIN-SPECIFICATION.md §2.2, revised).
 *
 * Pre-suggested palettes rather than colour pickers, and every palette shows
 * both its light and its dark counterpart — the two are different colours doing
 * the same job, not one colour dimmed.
 *
 * The catalog is data: rows in `theme_palettes`. Adding a palette is a seed row,
 * not a change to this page.
 */
definePageMeta({
  middleware: ['super-admin']
})

useHead({ title: 'Platform Theme' })

interface ThemeResponse {
  data: {
    palettes: ThemePaletteDto[]
    active_key: string | null
  }
}

const { data, pending, error, refresh } = await useFetch<ThemeResponse>('/api/v1/admin/theme')

const palettes = computed(() => data.value?.data.palettes ?? [])
const activeKey = computed(() => data.value?.data.active_key ?? null)

const notAuthorized = computed(() => (error.value as { statusCode?: number })?.statusCode === 403)

const savingKey = ref<string | null>(null)
const saveError = ref('')
const toast = useToast()

// The live page repaints from the same source, so applying a palette has to
// refetch it too — otherwise the admin picks a colour and the surrounding
// chrome keeps the old one until a hard reload.
const { refresh: refreshPalette } = useAsyncData(
  'platform:theme',
  () => $fetch<{ data: { css: string } }>('/api/v1/platform/theme'),
  { immediate: false }
)

async function apply(key: string | null) {
  if (savingKey.value) return
  saveError.value = ''
  savingKey.value = key ?? 'default'

  try {
    await $fetch('/api/v1/admin/theme', { method: 'PATCH', body: { key } })
    await Promise.all([refresh(), refreshPalette()])
    toast.success(
      key
        ? `Theme set to ${palettes.value.find((p) => p.key === key)?.name ?? key}.`
        : 'Theme reset to the default palette.'
    )
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    saveError.value = fetchError.data?.message ?? 'Could not change the theme.'
  } finally {
    savingKey.value = null
  }
}

/**
 * The two grounds a palette gets previewed against.
 *
 * These cannot be theme tokens: the point of the preview is showing both modes
 * on one page, so one of the two rows is always painting the colours of the
 * mode the viewer is not in. The values mirror --dnl-canvas and --dnl-fg-muted
 * for each mode in assets/css/tokens.css.
 */
const MODE_GROUND = {
  light: { background: '#F7F9F8', label: '#63706A' },
  dark: { background: '#0B0D09', label: '#A2B2AC' }
} as const

/** Swatch order for the preview strip — brand first, then the accent pair. */
const SWATCHES = ['primary', 'primary-hover', 'primary-soft', 'accent', 'on-accent'] as const

function swatchesFor(colors: Record<string, string | undefined>) {
  return SWATCHES.map((token) => ({ token, hex: colors[token] })).filter((s) => !!s.hex)
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <h1 class="text-2xl font-bold text-fg">Platform Theme</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Super admin only. Each palette ships a light and a dark counterpart — players keep their own
        light/dark choice, and this decides the brand colours inside it.
      </p>

      <!-- Loading -->
      <div v-if="pending" class="mt-6 grid gap-4 sm:grid-cols-2">
        <div v-for="i in 4" :key="i" class="h-44 animate-pulse rounded-card bg-surface" />
      </div>

      <div v-else-if="notAuthorized" class="mt-6 rounded-card bg-danger/10 p-6 text-center">
        <p class="text-danger">Platform settings are limited to the SuperAdmin account.</p>
      </div>

      <UiErrorState
        v-else-if="error"
        class="mt-6"
        title="Could not load theme palettes"
        message="The palette catalog could not be read."
        @retry="refresh()"
      />

      <!-- No rows: either nothing is seeded, or 024 has not run. Both mean the
           platform is painting its own tokens, which is worth saying plainly. -->
      <UiEmptyState
        v-else-if="!palettes.length"
        class="mt-6"
        compact
        icon="settings"
        title="No palettes available"
        message="The platform is using its built-in colours. Palettes are rows in the theme_palettes table."
      />

      <div v-else class="mt-6 space-y-4">
        <p v-if="saveError" class="rounded-card bg-danger/10 px-4 py-3 text-body-2 text-danger">
          {{ saveError }}
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <div
            v-for="palette in palettes"
            :key="palette.key"
            class="rounded-card border bg-surface p-4 transition-colors"
            :class="activeKey === palette.key ? 'border-primary' : 'border-border'"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-fg">{{ palette.name }}</p>
                <p v-if="palette.description" class="mt-1 text-body-2 text-fg-secondary">
                  {{ palette.description }}
                </p>
              </div>
              <span
                v-if="activeKey === palette.key"
                class="shrink-0 rounded-badge bg-primary/15 px-2 py-0.5 text-caption font-medium text-primary"
              >
                In use
              </span>
            </div>

            <!-- Both counterparts, side by side. A palette is only honest when
                 you can see what it does in the mode you are not currently in. -->
            <div class="mt-4 space-y-2">
              <div
                v-for="mode in ['light', 'dark'] as const"
                :key="mode"
                class="flex items-center gap-3 rounded-card px-3 py-2"
                :style="{ backgroundColor: MODE_GROUND[mode].background }"
              >
                <span
                  class="w-10 shrink-0 text-caption uppercase tracking-wide"
                  :style="{ color: MODE_GROUND[mode].label }"
                >
                  {{ mode }}
                </span>
                <span class="flex gap-1.5">
                  <span
                    v-for="swatch in swatchesFor(palette[mode])"
                    :key="swatch.token"
                    class="h-6 w-6 rounded-full border border-black/10"
                    :style="{ backgroundColor: swatch.hex }"
                    :title="`${swatch.token} ${swatch.hex}`"
                  />
                </span>
              </div>
            </div>

            <button
              type="button"
              :disabled="activeKey === palette.key || savingKey !== null"
              class="mt-4 w-full rounded-button bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
              @click="apply(palette.key)"
            >
              {{
                activeKey === palette.key
                  ? 'In use'
                  : savingKey === palette.key
                    ? 'Applying…'
                    : 'Use this palette'
              }}
            </button>
          </div>
        </div>

        <!-- Always reachable, including when a palette row was deleted under a
             live selection. -->
        <button
          v-if="activeKey"
          type="button"
          :disabled="savingKey !== null"
          class="text-body-2 text-fg-secondary underline-offset-4 hover:text-fg hover:underline disabled:opacity-50"
          @click="apply(null)"
        >
          Reset to the built-in colours
        </button>
      </div>
    </div>
  </div>
</template>
