<script setup lang="ts">
const settingsLinks = [
  {
    title: 'Profile',
    description: 'Edit your display name, bio, and preferences',
    href: '/profile/edit',
    icon: 'user'
  },
  {
    title: 'API Keys',
    description: 'Manage API keys for programmatic access',
    href: '/settings/api-keys',
    icon: 'key'
  },
  {
    title: 'Webhooks',
    description: 'Configure webhooks to receive event notifications',
    href: '/settings/webhooks',
    icon: 'webhook'
  },
  {
    title: 'Notifications',
    description: 'Manage your notification preferences',
    href: '/notifications',
    icon: 'bell'
  }
]
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <h1 class="mb-6 text-2xl font-bold text-white">Settings</h1>

      <div class="space-y-3">
        <NuxtLink
          v-for="link in settingsLinks"
          :key="link.href"
          :to="link.href"
          class="flex items-center gap-4 rounded-xl bg-[#1E2E2A] p-4 transition-all hover:bg-[#2E4540]"
        >
          <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#2E4540]">
            <svg v-if="link.icon === 'user'" class="h-5 w-5 text-[#A6ABA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <svg v-else-if="link.icon === 'key'" class="h-5 w-5 text-[#A6ABA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <svg v-else-if="link.icon === 'webhook'" class="h-5 w-5 text-[#A6ABA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <svg v-else-if="link.icon === 'bell'" class="h-5 w-5 text-[#A6ABA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div class="flex-1">
            <h2 class="font-medium text-white">{{ link.title }}</h2>
            <p class="mt-0.5 text-sm text-[#6B7B75]">{{ link.description }}</p>
          </div>
          <svg class="h-5 w-5 text-[#6B7B75]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
