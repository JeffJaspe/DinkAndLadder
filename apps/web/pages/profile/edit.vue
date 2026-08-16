<script setup lang="ts">
import type {
  PlayerProfileDto,
  ProfileVisibility
} from '~/server/domains/player/dto/player-profile.dto'

const {
  data: existingProfile,
  pending,
  error
} = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const form = reactive({
  display_name: '',
  first_name: '',
  last_name: '',
  bio: '',
  province: '',
  city: '',
  dominant_hand: '',
  preferred_position: '',
  profile_visibility: 'public' as ProfileVisibility
})

watch(
  existingProfile,
  (profile) => {
    if (!profile) return
    form.display_name = profile.display_name
    form.first_name = profile.first_name ?? ''
    form.last_name = profile.last_name ?? ''
    form.bio = profile.bio ?? ''
    form.province = profile.province ?? ''
    form.city = profile.city ?? ''
    form.dominant_hand = profile.dominant_hand ?? ''
    form.preferred_position = profile.preferred_position ?? ''
    form.profile_visibility = profile.profile_visibility
  },
  { immediate: true }
)

const saving = ref(false)
const errorMessage = ref('')
const savedMessage = ref('')

async function handleSave() {
  errorMessage.value = ''
  savedMessage.value = ''
  saving.value = true
  try {
    await $fetch('/api/v1/players/me', {
      method: 'PATCH',
      body: {
        display_name: form.display_name,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        bio: form.bio || null,
        province: form.province || null,
        city: form.city || null,
        dominant_hand: form.dominant_hand || null,
        preferred_position: form.preferred_position || null,
        profile_visibility: form.profile_visibility
      }
    })
    savedMessage.value = 'Profile saved successfully!'
    setTimeout(() => { savedMessage.value = '' }, 3000)
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not save your profile.'
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
        <h1 class="text-2xl font-bold text-white">Edit Profile</h1>
        <p class="mt-1 text-sm text-[#6B7B75]">Update your player information</p>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="space-y-4">
        <div class="h-48 animate-pulse rounded-xl bg-[#1E2E2A]" />
        <div class="h-32 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Error -->
      <div
        v-else-if="error && error.statusCode !== 404"
        class="rounded-xl bg-red-500/10 p-6 text-center"
      >
        <p class="text-red-400">Could not load your profile.</p>
      </div>

      <!-- Form -->
      <form v-else class="space-y-6" @submit.prevent="handleSave">
        <!-- Basic Info -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Basic Information</h2>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Display Name</label>
              <input
                v-model="form.display_name"
                type="text"
                required
                placeholder="Your public name"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm text-[#A6ABA7]">First Name</label>
                <input
                  v-model="form.first_name"
                  type="text"
                  placeholder="First name"
                  class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm text-[#A6ABA7]">Last Name</label>
                <input
                  v-model="form.last_name"
                  type="text"
                  placeholder="Last name"
                  class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Bio</label>
              <textarea
                v-model="form.bio"
                rows="3"
                placeholder="Tell others about yourself..."
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
                placeholder="Your city"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Play Style -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Play Style</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Dominant Hand</label>
              <select
                v-model="form.dominant_hand"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
              >
                <option value="">Select hand</option>
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="ambidextrous">Ambidextrous</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Preferred Position</label>
              <select
                v-model="form.preferred_position"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
              >
                <option value="">Select position</option>
                <option value="forehand">Forehand</option>
                <option value="backhand">Backhand</option>
                <option value="either">Either</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Privacy -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Privacy</h2>
          <div class="space-y-3">
            <label
              class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
              :class="form.profile_visibility === 'public'
                ? 'border-[#4DB175] bg-[#4DB175]/5'
                : 'border-[#3A5750] hover:border-[#4DB175]/50'"
            >
              <input
                v-model="form.profile_visibility"
                type="radio"
                value="public"
                class="mt-1 h-4 w-4 border-[#3A5750] text-[#4DB175] focus:ring-[#4DB175]"
              />
              <div>
                <span class="font-medium text-white">Public Profile</span>
                <p class="mt-0.5 text-sm text-[#6B7B75]">
                  Anyone can view your profile and stats
                </p>
              </div>
            </label>
            <label
              class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
              :class="form.profile_visibility === 'private'
                ? 'border-[#4DB175] bg-[#4DB175]/5'
                : 'border-[#3A5750] hover:border-[#4DB175]/50'"
            >
              <input
                v-model="form.profile_visibility"
                type="radio"
                value="private"
                class="mt-1 h-4 w-4 border-[#3A5750] text-[#4DB175] focus:ring-[#4DB175]"
              />
              <div>
                <span class="font-medium text-white">Private Profile</span>
                <p class="mt-0.5 text-sm text-[#6B7B75]">
                  Only followers can view your profile
                </p>
              </div>
            </label>
          </div>
        </div>

        <!-- Messages -->
        <div
          v-if="savedMessage"
          class="rounded-xl bg-[#4DB175]/10 p-4 text-center text-[#4DB175] ring-1 ring-[#4DB175]/30"
        >
          {{ savedMessage }}
        </div>
        <div v-if="errorMessage" class="rounded-xl bg-red-500/10 p-4 text-red-400">
          {{ errorMessage }}
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <NuxtLink
            to="/dashboard"
            class="flex-1 rounded-xl border border-[#3A5750] py-3 text-center font-medium text-[#A6ABA7] hover:bg-[#2E4540]"
          >
            Cancel
          </NuxtLink>
          <button
            type="submit"
            :disabled="saving"
            class="flex-1 rounded-xl bg-[#4DB175] py-3 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
          >
            {{ saving ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
