<script setup lang="ts">
// No super-admin gate: with API keys and webhooks removed (out of MVP scope —
// see /docs/03-MVP-SCOPE.md), everything left here is ordinary per-user settings.
import type { IconName } from '~/utils/icons'

useHead({ title: 'Settings' })

const settingsLinks: { title: string; description: string; href: string; icon: IconName }[] = [
  {
    title: 'Profile',
    description: 'Edit your display name, bio, and preferences',
    href: '/profile/edit',
    icon: 'user'
  },
  {
    title: 'Notifications',
    description: 'Manage your notification preferences',
    href: '/notifications',
    icon: 'bell'
  }
]

/**
 * Appearance lives here as a three-way control, not the sidebar's two-position
 * switch. A durable preference belongs in Settings, and this is the only
 * surface where `system` — follow the OS — can actually be expressed
 * (docs/33 §3.5).
 */
const { preference, resolvedTheme, setTheme } = useTheme()

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconName; hint: string }[] = [
  { value: 'light', label: 'Light', icon: 'sun', hint: 'Always light' },
  { value: 'dark', label: 'Dark', icon: 'moon', hint: 'Always dark' },
  { value: 'system', label: 'System', icon: 'settings', hint: 'Match your device' }
]
</script>

<template>
  <div class="page-shell px-4 py-6 lg:px-6">
    <div class="mx-auto max-w-2xl">
      <h1 class="mb-6 font-display text-heading-1 text-fg">Settings</h1>

      <section class="mb-6">
        <h2 class="mb-2 text-caption font-semibold uppercase tracking-wide text-fg-muted">
          Appearance
        </h2>

        <div class="rounded-card border border-border bg-surface p-4 shadow-card">
          <div class="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
            <button
              v-for="option in THEME_OPTIONS"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="preference === option.value"
              class="flex flex-col items-center gap-1.5 rounded-button border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :class="
                preference === option.value
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border text-fg-secondary hover:border-border-strong hover:bg-surface-2 hover:text-fg'
              "
              @click="setTheme(option.value)"
            >
              <UiIcon :name="option.icon" size="h-5 w-5" />
              <span class="text-body-2 font-medium">{{ option.label }}</span>
              <span class="text-caption text-fg-muted">{{ option.hint }}</span>
            </button>
          </div>

          <p class="mt-3 text-caption text-fg-muted">
            Currently showing <strong class="text-fg">{{ resolvedTheme }}</strong
            >. Your choice is saved to this browser and applies the moment a page loads.
          </p>
        </div>
      </section>

      <section>
        <h2 class="mb-2 text-caption font-semibold uppercase tracking-wide text-fg-muted">
          Account
        </h2>

        <div class="space-y-3">
          <NuxtLink
            v-for="link in settingsLinks"
            :key="link.href"
            :to="link.href"
            class="flex items-center gap-4 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-2 shadow-card hover:shadow-card-hover"
          >
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-surface-2 text-fg-secondary"
            >
              <UiIcon :name="link.icon" />
            </span>
            <span class="flex-1">
              <span class="block font-medium text-fg">{{ link.title }}</span>
              <span class="mt-0.5 block text-body-2 text-fg-muted">{{ link.description }}</span>
            </span>
            <UiIcon name="chevron-right" class="text-fg-muted" />
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
