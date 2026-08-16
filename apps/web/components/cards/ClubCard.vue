<script setup lang="ts">
interface Props {
  id: string
  name: string
  logoUrl?: string
  memberCount: number
  province?: string
  city?: string
  visibility?: 'public' | 'private'
  isMember?: boolean
  isPending?: boolean
}

const props = defineProps<Props>()

const location = computed(() => {
  if (props.city && props.province) return `${props.city}, ${props.province}`
  return props.province || props.city || null
})
</script>

<template>
  <NuxtLink
    :to="`/clubs/${id}`"
    class="group block rounded-card bg-surface p-4 shadow-card transition-all hover:shadow-card-hover hover:ring-1 hover:ring-primary/50"
  >
    <div class="flex items-start gap-4">
      <!-- Logo -->
      <div class="flex-shrink-0">
        <img
          v-if="logoUrl"
          :src="logoUrl"
          :alt="name"
          class="h-14 w-14 rounded-card object-cover"
        />
        <div
          v-else
          class="flex h-14 w-14 items-center justify-center rounded-card bg-surface-light text-xl font-bold text-text-secondary"
        >
          {{ name.charAt(0).toUpperCase() }}
        </div>
      </div>

      <!-- Info -->
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h3 class="truncate font-semibold text-text-primary group-hover:text-primary">
            {{ name }}
          </h3>
          <span
            v-if="visibility === 'private'"
            class="flex-shrink-0 rounded-badge bg-surface-light px-2 py-0.5 text-xs text-text-muted"
          >
            Private
          </span>
        </div>

        <p v-if="location" class="mt-1 truncate text-sm text-text-muted">
          {{ location }}
        </p>

        <div class="mt-2 flex items-center gap-3">
          <span class="flex items-center gap-1 text-sm text-text-secondary">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {{ memberCount }} members
          </span>

          <UiStatusPill v-if="isMember" status="active" size="sm" />
          <UiStatusPill v-else-if="isPending" status="pending" size="sm" />
        </div>
      </div>
    </div>
  </NuxtLink>
</template>
