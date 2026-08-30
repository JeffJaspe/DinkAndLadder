<script setup lang="ts">
// Chromeless shell: these are the pages you reach when you cannot get into the
// app, and the default layout would draw the whole sidebar around them. A
// recovery link is a real session, so gating on the session alone wrapped the
// password form in the full app and let every nav link out of the flow.
definePageMeta({ layout: 'auth' })

const route = useRoute()
const email = computed(() => (typeof route.query.email === 'string' ? route.query.email : ''))
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <NuxtLink to="/" class="inline-flex items-center gap-2">
          <UiBrandMark size="xl" :show-name="false" />
        </NuxtLink>
      </div>

      <div class="rounded-xl bg-surface p-6 text-center shadow-card">
        <div class="mb-4 flex justify-center">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
        </div>
        <h1 class="text-xl font-semibold text-fg">Verification sent</h1>
        <p class="mt-2 text-fg-secondary">
          Check your email<span v-if="email"
            >, <span class="text-fg">{{ email }}</span></span
          >
          for a confirmation link. Click it to finish creating your account — you'll be signed in
          automatically. The link can only be used once.
        </p>
        <p class="mt-4 text-sm text-fg-muted">
          Didn't get it? Check your spam folder, or
          <NuxtLink to="/register" class="font-medium text-primary hover:text-primary-hover">
            try registering again </NuxtLink
          >.
        </p>
      </div>

      <p class="mt-6 text-center text-sm text-fg-muted">
        Already confirmed?
        <NuxtLink to="/login" class="font-medium text-primary hover:text-primary-hover">
          Log in
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
