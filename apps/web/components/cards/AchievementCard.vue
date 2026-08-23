<script setup lang="ts">
interface Props {
  id: string
  name: string
  description: string
  icon?: string
  category: string
  points: number
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  progress?: number
  progressMax?: number
  unlockedAt?: string
}

const props = defineProps<Props>()

const isUnlocked = computed(() => !!props.unlockedAt)

const progressPercent = computed(() => {
  if (!props.progress || !props.progressMax) return 0
  return Math.min(100, (props.progress / props.progressMax) * 100)
})

const rarityColors: Record<string, string> = {
  common: 'text-fg',
  uncommon: 'text-success',
  rare: 'text-info',
  epic: 'text-accent',
  legendary: 'text-rating-gold'
}

const rarityBg: Record<string, string> = {
  common: 'bg-surface-3',
  uncommon: 'bg-success/10',
  rare: 'bg-info/10',
  epic: 'bg-accent/10',
  legendary: 'bg-rating-gold/10'
}
</script>

<template>
  <div
    class="rounded-card p-4 transition-all"
    :class="[
      isUnlocked ? 'bg-surface shadow-card' : 'bg-surface/50 opacity-60',
      isUnlocked && rarity === 'legendary' ? 'ring-1 ring-rating-gold/50' : ''
    ]"
  >
    <div class="flex items-start gap-4">
      <!-- Icon -->
      <div
        class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-card text-2xl"
        :class="rarityBg[rarity || 'common']"
      >
        {{ icon || '🏆' }}
      </div>

      <!-- Content -->
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold text-fg-secondary">{{ name }}</h3>
          <span
            class="flex-shrink-0 rounded-badge px-2 py-0.5 text-xs font-medium"
            :class="rarityColors[rarity || 'common']"
          >
            +{{ points }} pts
          </span>
        </div>

        <p class="mt-1 text-sm text-fg-muted">{{ description }}</p>

        <!-- Progress bar -->
        <div v-if="!isUnlocked && progressMax" class="mt-3">
          <div class="flex items-center justify-between text-xs text-fg-muted">
            <span>Progress</span>
            <span>{{ progress || 0 }} / {{ progressMax }}</span>
          </div>
          <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              class="h-full rounded-full bg-primary transition-all"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
        </div>

        <!-- Unlocked date -->
        <p v-if="isUnlocked && unlockedAt" class="mt-2 text-xs text-fg-muted">
          Unlocked {{ new Date(unlockedAt).toLocaleDateString() }}
        </p>
      </div>
    </div>
  </div>
</template>
