<script setup lang="ts">
const route = useRoute()
const email = computed(() => (typeof route.query.email === 'string' ? route.query.email : ''))
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[#0B0D09] px-4 py-12">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <NuxtLink to="/" class="inline-flex items-center gap-2">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4DB175] text-xl font-bold text-white">
            D
          </div>
        </NuxtLink>
      </div>

      <div class="rounded-xl bg-[#1E2E2A] p-6 text-center">
        <div class="mb-4 flex justify-center">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#4DB175]/10 text-[#4DB175]">
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
        <h1 class="text-xl font-semibold text-white">Verification sent</h1>
        <p class="mt-2 text-[#A6ABA7]">
          Check your email<span v-if="email">, <span class="text-white">{{ email }}</span></span> for a
          confirmation link. Click it to finish creating your account — you'll be signed in
          automatically. The link can only be used once.
        </p>
        <p class="mt-4 text-sm text-[#6B7B75]">
          Didn't get it? Check your spam folder, or
          <NuxtLink to="/register" class="font-medium text-[#4DB175] hover:text-[#5FC287]">
            try registering again
          </NuxtLink>.
        </p>
      </div>

      <p class="mt-6 text-center text-sm text-[#6B7B75]">
        Already confirmed?
        <NuxtLink to="/login" class="font-medium text-[#4DB175] hover:text-[#5FC287]">
          Log in
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
