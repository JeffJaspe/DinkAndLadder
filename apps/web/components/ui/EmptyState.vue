<script setup lang="ts">
interface Props {
  icon?: string
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
}

defineProps<Props>()

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <!-- Icon -->
    <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface text-3xl">
      {{ icon || '📭' }}
    </div>

    <!-- Title -->
    <h3 class="text-lg font-semibold text-text-primary">{{ title }}</h3>

    <!-- Description -->
    <p v-if="description" class="mt-2 max-w-sm text-sm text-text-muted">
      {{ description }}
    </p>

    <!-- Action -->
    <NuxtLink
      v-if="actionLabel && actionTo"
      :to="actionTo"
      class="mt-6 rounded-button bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-light"
    >
      {{ actionLabel }}
    </NuxtLink>
    <button
      v-else-if="actionLabel"
      class="mt-6 rounded-button bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-light"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>
