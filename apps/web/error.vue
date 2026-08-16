<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const handleError = () => clearError({ redirect: '/' })

const errorConfig = computed(() => {
  const statusCode = props.error?.statusCode || 500

  if (statusCode === 404) {
    return {
      icon: '🔍',
      title: 'Page Not Found',
      description: "The page you're looking for doesn't exist or has been moved.",
      actionLabel: 'Go Home',
      actionTo: '/'
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      icon: '🔒',
      title: 'Access Denied',
      description: 'You need to sign in to access this page.',
      actionLabel: 'Sign In',
      actionTo: '/login'
    }
  }

  return {
    icon: '⚠️',
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred. Please try again.',
    actionLabel: 'Go Home',
    actionTo: '/'
  }
})
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-[#0B0D09] px-4 py-12">
    <div class="w-full max-w-md text-center">
      <!-- Logo -->
      <div class="mb-8">
        <NuxtLink to="/" class="inline-flex items-center gap-2">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4DB175] text-xl font-bold text-white">
            D
          </div>
        </NuxtLink>
      </div>

      <!-- Error Card -->
      <div class="rounded-xl bg-[#1E2E2A] p-8">
        <!-- Icon -->
        <div class="mb-4 text-6xl">
          {{ errorConfig.icon }}
        </div>

        <!-- Status Code -->
        <div class="mb-2 text-sm font-medium text-[#6B7B75]">
          Error {{ error?.statusCode || 500 }}
        </div>

        <!-- Title -->
        <h1 class="mb-3 text-2xl font-bold text-white">
          {{ errorConfig.title }}
        </h1>

        <!-- Description -->
        <p class="mb-6 text-[#6B7B75]">
          {{ errorConfig.description }}
        </p>

        <!-- Action Button -->
        <button
          class="w-full rounded-lg bg-[#4DB175] py-3 font-semibold text-white transition-colors hover:bg-[#5FC287]"
          @click="handleError"
        >
          {{ errorConfig.actionLabel }}
        </button>
      </div>

      <!-- Additional Links -->
      <div class="mt-6 flex justify-center gap-6 text-sm">
        <NuxtLink to="/" class="text-[#6B7B75] hover:text-[#4DB175]">
          Home
        </NuxtLink>
        <NuxtLink to="/dashboard" class="text-[#6B7B75] hover:text-[#4DB175]">
          Dashboard
        </NuxtLink>
        <NuxtLink to="/clubs" class="text-[#6B7B75] hover:text-[#4DB175]">
          Clubs
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
