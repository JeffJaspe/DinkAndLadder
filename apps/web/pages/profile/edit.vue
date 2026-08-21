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

const {
  provinces,
  cities,
  barangays,
  selectedProvince,
  selectedCity,
  selectedBarangay,
  provinceName,
  cityName,
  barangayName,
  loadingProvinces,
  loadingCities,
  loadingBarangays,
  loadProvinces,
  selectProvince,
  selectCity,
  selectBarangay
} = useLocationPicker()

onMounted(() => {
  loadProvinces()
})

const { data: authInfo } = await useFetch<{ provider: string; providers: string[]; created_at: string }>(
  '/api/v1/me/auth-info'
)

const authMethodLabel = computed(() => {
  const provider = authInfo.value?.provider
  if (provider === 'google') return 'Signed in with Google'
  if (provider === 'email') return 'Signed in with email'
  return provider ? `Signed in with ${provider}` : 'Unknown'
})

const form = reactive({
  display_name: '',
  first_name: '',
  last_name: '',
  bio: '',
  dominant_hand: '',
  preferred_position: '',
  profile_visibility: 'public' as ProfileVisibility
})

watch(
  existingProfile,
  async (profile) => {
    if (!profile) return
    form.display_name = profile.display_name
    form.first_name = profile.first_name ?? ''
    form.last_name = profile.last_name ?? ''
    form.bio = profile.bio ?? ''
    form.dominant_hand = profile.dominant_hand ?? ''
    form.preferred_position = profile.preferred_position ?? ''
    form.profile_visibility = profile.profile_visibility

    // Match province/city/barangay by name if previously saved
    if (profile.province) {
      await loadProvinces()
      const matchedProvince = provinces.value.find(p => p.name === profile.province)
      if (matchedProvince) {
        selectProvince(matchedProvince.code)
        if (profile.city) {
          await new Promise(resolve => setTimeout(resolve, 500))
          const matchedCity = cities.value.find(c => c.name === profile.city)
          if (matchedCity) {
            selectCity(matchedCity.code)
            if (profile.barangay) {
              await new Promise(resolve => setTimeout(resolve, 500))
              const matchedBarangay = barangays.value.find(b => b.name === profile.barangay)
              if (matchedBarangay) {
                selectBarangay(matchedBarangay.code)
              }
            }
          }
        }
      }
    }
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
        province: provinceName.value || null,
        city: cityName.value || null,
        barangay: barangayName.value || null,
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
        <!-- Account Info -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Account</h2>
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg" :class="authInfo?.provider === 'google' ? 'bg-white' : 'bg-[#4DB175]'">
              <svg v-if="authInfo?.provider === 'google'" class="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <svg v-else class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p class="text-sm font-medium text-white">{{ authMethodLabel }}</p>
              <p v-if="authInfo?.created_at" class="text-xs text-[#6B7B75]">
                Member since {{ new Date(authInfo.created_at).toLocaleDateString() }}
              </p>
            </div>
          </div>
        </div>

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
          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Province</label>
              <select
                :value="selectedProvince"
                :disabled="loadingProvinces"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none disabled:opacity-50"
                @change="selectProvince(($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ loadingProvinces ? 'Loading...' : 'Select province' }}</option>
                <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">City / Municipality</label>
              <select
                :value="selectedCity"
                :disabled="!selectedProvince || loadingCities"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none disabled:opacity-50"
                @change="selectCity(($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ loadingCities ? 'Loading...' : (selectedProvince ? 'Select city' : 'Select province first') }}</option>
                <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Barangay</label>
              <select
                :value="selectedBarangay"
                :disabled="!selectedCity || loadingBarangays"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none disabled:opacity-50"
                @change="selectBarangay(($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ loadingBarangays ? 'Loading...' : (selectedCity ? 'Select barangay' : 'Select city first') }}</option>
                <option v-for="b in barangays" :key="b.code" :value="b.code">{{ b.name }}</option>
              </select>
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
