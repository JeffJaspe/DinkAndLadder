<script setup lang="ts">
/**
 * App shell — desktop sidebar, mobile top bar, mobile bottom tab bar.
 *
 * Phase 4 of docs/33. Three things changed from the pre-token version:
 *
 * 1. ~15 inline `<svg>` blocks became `UiIcon`, so a nav item is one line and
 *    the same glyph cannot drift between the sidebar and the mobile drawer.
 * 2. The sidebar footer gained the user card from the mockup — avatar, name,
 *    rating, tier — because the mockup deliberately pins the user's standing to
 *    every screen; that is the product's core loop.
 * 3. The bottom bar respects `env(safe-area-inset-bottom)`; without it the bar
 *    sits under the iOS home indicator.
 */
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { PlayerRatingDto } from '~/server/domains/rating/dto/rating.dto'
import type { IconName } from '~/utils/icons'
import { formatRating, tierForRating } from '~/utils/rating-tiers'

const user = useSupabaseUser()
const route = useRoute()
const supabase = useSupabaseClient()
const { accountMode, activeClubId } = useAccountMode()

const sidebarOpen = ref(false)

// Every nav link in the drawer closes it on click, but the account switcher
// navigates from inside its own component (navigateTo, after an async check),
// so a click handler here would fire before the route actually changed — and on
// the "no club yet" path it changes to /create-club, not to the link's href.
// Closing on the settled route covers both, and any future in-drawer navigation.
watch(
  () => route.fullPath,
  () => {
    sidebarOpen.value = false
  }
)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me', {
  server: false
})

const { data: adminStatus } = await useFetch<{ is_superadmin: boolean }>(
  '/api/v1/me/is-superadmin',
  {
    server: false
  }
)

// Powers the sidebar user card. Deliberately not blocking: the shell must
// render even if the rating service is down.
const { data: myRatings } = await useFetch<{
  singles: PlayerRatingDto | null
  doubles: PlayerRatingDto | null
}>('/api/v1/players/me/ratings', { server: false })

const isSuperAdmin = computed(() => adminStatus.value?.is_superadmin ?? false)

const displayName = computed(
  () => myProfile.value?.display_name || user.value?.email?.split('@')[0] || 'User'
)

const singlesRating = computed(() => myRatings.value?.singles?.rating_value ?? null)
const tier = computed(() =>
  singlesRating.value === null ? null : tierForRating(singlesRating.value)
)

interface NavItem {
  name: string
  href: string
  icon: IconName
  /** Rendered as a count pill. Omitted, or 0, renders nothing. */
  badge?: number
}

/**
 * An incoming duo request used to be announced only by a notification row —
 * a place nobody is looking. Community carries the count wherever the nav is
 * visible, the way a friend request behaves everywhere else.
 */
const { incomingCount: partnerRequestCount } = usePartnerRequestCount()

// Player vs Club account mode changes what the sidebar nav shows — see
// composables/useAccountMode.ts and components/AccountSwitcher.vue.
const playerNavItems = computed<NavItem[]>(() => [
  { name: 'Feed', href: '/feed', icon: 'feed' },
  { name: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { name: 'Rankings', href: '/rankings', icon: 'rankings' },
  { name: 'Matches', href: '/matches', icon: 'matches' },
  { name: 'Events', href: '/events', icon: 'calendar' },
  { name: 'Community', href: '/community', icon: 'chat', badge: partnerRequestCount.value },
  { name: 'My Clubs', href: '/my-clubs', icon: 'clubs' },
  { name: 'Discover Clubs', href: '/clubs', icon: 'clubs' },
  { name: 'Players', href: '/players', icon: 'user' },
  { name: 'Achievements', href: '/achievements', icon: 'achievements' }
])

const clubNavItems = computed<NavItem[]>(() => [
  {
    name: 'Dashboard',
    href: activeClubId.value ? `/club/${activeClubId.value}/dashboard` : '/dashboard',
    icon: 'dashboard'
  },
  { name: 'Feed', href: '/feed', icon: 'feed' },
  { name: 'Ranking', href: '/rankings', icon: 'rankings' },
  { name: 'Matches', href: '/matches', icon: 'matches' },
  { name: 'Events', href: '/events', icon: 'calendar' },
  { name: 'Community', href: '/community', icon: 'chat', badge: partnerRequestCount.value },
  { name: 'Players', href: '/players', icon: 'user' },
  {
    name: 'Club Settings',
    href: activeClubId.value ? `/clubs/${activeClubId.value}` : '/my-clubs',
    icon: 'settings'
  }
])

const navItems = computed(() =>
  accountMode.value === 'club' ? clubNavItems.value : playerNavItems.value
)

// Settings is ordinary per-user configuration and is shown to everyone. The
// super-admin flag gates the one genuinely platform-wide screen instead.
//
// "Messages" from the mockup is deliberately absent: messaging is outside MVP
// scope (docs/03), and a nav item that goes nowhere is worse than none.
const bottomNavItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { name: 'Notifications', href: '/notifications', icon: 'bell' },
    { name: 'Settings', href: '/settings', icon: 'settings' }
  ]
  if (isSuperAdmin.value) {
    items.push({ name: 'Club Verification', href: '/admin/clubs/verification', icon: 'verified' })
    items.push({ name: 'Platform Features', href: '/admin/features', icon: 'settings' })
    items.push({ name: 'Platform Theme', href: '/admin/theme', icon: 'star' })
    items.push({ name: 'Platform Branding', href: '/admin/branding', icon: 'edit' })
  }
  return items
})

// The bottom bar keeps its five slots and its centred raised action: the duo
// badge rides the drawer and the desktop sidebar instead of displacing one of
// the primary mobile destinations. The badge markup below still works if a
// bottom-bar item is ever given a count.
const mobileNavItems = computed<NavItem[]>(() => [
  { name: 'Home', href: '/dashboard', icon: 'home' },
  { name: 'Rankings', href: '/rankings', icon: 'trophy' },
  { name: 'Matches', href: '/matches/submit', icon: 'plus' },
  { name: 'Events', href: '/events', icon: 'calendar' },
  { name: 'Profile', href: '/profile/edit', icon: 'user' }
])

function isActive(href: string) {
  return route.path === href || route.path.startsWith(href + '/')
}

async function handleLogout() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <!-- Desktop sidebar -->
    <aside
      v-if="user"
      class="fixed left-0 top-0 z-40 hidden h-screen w-52 border-r border-border bg-canvas lg:block"
    >
      <div class="flex h-full flex-col">
        <NuxtLink to="/dashboard" class="flex h-14 items-center gap-2 border-b border-border px-4">
          <UiBrandMark />
        </NuxtLink>

        <nav class="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          <NuxtLink
            v-for="item in navItems"
            :key="item.href"
            :to="item.href"
            class="flex items-center gap-3 rounded-button px-3 py-2 text-body-2 transition-colors"
            :class="
              isActive(item.href)
                ? 'bg-primary-soft text-primary'
                : 'text-fg-secondary hover:bg-surface-2 hover:text-fg'
            "
            :aria-current="isActive(item.href) ? 'page' : undefined"
          >
            <UiIcon :name="item.icon" />
            {{ item.name }}
            <span
              v-if="item.badge"
              class="ml-auto rounded-pill bg-primary px-1.5 py-0.5 text-caption font-semibold tabular-nums text-on-primary"
              :aria-label="`${item.badge} waiting`"
              >{{ item.badge }}</span
            >
          </NuxtLink>

          <div class="my-2 border-t border-border" />

          <NuxtLink
            v-for="item in bottomNavItems"
            :key="item.href"
            :to="item.href"
            class="flex items-center gap-3 rounded-button px-3 py-2 text-body-2 transition-colors"
            :class="
              isActive(item.href)
                ? 'bg-primary-soft text-primary'
                : 'text-fg-secondary hover:bg-surface-2 hover:text-fg'
            "
            :aria-current="isActive(item.href) ? 'page' : undefined"
          >
            <UiIcon :name="item.icon" />
            {{ item.name }}
          </NuxtLink>
        </nav>

        <!-- Account switcher — the only way into club mode.
             Its mount point was dropped by the theme pass (d985f6c) when the
             sidebar's three blocks were merged into a single <nav>; the
             component itself survived and was even retokenised in that same
             commit, so only this wrapper went missing. It renders its menu
             upward (`bottom-full`), which is why it belongs at the foot of the
             sidebar rather than inline in the nav list. -->
        <div class="border-t border-border px-2 py-3">
          <AccountSwitcher />
        </div>

        <!-- User card. The mockup pins identity and current rating to every
             screen — seeing your standing is the loop the product runs on. -->
        <div class="border-t border-border p-3">
          <NuxtLink
            to="/profile/edit"
            class="flex items-center gap-3 rounded-button p-2 transition-colors hover:bg-surface-2"
          >
            <UiAvatar :name="displayName" size="md" highlighted />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-body-2 font-medium text-fg">{{ displayName }}</span>
              <span v-if="singlesRating !== null" class="flex items-baseline gap-1.5">
                <span class="text-body-2 font-semibold tabular-nums text-fg">{{
                  formatRating(singlesRating)
                }}</span>
                <span v-if="tier" class="text-caption" :class="tier.textClass">{{
                  tier.name
                }}</span>
              </span>
              <span v-else class="block text-caption text-fg-muted">Unrated</span>
            </span>
          </NuxtLink>

          <div class="mt-2 flex items-center justify-between gap-2 px-2">
            <UiThemeToggle />
            <button
              class="flex items-center gap-2 rounded-button px-2 py-1.5 text-caption text-danger transition-colors hover:bg-danger/10"
              @click="handleLogout"
            >
              <UiIcon name="logout" size="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Mobile drawer -->
    <Teleport to="body">
      <div v-if="sidebarOpen && user" class="fixed inset-0 z-50 lg:hidden">
        <div class="absolute inset-0 bg-black/60" @click="sidebarOpen = false" />
        <aside class="absolute left-0 top-0 flex h-full w-64 flex-col bg-canvas">
          <div class="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <UiBrandMark />
            <button
              class="rounded p-2 text-fg-muted hover:text-fg"
              aria-label="Close menu"
              @click="sidebarOpen = false"
            >
              <UiIcon name="x" :stroke-width="2" />
            </button>
          </div>

          <nav class="flex-1 space-y-0.5 overflow-y-auto p-2">
            <NuxtLink
              v-for="item in [...navItems, ...bottomNavItems]"
              :key="item.href"
              :to="item.href"
              class="flex items-center gap-3 rounded-button px-3 py-2.5 text-body-2 transition-colors"
              :class="
                isActive(item.href)
                  ? 'bg-primary-soft text-primary'
                  : 'text-fg-secondary hover:bg-surface-2 hover:text-fg'
              "
              @click="sidebarOpen = false"
            >
              <UiIcon :name="item.icon" />
              {{ item.name }}
              <span
                v-if="item.badge"
                class="ml-auto rounded-pill bg-primary px-1.5 py-0.5 text-caption font-semibold tabular-nums text-on-primary"
                :aria-label="`${item.badge} waiting`"
                >{{ item.badge }}</span
              >
            </NuxtLink>
          </nav>

          <!-- Account switcher, mobile. The desktop sidebar is not a fallback
               here: this is a mobile-first product, and club mode was
               previously unreachable on a phone entirely. Same component, so
               the two stay in step; its menu opens upward, which is why it
               sits in the drawer's footer rather than above the nav list. -->
          <div class="shrink-0 border-t border-border px-3 pb-1 pt-3">
            <AccountSwitcher />
          </div>

          <div class="shrink-0 border-t border-border p-3">
            <div class="mb-2 flex items-center justify-between px-1">
              <span class="text-caption text-fg-muted">Appearance</span>
              <UiThemeToggle size="sm" />
            </div>
            <button
              class="flex w-full items-center gap-3 rounded-button px-3 py-2.5 text-body-2 text-danger transition-colors hover:bg-danger/10"
              @click="handleLogout"
            >
              <UiIcon name="logout" />
              Log out
            </button>
          </div>
        </aside>
      </div>
    </Teleport>

    <!-- Mobile header -->
    <header
      v-if="user"
      class="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-canvas px-4 lg:hidden"
    >
      <button
        class="rounded-button p-2 text-fg-muted hover:bg-surface-2 hover:text-fg"
        aria-label="Open menu"
        @click="sidebarOpen = true"
      >
        <UiIcon name="menu" :stroke-width="2" />
      </button>
      <NuxtLink to="/dashboard" class="flex items-center gap-2">
        <UiBrandMark size="sm" />
      </NuxtLink>
      <NuxtLink
        to="/notifications"
        class="rounded-button p-2 text-fg-muted hover:bg-surface-2 hover:text-fg"
        aria-label="Notifications"
      >
        <UiIcon name="bell" />
      </NuxtLink>
    </header>

    <!-- Mobile bottom tab bar -->
    <nav
      v-if="user"
      class="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-canvas pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
    >
      <div class="flex h-16 items-center justify-around">
        <NuxtLink
          v-for="item in mobileNavItems"
          :key="item.href"
          :to="item.href"
          class="flex min-w-[44px] flex-col items-center gap-0.5 px-3 py-2"
          :class="isActive(item.href) ? 'text-primary' : 'text-fg-muted'"
          :aria-current="isActive(item.href) ? 'page' : undefined"
        >
          <!-- The raised centre action, straight from the mobile mockup. -->
          <span
            v-if="item.icon === 'plus'"
            class="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary shadow-card"
          >
            <UiIcon name="plus" :stroke-width="2.5" />
          </span>
          <template v-else>
            <span class="relative">
              <UiIcon :name="item.icon" />
              <span
                v-if="item.badge"
                class="absolute -right-1.5 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-pill bg-primary px-1 text-[10px] font-semibold tabular-nums text-on-primary"
                :aria-label="`${item.badge} waiting`"
                >{{ item.badge }}</span
              >
            </span>
            <span class="text-[10px]">{{ item.name }}</span>
          </template>
        </NuxtLink>
      </div>
    </nav>

    <!-- Public header. Suppressed on the landing page, which ships its own
         marketing header — rendering both put two "Log in" links on / and made
         every role-based locator ambiguous. -->
    <header
      v-if="!user && route.path !== '/'"
      class="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-canvas px-4 lg:px-8"
    >
      <NuxtLink to="/" class="flex items-center gap-2">
        <UiBrandMark />
      </NuxtLink>
      <div class="flex items-center gap-2">
        <UiThemeToggle size="sm" />
        <UiButton to="/login" variant="ghost" size="sm">Log in</UiButton>
        <UiButton to="/register" size="sm">Sign up</UiButton>
      </div>
    </header>

    <main
      :class="{
        'pt-14 lg:pl-52 lg:pt-0': user,
        'pt-14': !user && route.path !== '/',
        'pb-20 lg:pb-0': user
      }"
    >
      <slot />
    </main>

    <!-- One toast host for the whole app; `useToast()` feeds it. -->
    <UiToaster />
  </div>
</template>
