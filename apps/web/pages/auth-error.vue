<script setup lang="ts">
import { describeAuthCallbackError } from '~/utils/auth-callback-error'

// Chromeless shell: these are the pages you reach when you cannot get into the
// app, and the default layout would draw the whole sidebar around them. A
// recovery link is a real session, so gating on the session alone wrapped the
// password form in the full app and let every nav link out of the flow.
definePageMeta({ layout: 'auth' })

useHead({ title: 'Link problem' })

const route = useRoute()

const code = computed(() => (typeof route.query.code === 'string' ? route.query.code : 'unknown'))
const description = computed(() =>
  typeof route.query.description === 'string' ? route.query.description : ''
)
const explanation = computed(() =>
  describeAuthCallbackError({ code: code.value, description: description.value })
)

// An expired or spent link is nearly always a password reset, and the fix is to
// send a fresh one. Other failures are likelier to be a confirmation link, where
// signing in is the more useful next step — so the primary action follows the
// code rather than being the same button in both cases.
const isExpired = computed(() => code.value === 'otp_expired')
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
            class="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-amber-400"
          >
            <UiIcon name="alert" size="h-6 w-6" />
          </div>
        </div>

        <h1 class="text-xl font-semibold text-fg">This link didn't work</h1>
        <p class="mt-2 text-fg-secondary">{{ explanation }}</p>

        <div class="mt-6 space-y-3">
          <NuxtLink
            v-if="isExpired"
            to="/reset-password"
            class="block w-full rounded-lg bg-primary py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Send a new link
          </NuxtLink>
          <NuxtLink
            to="/login"
            class="block w-full rounded-lg border border-border-strong py-3 font-medium text-fg transition-colors hover:bg-surface-2"
            :class="
              isExpired
                ? ''
                : 'bg-primary font-semibold text-on-primary hover:bg-primary-hover border-transparent'
            "
          >
            {{ isExpired ? 'Back to sign in' : 'Go to sign in' }}
          </NuxtLink>
        </div>

        <!-- The provider's own code, kept visible: it is what makes a support
             conversation or a dashboard log search possible. -->
        <p v-if="code !== 'unknown'" class="mt-6 text-xs text-fg-muted">
          Reference: <code>{{ code }}</code>
        </p>
      </div>
    </div>
  </div>
</template>
