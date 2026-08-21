<script setup lang="ts">
definePageMeta({
  middleware: ['super-admin']
})

const user = useSupabaseUser()

interface Webhook {
  id: string
  url: string
  events: string[]
  is_active: boolean
  created_at: string
}

interface WebhookWithSecret extends Webhook {
  secret: string
}

const webhooks = ref<Webhook[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showCreateModal = ref(false)
const newWebhookUrl = ref('')
const selectedEvents = ref<string[]>([])
const creating = ref(false)
const newlyCreatedSecret = ref<string | null>(null)
const copied = ref(false)

const availableEvents = [
  { value: 'match.verified', label: 'Match Verified' },
  { value: 'rating.changed', label: 'Rating Changed' },
  { value: 'club.member_joined', label: 'Club Member Joined' },
  { value: 'tournament.registration_opened', label: 'Tournament Registration Opened' }
]

async function fetchWebhooks() {
  loading.value = true
  error.value = null
  try {
    const response = await $fetch<{ subscriptions: Webhook[] }>('/api/v1/webhooks')
    webhooks.value = response.subscriptions
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Failed to load webhooks'
  } finally {
    loading.value = false
  }
}

async function createWebhook() {
  if (!newWebhookUrl.value.trim() || selectedEvents.value.length === 0) return
  creating.value = true
  try {
    const response = await $fetch<WebhookWithSecret>('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: newWebhookUrl.value.trim(),
        events: selectedEvents.value
      }
    })
    newlyCreatedSecret.value = response.secret
    webhooks.value.unshift({
      id: response.id,
      url: response.url,
      events: response.events,
      is_active: true,
      created_at: response.created_at
    })
    newWebhookUrl.value = ''
    selectedEvents.value = []
    showCreateModal.value = false
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Failed to create webhook'
  } finally {
    creating.value = false
  }
}

async function deleteWebhook(webhookId: string) {
  if (!confirm('Are you sure you want to delete this webhook?')) return
  try {
    await $fetch(`/api/v1/webhooks/${webhookId}`, { method: 'DELETE' })
    webhooks.value = webhooks.value.filter(w => w.id !== webhookId)
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Failed to delete webhook'
  }
}

async function copySecret() {
  if (newlyCreatedSecret.value) {
    await navigator.clipboard.writeText(newlyCreatedSecret.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString()
}

function toggleEvent(event: string) {
  const idx = selectedEvents.value.indexOf(event)
  if (idx === -1) {
    selectedEvents.value.push(event)
  } else {
    selectedEvents.value.splice(idx, 1)
  }
}

onMounted(fetchWebhooks)
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <!-- Header -->
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Webhooks</h1>
          <p class="mt-1 text-sm text-[#6B7B75]">Receive real-time notifications when events occur</p>
        </div>
        <button
          class="inline-flex items-center gap-2 rounded-xl bg-[#4DB175] px-4 py-2 font-medium text-white hover:bg-[#5FC287]"
          @click="showCreateModal = true"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Webhook
        </button>
      </div>

      <!-- New Secret Created -->
      <div
        v-if="newlyCreatedSecret"
        class="mb-6 rounded-xl bg-[#4DB175]/10 p-4 ring-1 ring-[#4DB175]/30"
      >
        <div class="flex items-start justify-between">
          <div>
            <p class="font-medium text-[#4DB175]">Webhook Created Successfully</p>
            <p class="mt-1 text-sm text-[#4DB175]/80">Copy this secret to verify webhook signatures. You won't see it again.</p>
          </div>
          <button class="text-[#4DB175] hover:text-[#4DB175]/80" @click="newlyCreatedSecret = null">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <code class="flex-1 rounded-lg bg-[#0B0D09] p-3 font-mono text-sm text-white break-all">
            {{ newlyCreatedSecret }}
          </code>
          <button
            class="rounded-lg bg-[#4DB175] px-4 py-2 font-medium text-white hover:bg-[#5FC287]"
            @click="copySecret"
          >
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="mb-6 rounded-xl bg-red-500/10 p-4 text-red-400">
        {{ error }}
      </div>

      <!-- Loading -->
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Empty -->
      <div v-else-if="webhooks.length === 0" class="rounded-xl bg-[#1E2E2A] p-12 text-center">
        <p class="text-4xl">🔗</p>
        <h3 class="mt-4 text-lg font-semibold text-white">No webhooks configured</h3>
        <p class="mt-2 text-sm text-[#6B7B75]">Add a webhook to receive event notifications</p>
        <button
          class="mt-4 rounded-lg bg-[#4DB175] px-4 py-2 text-white"
          @click="showCreateModal = true"
        >
          Add Webhook
        </button>
      </div>

      <!-- Webhooks List -->
      <div v-else class="space-y-3">
        <div
          v-for="webhook in webhooks"
          :key="webhook.id"
          class="rounded-xl bg-[#1E2E2A] p-4"
        >
          <div class="flex items-start justify-between">
            <div class="min-w-0 flex-1">
              <p class="truncate font-mono text-sm text-white">{{ webhook.url }}</p>
            </div>
            <button
              class="ml-4 rounded-lg border border-red-400/50 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-400/10"
              @click="deleteWebhook(webhook.id)"
            >
              Delete
            </button>
          </div>

          <div class="mt-3 flex flex-wrap gap-1">
            <span
              v-for="event in webhook.events"
              :key="event"
              class="rounded-md bg-[#B5B9F0]/20 px-2 py-0.5 text-xs font-medium text-[#B5B9F0]"
            >
              {{ event }}
            </span>
          </div>

          <p class="mt-3 text-sm text-[#6B7B75]">
            Created: {{ formatDate(webhook.created_at) }}
          </p>
        </div>
      </div>

      <!-- Create Modal -->
      <div
        v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        @click.self="showCreateModal = false"
      >
        <div class="w-full max-w-md rounded-xl bg-[#1E2E2A] p-6">
          <h3 class="mb-4 text-lg font-semibold text-white">Add Webhook</h3>

          <div class="mb-4">
            <label class="mb-1.5 block text-sm text-[#A6ABA7]">URL (HTTPS only)</label>
            <input
              v-model="newWebhookUrl"
              type="url"
              placeholder="https://example.com/webhook"
              class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
            />
          </div>

          <div class="mb-4">
            <label class="mb-2 block text-sm text-[#A6ABA7]">Events</label>
            <div class="space-y-2">
              <label
                v-for="event in availableEvents"
                :key="event.value"
                class="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-[#2E4540]"
              >
                <input
                  type="checkbox"
                  :checked="selectedEvents.includes(event.value)"
                  class="h-4 w-4 rounded border-[#3A5750] text-[#4DB175] focus:ring-[#4DB175]"
                  @change="toggleEvent(event.value)"
                />
                <span class="text-sm text-white">{{ event.label }}</span>
              </label>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button
              class="rounded-lg px-4 py-2 text-[#6B7B75] hover:text-white"
              @click="showCreateModal = false"
            >
              Cancel
            </button>
            <button
              class="rounded-lg bg-[#4DB175] px-4 py-2 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
              :disabled="!newWebhookUrl.trim() || selectedEvents.length === 0 || creating"
              @click="createWebhook"
            >
              {{ creating ? 'Creating...' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
