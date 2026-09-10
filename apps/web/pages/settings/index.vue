<script setup lang="ts">
import type { IconName } from '~/utils/icons'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

useHead({ title: 'Settings' })

const supabase = useSupabaseClient()

// server: false — the shell already asks for this on the client, so the two
// share a payload rather than blocking the settings page on its own round trip.
const { data: myProfile } = useFetch<PlayerProfileDto>('/api/v1/players/me', {
  server: false,
  ignoreResponseError: true
})

const { data: adminStatus } = useFetch<{ is_superadmin: boolean }>('/api/v1/me/is-superadmin', {
  server: false
})
const isSuperAdmin = computed(() => adminStatus.value?.is_superadmin ?? false)

interface SettingsLink {
  title: string
  description: string
  href: string
  icon: IconName
}

/**
 * "Your public profile" is here because there was no route to it from anywhere
 * a player owns: the sidebar card and the mobile tab both go to the *editor*,
 * so the only way to see what everyone else sees was to find yourself in a list.
 */
const accountLinks = computed<SettingsLink[]>(() => {
  const links: SettingsLink[] = [
    {
      title: 'Profile',
      description: 'Your photo, name, bio, location and privacy',
      href: '/profile/edit',
      icon: 'user'
    }
  ]
  if (myProfile.value?.id) {
    links.push({
      title: 'Your public profile',
      description: 'See exactly what other players see',
      href: `/players/${myProfile.value.id}`,
      icon: 'players'
    })
  }
  links.push(
    {
      title: 'Sign-in methods',
      description: 'Google and password — both open the same account',
      href: '/settings/security',
      icon: 'verified'
    },
    {
      title: 'Notifications',
      description: 'What you have been told about, and what is waiting',
      href: '/notifications',
      icon: 'bell'
    }
  )
  return links
})

/**
 * Platform administration.
 *
 * Mirrors the block in the app nav (components/AdminNavGroup.vue) and exists
 * for the same reason: these screens change the product for every user, and
 * nothing on this page previously distinguished them from a personal
 * preference. Access is enforced by each page's `super-admin` middleware and by
 * the endpoints behind them; this flag only decides what is drawn.
 */
const adminLinks: SettingsLink[] = [
  {
    title: 'Reports',
    description: 'Moderation queue for reported people and content',
    href: '/admin/reports',
    icon: 'alert'
  },
  {
    title: 'Club verification',
    description: 'Review and grant verified status to clubs',
    href: '/admin/clubs/verification',
    icon: 'verified'
  },
  {
    title: 'Feature flags',
    description: 'Turn platform features on and off for everyone',
    href: '/admin/features',
    icon: 'settings'
  },
  {
    title: 'Fees & payments',
    description: 'The convenience fee applied to paid registrations',
    href: '/admin/fees',
    icon: 'stats'
  },
  {
    title: 'Theme',
    description: 'Platform colours and the default appearance',
    href: '/admin/theme',
    icon: 'sun'
  },
  {
    title: 'Branding',
    description: 'App name, logo, favicon and landing artwork',
    href: '/admin/branding',
    icon: 'image'
  },
  {
    title: 'Sponsors',
    description: 'Sponsor logos shown on the landing page',
    href: '/admin/sponsors',
    icon: 'star'
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

/**
 * Signing out was reachable only from the desktop sidebar footer and the mobile
 * drawer — never from Settings, which is the first place anyone looks for it.
 */
const confirmSignOut = ref(false)
const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="page-shell px-4 py-6 lg:px-6">
    <div class="mx-auto max-w-2xl">
      <h1 class="mb-6 font-display text-heading-1 text-fg">Settings</h1>

      <section class="mb-6">
        <h2 class="mb-2 text-caption font-semibold uppercase tracking-widest text-fg-muted">
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

      <section class="mb-6">
        <h2 class="mb-2 text-caption font-semibold uppercase tracking-widest text-fg-muted">
          Account
        </h2>

        <div class="space-y-3">
          <NuxtLink
            v-for="link in accountLinks"
            :key="link.href"
            :to="link.href"
            class="flex items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:bg-surface-2 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-surface-2 text-fg-secondary"
            >
              <UiIcon :name="link.icon" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-medium text-fg">{{ link.title }}</span>
              <span class="mt-0.5 block text-body-2 text-fg-muted">{{ link.description }}</span>
            </span>
            <UiIcon name="chevron-right" class="shrink-0 text-fg-muted" />
          </NuxtLink>
        </div>
      </section>

      <!-- Platform admin. Drawn on its own ground, under a heading that names
           who can see it, so it can never be mistaken for a personal setting. -->
      <section v-if="isSuperAdmin" class="mb-6">
        <div class="overflow-hidden rounded-card border border-border-strong bg-surface-2">
          <div class="flex items-center gap-3 px-4 py-3">
            <UiIcon name="shield" size="h-5 w-5" class="shrink-0 text-fg-secondary" />
            <div class="min-w-0">
              <h2 class="text-caption font-semibold uppercase tracking-widest text-fg-secondary">
                Platform admin
              </h2>
              <p class="mt-0.5 text-caption text-fg-muted">
                Only you can see this. Changes here affect everyone on DinkAndLadder.
              </p>
            </div>
          </div>

          <div class="border-t border-border-strong">
            <NuxtLink
              v-for="link in adminLinks"
              :key="link.href"
              :to="link.href"
              class="flex items-center gap-4 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-button bg-surface text-fg-secondary"
              >
                <UiIcon :name="link.icon" size="h-4 w-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-body-2 font-medium text-fg">{{ link.title }}</span>
                <span class="mt-0.5 block text-caption text-fg-muted">{{ link.description }}</span>
              </span>
              <UiIcon name="chevron-right" size="h-4 w-4" class="shrink-0 text-fg-muted" />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section>
        <h2 class="mb-2 text-caption font-semibold uppercase tracking-widest text-fg-muted">
          Session
        </h2>
        <div class="rounded-card border border-border bg-surface p-4 shadow-card">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-body-2 text-fg-secondary">
              Signing out ends this session on this device only.
            </p>
            <UiButton variant="danger" size="sm" @click="confirmSignOut = true">
              <UiIcon name="logout" size="h-4 w-4" />
              Sign out
            </UiButton>
          </div>
        </div>
      </section>
    </div>

    <UiModal
      v-model="confirmSignOut"
      title="Sign out?"
      description="You will need to sign in again on this device. Nothing on your account changes."
      confirm-label="Sign out"
      destructive
      :loading="signingOut"
      @confirm="signOut"
    />
  </div>
</template>
