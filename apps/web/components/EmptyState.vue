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
  <div class="flex flex-col items-center justify-center rounded-xl bg-[#1E2E2A] px-6 py-12 text-center">
    <div v-if="icon" class="mb-4 text-5xl">
      {{ icon }}
    </div>
    <h3 class="text-lg font-semibold text-white">{{ title }}</h3>
    <p v-if="description" class="mt-2 max-w-sm text-sm text-[#6B7B75]">
      {{ description }}
    </p>
    <NuxtLink
      v-if="actionLabel && actionTo"
      :to="actionTo"
      class="mt-6 rounded-lg bg-[#4DB175] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5FC287]"
    >
      {{ actionLabel }}
    </NuxtLink>
    <button
      v-else-if="actionLabel"
      type="button"
      class="mt-6 rounded-lg bg-[#4DB175] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5FC287]"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>
