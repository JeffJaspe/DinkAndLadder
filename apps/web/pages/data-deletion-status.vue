<script setup lang="ts">
definePageMeta({ layout: 'auth' })

useHead({ title: 'Data Deletion Status' })

const route = useRoute()
const confirmationCode = computed(() => route.query.code as string | undefined)
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-canvas p-4">
    <div class="w-full max-w-md rounded-xl bg-surface p-8 text-center shadow-card">
      <div class="mb-4 flex justify-center">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      </div>

      <h1 class="font-display text-heading-2 text-fg">Data Deletion Complete</h1>

      <p class="mt-4 text-fg-secondary">
        Your data has been successfully deleted from our systems in accordance with your request
        through Facebook.
      </p>

      <div v-if="confirmationCode" class="mt-6 rounded-lg bg-surface-2 p-4">
        <p class="text-sm text-fg-muted">Confirmation Code</p>
        <p class="mt-1 font-mono text-sm text-fg">{{ confirmationCode }}</p>
      </div>

      <p class="mt-6 text-sm text-fg-muted">
        If you have any questions about your data deletion, please contact our support team.
      </p>

      <NuxtLink
        to="/"
        class="mt-6 inline-block rounded-lg bg-primary px-6 py-2 font-medium text-on-primary hover:bg-primary-hover"
      >
        Return Home
      </NuxtLink>
    </div>
  </div>
</template>
