<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'

const form = reactive({
  name: '',
  slug: '',
  description: '',
  province: '',
  city: '',
  visibility: 'public' as 'public' | 'private'
})

const saving = ref(false)
const errorMessage = ref('')

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function handleNameInput() {
  if (!form.slug) form.slug = slugify(form.name)
}

async function handleCreate() {
  errorMessage.value = ''
  saving.value = true
  try {
    const response = await $fetch<{ data: ClubDto }>('/api/v1/clubs', {
      method: 'POST',
      body: {
        name: form.name,
        slug: form.slug,
        description: form.description || null,
        province: form.province || null,
        city: form.city || null,
        visibility: form.visibility
      }
    })
    await navigateTo(`/clubs/${response.data.id}`)
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not create the club.'
  } finally {
    saving.value = false
  }
}

const provinces = [
  'Metro Manila',
  'Cebu',
  'Davao',
  'Laguna',
  'Cavite',
  'Bulacan',
  'Pampanga',
  'Rizal',
  'Batangas',
  'Quezon'
]
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-white">Create a Club</h1>
        <p class="mt-1 text-sm text-[#6B7B75]">Build your pickleball community</p>
      </div>

      <!-- Form -->
      <form class="space-y-6" @submit.prevent="handleCreate">
        <!-- Basic Info -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Basic Information</h2>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Club Name</label>
              <input
                v-model="form.name"
                type="text"
                required
                placeholder="Enter club name"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
                @input="handleNameInput"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Club URL Slug</label>
              <input
                v-model="form.slug"
                type="text"
                required
                placeholder="my-club"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
              <p class="mt-1 text-xs text-[#6B7B75]">Used in your club's URL</p>
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Description</label>
              <textarea
                v-model="form.description"
                rows="4"
                placeholder="Tell people about your club..."
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Location -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Location</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Province</label>
              <select
                v-model="form.province"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
              >
                <option value="">Select province</option>
                <option v-for="p in provinces" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">City</label>
              <input
                v-model="form.city"
                type="text"
                placeholder="Enter city"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Visibility -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Club Visibility</h2>
          <div class="space-y-3">
            <label
              class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
              :class="form.visibility === 'public'
                ? 'border-[#4DB175] bg-[#4DB175]/5'
                : 'border-[#3A5750] hover:border-[#4DB175]/50'"
            >
              <input
                v-model="form.visibility"
                type="radio"
                value="public"
                class="mt-1 h-4 w-4 border-[#3A5750] text-[#4DB175] focus:ring-[#4DB175]"
              />
              <div>
                <span class="font-medium text-white">Public</span>
                <p class="mt-0.5 text-sm text-[#6B7B75]">
                  Anyone can find and join your club
                </p>
              </div>
            </label>
            <label
              class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
              :class="form.visibility === 'private'
                ? 'border-[#4DB175] bg-[#4DB175]/5'
                : 'border-[#3A5750] hover:border-[#4DB175]/50'"
            >
              <input
                v-model="form.visibility"
                type="radio"
                value="private"
                class="mt-1 h-4 w-4 border-[#3A5750] text-[#4DB175] focus:ring-[#4DB175]"
              />
              <div>
                <span class="font-medium text-white">Private</span>
                <p class="mt-0.5 text-sm text-[#6B7B75]">
                  Members must be approved to join
                </p>
              </div>
            </label>
          </div>
        </div>

        <!-- Error -->
        <div v-if="errorMessage" class="rounded-xl bg-red-500/10 p-4 text-red-400">
          {{ errorMessage }}
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <NuxtLink
            to="/my-clubs"
            class="flex-1 rounded-xl border border-[#3A5750] py-3 text-center font-medium text-[#A6ABA7] hover:bg-[#2E4540]"
          >
            Cancel
          </NuxtLink>
          <button
            type="submit"
            :disabled="saving"
            class="flex-1 rounded-xl bg-[#4DB175] py-3 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
          >
            {{ saving ? 'Creating...' : 'Create Club' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
