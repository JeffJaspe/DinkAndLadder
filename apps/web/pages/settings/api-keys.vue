<script setup lang="ts">
interface ApiKey {
  id: string
  name: string
  key_prefix: string
  permissions: string[]
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
}

interface NewKeyResponse extends ApiKey {
  key: string
}

const keys = ref<ApiKey[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showCreateModal = ref(false)
const newKeyName = ref('')
const creating = ref(false)
const newlyCreatedKey = ref<string | null>(null)
const copied = ref(false)

async function fetchKeys() {
  loading.value = true
  error.value = null
  try {
    const response = await $fetch<{ keys: ApiKey[] }>('/api/v1/api-keys')
    keys.value = response.keys
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Failed to load API keys'
  } finally {
    loading.value = false
  }
}

async function createKey() {
  if (!newKeyName.value.trim()) return
  creating.value = true
  try {
    const response = await $fetch<NewKeyResponse>('/api/v1/api-keys', {
      method: 'POST',
      body: { name: newKeyName.value.trim() }
    })
    newlyCreatedKey.value = response.key
    keys.value.unshift({
      id: response.id,
      name: response.name,
      key_prefix: response.key_prefix,
      permissions: response.permissions,
      created_at: response.created_at,
      last_used_at: null,
      expires_at: null,
      is_active: true
    })
    newKeyName.value = ''
    showCreateModal.value = false
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Failed to create API key'
  } finally {
    creating.value = false
  }
}

async function revokeKey(keyId: string) {
  if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) return
  try {
    await $fetch(`/api/v1/api-keys/${keyId}`, { method: 'DELETE' })
    keys.value = keys.value.filter(k => k.id !== keyId)
  } catch (e: any) {
    error.value = e.data?.statusMessage || 'Failed to revoke API key'
  }
}

async function copyKey() {
  if (newlyCreatedKey.value) {
    await navigator.clipboard.writeText(newlyCreatedKey.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString()
}

onMounted(fetchKeys)
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <!-- Header -->
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">API Keys</h1>
          <p class="mt-1 text-sm text-[#6B7B75]">Manage API keys for programmatic access</p>
        </div>
        <button
          class="inline-flex items-center gap-2 rounded-xl bg-[#4DB175] px-4 py-2 font-medium text-white hover:bg-[#5FC287]"
          @click="showCreateModal = true"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create API Key
        </button>
      </div>

      <!-- New Key Created -->
      <div
        v-if="newlyCreatedKey"
        class="mb-6 rounded-xl bg-[#4DB175]/10 p-4 ring-1 ring-[#4DB175]/30"
      >
        <div class="flex items-start justify-between">
          <div>
            <p class="font-medium text-[#4DB175]">API Key Created Successfully</p>
            <p class="mt-1 text-sm text-[#4DB175]/80">Copy this key now. You won't be able to see it again.</p>
          </div>
          <button class="text-[#4DB175] hover:text-[#4DB175]/80" @click="newlyCreatedKey = null">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <code class="flex-1 rounded-lg bg-[#0B0D09] p-3 font-mono text-sm text-white break-all">
            {{ newlyCreatedKey }}
          </code>
          <button
            class="rounded-lg bg-[#4DB175] px-4 py-2 font-medium text-white hover:bg-[#5FC287]"
            @click="copyKey"
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
      <div v-else-if="keys.length === 0" class="rounded-xl bg-[#1E2E2A] p-12 text-center">
        <p class="text-4xl">🔑</p>
        <h3 class="mt-4 text-lg font-semibold text-white">No API keys yet</h3>
        <p class="mt-2 text-sm text-[#6B7B75]">Create an API key to access the public API</p>
        <button
          class="mt-4 rounded-lg bg-[#4DB175] px-4 py-2 text-white"
          @click="showCreateModal = true"
        >
          Create API Key
        </button>
      </div>

      <!-- Keys List -->
      <div v-else class="space-y-3">
        <div
          v-for="key in keys"
          :key="key.id"
          class="rounded-xl bg-[#1E2E2A] p-4"
        >
          <div class="flex items-start justify-between">
            <div>
              <h3 class="font-medium text-white">{{ key.name }}</h3>
              <p class="mt-1 font-mono text-sm text-[#6B7B75]">{{ key.key_prefix }}...</p>
            </div>
            <button
              v-if="key.is_active"
              class="rounded-lg border border-red-400/50 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-400/10"
              @click="revokeKey(key.id)"
            >
              Revoke
            </button>
            <span v-else class="rounded-md bg-[#3A5750] px-2 py-0.5 text-xs text-[#6B7B75]">Inactive</span>
          </div>

          <div class="mt-3 flex flex-wrap gap-4 text-sm text-[#6B7B75]">
            <span>Created: {{ formatDate(key.created_at) }}</span>
            <span>{{ key.last_used_at ? `Last used: ${formatDate(key.last_used_at)}` : 'Never used' }}</span>
            <span v-if="key.expires_at">Expires: {{ formatDate(key.expires_at) }}</span>
          </div>

          <div class="mt-3 flex flex-wrap gap-1">
            <span
              v-for="perm in key.permissions"
              :key="perm"
              class="rounded-md bg-[#4DB175]/20 px-2 py-0.5 text-xs font-medium text-[#4DB175]"
            >
              {{ perm }}
            </span>
          </div>
        </div>
      </div>

      <!-- Create Modal -->
      <div
        v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        @click.self="showCreateModal = false"
      >
        <div class="w-full max-w-md rounded-xl bg-[#1E2E2A] p-6">
          <h3 class="mb-4 text-lg font-semibold text-white">Create API Key</h3>
          <div class="mb-4">
            <label class="mb-1.5 block text-sm text-[#A6ABA7]">Key Name</label>
            <input
              v-model="newKeyName"
              type="text"
              placeholder="My Integration"
              class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
            />
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
              :disabled="!newKeyName.trim() || creating"
              @click="createKey"
            >
              {{ creating ? 'Creating...' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
