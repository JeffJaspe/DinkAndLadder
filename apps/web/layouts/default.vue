<script setup lang="ts">
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

const user = useSupabaseUser()
const route = useRoute()
const supabase = useSupabaseClient()
const { accountMode, activeClubId } = useAccountMode()

const sidebarOpen = ref(false)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me', {
  server: false
})

const { data: adminStatus } = await useFetch<{ is_superadmin: boolean }>('/api/v1/me/is-superadmin', {
  server: false
})

const isSuperAdmin = computed(() => adminStatus.value?.is_superadmin ?? false)

async function handleLogout() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}

// Player vs Club account mode changes what the sidebar nav shows — see
// composables/useAccountMode.ts and components/AccountSwitcher.vue.
const playerNavItems = [
  { name: 'Feed', href: '/feed', icon: 'feed' },
  { name: 'Kitchen', href: '/dashboard', icon: 'dashboard' },
  { name: 'Matches', href: '/matches/submit', icon: 'matches' },
  { name: 'Events', href: '/events', icon: 'events' },
  { name: 'Partners', href: '/partners', icon: 'partners' },
  { name: 'Community', href: '/community', icon: 'community' },
  { name: 'My Clubs', href: '/my-clubs', icon: 'clubs' },
  { name: 'Verified Clubs', href: '/verified-clubs', icon: 'verified' },
  { name: 'Players', href: '/players', icon: 'players' },
  { name: 'Achievements', href: '/achievements', icon: 'achievements' }
]

const clubNavItems = computed(() => [
  { name: 'Kitchen', href: activeClubId.value ? `/club/${activeClubId.value}/dashboard` : '/dashboard', icon: 'dashboard' },
  { name: 'Feed', href: '/feed', icon: 'feed' },
  { name: 'Ranking', href: '/rankings', icon: 'rankings' },
  { name: 'Matches', href: '/matches/submit', icon: 'matches' },
  { name: 'Events', href: '/events', icon: 'events' },
  { name: 'Community', href: '/community', icon: 'community' },
  { name: 'Players', href: '/players', icon: 'players' },
  {
    name: 'Club Settings',
    href: activeClubId.value ? `/clubs/${activeClubId.value}` : '/my-clubs',
    icon: 'club-settings'
  }
])

const navItems = computed(() => (accountMode.value === 'club' ? clubNavItems.value : playerNavItems))

const bottomNavItems = computed(() => {
  const items = [{ name: 'Notifications', href: '/notifications', icon: 'notifications' }]
  if (isSuperAdmin.value) {
    items.push({ name: 'Settings', href: '/settings', icon: 'settings' })
  }
  return items
})

const mobileNavItems = [
  { name: 'Home', href: '/dashboard', icon: 'home' },
  { name: 'Rankings', href: '/rankings', icon: 'trophy' },
  { name: 'Matches', href: '/matches/submit', icon: 'plus' },
  { name: 'Events', href: '/events', icon: 'calendar' },
  { name: 'Profile', href: '/profile/edit', icon: 'user' }
]

function isActive(href: string) {
  return route.path === href || route.path.startsWith(href + '/')
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09]">
    <!-- Desktop Sidebar -->
    <aside
      v-if="user"
      class="fixed left-0 top-0 z-40 hidden h-screen w-52 border-r border-[#2E4540]/50 bg-[#0B0D09] lg:block"
    >
      <div class="flex h-full flex-col">
        <!-- Logo -->
        <div class="flex h-14 items-center gap-2 border-b border-[#2E4540]/50 px-4">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4DB175]">
            <span class="text-sm font-bold text-white">D</span>
          </div>
          <span class="text-sm font-semibold text-white">DinkAndLadder</span>
        </div>

        <!-- Main Navigation -->
        <nav class="flex-1 space-y-0.5 px-2 py-3">
          <NuxtLink
            v-for="item in navItems"
            :key="item.href"
            :to="item.href"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
            :class="isActive(item.href)
              ? 'bg-[#4DB175]/20 text-[#4DB175]'
              : 'text-[#A6ABA7] hover:bg-[#2E4540]/30 hover:text-white'"
          >
            <!-- Icons -->
            <svg v-if="item.icon === 'dashboard'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" />
            </svg>
            <svg v-else-if="item.icon === 'rankings'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <svg v-else-if="item.icon === 'matches'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            <svg v-else-if="item.icon === 'clubs'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <svg v-else-if="item.icon === 'events'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <svg v-else-if="item.icon === 'feed'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            <svg v-else-if="item.icon === 'achievements'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <svg v-else-if="item.icon === 'players'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <svg v-else-if="item.icon === 'partners'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m3-2.803a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <svg v-else-if="item.icon === 'community'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <svg v-else-if="item.icon === 'verified'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <svg v-else-if="item.icon === 'club-settings'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.4 5.6l1.4-1.4M4.6 5.6L3.2 4.2" />
            </svg>
            {{ item.name }}
          </NuxtLink>
        </nav>

        <!-- Account Switcher -->
        <div v-if="user" class="border-t border-[#2E4540]/50 px-2 py-3">
          <AccountSwitcher />
        </div>

        <!-- Bottom Navigation -->
        <div class="border-t border-[#2E4540]/50 px-2 py-3">
          <NuxtLink
            v-for="item in bottomNavItems"
            :key="item.href"
            :to="item.href"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
            :class="isActive(item.href)
              ? 'bg-[#4DB175]/20 text-[#4DB175]'
              : 'text-[#A6ABA7] hover:bg-[#2E4540]/30 hover:text-white'"
          >
            <svg v-if="item.icon === 'notifications'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <svg v-else-if="item.icon === 'messages'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <svg v-else-if="item.icon === 'settings'" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {{ item.name }}
          </NuxtLink>
        </div>

        <!-- User Profile Section -->
        <div class="border-t border-[#2E4540]/50 p-3">
          <NuxtLink
            to="/profile/edit"
            class="flex items-center gap-3 rounded-lg p-2 hover:bg-[#2E4540]/30"
          >
            <div class="relative">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-white ring-2 ring-[#4DB175]">
                {{ myProfile?.display_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U' }}
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <p class="truncate text-sm font-medium text-white">{{ myProfile?.display_name || user?.email?.split('@')[0] || 'User' }}</p>
              <p class="text-xs text-[#6B7B75]">View profile</p>
            </div>
          </NuxtLink>

          <!-- Logout Button -->
          <button
            class="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
            @click="handleLogout"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Log out
          </button>
        </div>
      </div>
    </aside>

    <!-- Mobile sidebar overlay -->
    <Teleport to="body">
      <div
        v-if="sidebarOpen && user"
        class="fixed inset-0 z-50 lg:hidden"
      >
        <div class="absolute inset-0 bg-black/60" @click="sidebarOpen = false" />
        <aside class="absolute left-0 top-0 h-full w-64 bg-[#0B0D09]">
          <div class="flex h-14 items-center justify-between border-b border-[#2E4540]/50 px-4">
            <span class="font-semibold text-white">DinkAndLadder</span>
            <button class="p-2 text-[#6B7B75]" @click="sidebarOpen = false">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav class="flex-1 space-y-0.5 p-2">
            <NuxtLink
              v-for="item in [...navItems, ...bottomNavItems]"
              :key="item.href"
              :to="item.href"
              class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
              :class="isActive(item.href)
                ? 'bg-[#4DB175]/20 text-[#4DB175]'
                : 'text-[#A6ABA7] hover:bg-[#2E4540]/30'"
              @click="sidebarOpen = false"
            >
              {{ item.name }}
            </NuxtLink>
          </nav>

          <!-- Mobile Logout -->
          <div class="border-t border-[#2E4540]/50 p-3">
            <button
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10"
              @click="handleLogout"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Log out
            </button>
          </div>
        </aside>
      </div>
    </Teleport>

    <!-- Mobile Header -->
    <header
      v-if="user"
      class="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-[#2E4540]/50 bg-[#0B0D09] px-4 lg:hidden"
    >
      <button
        class="rounded-lg p-2 text-[#6B7B75] hover:bg-[#2E4540]/30"
        @click="sidebarOpen = true"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div class="flex items-center gap-2">
        <div class="h-7 w-7 rounded-lg bg-[#4DB175]" />
        <span class="text-sm font-semibold text-white">DinkAndLadder</span>
      </div>
      <NuxtLink to="/notifications" class="rounded-lg p-2 text-[#6B7B75] hover:bg-[#2E4540]/30">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </NuxtLink>
    </header>

    <!-- Mobile bottom navigation -->
    <nav
      v-if="user"
      class="fixed bottom-0 left-0 right-0 z-30 border-t border-[#2E4540]/50 bg-[#0B0D09] lg:hidden"
    >
      <div class="flex h-16 items-center justify-around">
        <NuxtLink
          v-for="item in mobileNavItems"
          :key="item.href"
          :to="item.href"
          class="flex flex-col items-center gap-0.5 px-3 py-2"
          :class="isActive(item.href) ? 'text-[#4DB175]' : 'text-[#6B7B75]'"
        >
          <div
            v-if="item.icon === 'plus'"
            class="flex h-10 w-10 items-center justify-center rounded-full bg-[#4DB175] text-white"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <template v-else>
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                v-if="item.icon === 'home'"
                stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
              <path
                v-else-if="item.icon === 'trophy'"
                stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
              />
              <path
                v-else-if="item.icon === 'calendar'"
                stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
              <path
                v-else-if="item.icon === 'user'"
                stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span class="text-[10px]">{{ item.name }}</span>
          </template>
        </NuxtLink>
      </div>
    </nav>

    <!-- Public Header (non-authenticated) -->
    <header
      v-if="!user"
      class="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-[#2E4540]/50 bg-[#0B0D09] px-4 lg:px-8"
    >
      <NuxtLink to="/" class="flex items-center gap-2">
        <div class="h-8 w-8 rounded-lg bg-[#4DB175]" />
        <span class="font-semibold text-white">DinkAndLadder</span>
      </NuxtLink>
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/login"
          class="rounded-lg px-4 py-2 text-sm font-medium text-[#A6ABA7] hover:text-white"
        >
          Log in
        </NuxtLink>
        <NuxtLink
          to="/register"
          class="rounded-lg bg-[#4DB175] px-4 py-2 text-sm font-medium text-white hover:bg-[#5FC287]"
        >
          Sign up
        </NuxtLink>
      </div>
    </header>

    <!-- Main content -->
    <main
      :class="{
        'pt-14 lg:pl-52 lg:pt-0': user,
        'pt-14': !user,
        'pb-20 lg:pb-0': user
      }"
    >
      <slot />
    </main>
  </div>
</template>
