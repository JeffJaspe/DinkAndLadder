<script setup lang="ts">
interface Props {
  id: string
  displayName: string
  avatarUrl?: string
  rating?: number
  rank?: number
  province?: string
  city?: string
  trend?: number
  isFollowing?: boolean
  showFollow?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showFollow: false
})

const emit = defineEmits<{
  follow: [playerId: string]
  unfollow: [playerId: string]
}>()

const location = computed(() => {
  if (props.city && props.province) return `${props.city}, ${props.province}`
  return props.province || props.city || null
})

function handleFollowClick() {
  if (props.isFollowing) {
    emit('unfollow', props.id)
  } else {
    emit('follow', props.id)
  }
}
</script>

<template>
  <NuxtLink
    :to="`/players/${id}`"
    class="group block rounded-card bg-surface p-4 shadow-card transition-all hover:shadow-card-hover hover:ring-1 hover:ring-primary/50"
  >
    <div class="flex items-start gap-4">
      <!-- Avatar -->
      <div class="relative flex-shrink-0">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="displayName"
          class="h-12 w-12 rounded-full object-cover"
        />
        <div
          v-else
          class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-light text-lg font-semibold text-text-secondary"
        >
          {{ displayName.charAt(0).toUpperCase() }}
        </div>
        <UiRankBadge
          v-if="rank && rank <= 10"
          :rank="rank"
          size="sm"
          class="absolute -bottom-1 -right-1"
        />
      </div>

      <!-- Info -->
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-text-primary group-hover:text-primary">
          {{ displayName }}
        </h3>
        <p v-if="location" class="mt-0.5 truncate text-sm text-text-muted">
          {{ location }}
        </p>

        <!-- Rating row -->
        <div v-if="rating" class="mt-2 flex items-center gap-3">
          <UiRatingBadge :rating="rating" size="sm" :show-tier="false" />
          <UiTrendIndicator v-if="trend !== undefined" :value="trend" size="sm" />
        </div>
      </div>

      <!-- Follow button -->
      <button
        v-if="showFollow"
        class="flex-shrink-0 rounded-button px-3 py-1.5 text-sm font-medium transition-colors"
        :class="isFollowing
          ? 'bg-surface-light text-text-secondary hover:bg-error/20 hover:text-error'
          : 'bg-primary text-white hover:bg-primary-light'"
        @click.prevent="handleFollowClick"
      >
        {{ isFollowing ? 'Unfollow' : 'Follow' }}
      </button>
    </div>
  </NuxtLink>
</template>
