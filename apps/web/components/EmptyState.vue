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
  <div class="flex flex-col items-center justify-center rounded-xl bg-surface px-6 py-12 text-center">
    <div v-if="icon" class="mb-4 text-5xl">
      {{ icon }}
    </div>
    <h3 class="text-lg font-semibold text-fg">{{ title }}</h3>
    <p v-if="description" class="mt-2 max-w-sm text-sm text-fg-muted">
      {{ description }}
    </p>
    <NuxtLink
      v-if="actionLabel && actionTo"
      :to="actionTo"
      class="mt-6 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
    >
      {{ actionLabel }}
    </NuxtLink>
    <button
      v-else-if="actionLabel"
      type="button"
      class="mt-6 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>
