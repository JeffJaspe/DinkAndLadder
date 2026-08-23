<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'

const { switchToClub } = useAccountMode()

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

const form = reactive({
  name: '',
  slug: '',
  description: '',
  courtName: '',
  courtAddress: '',
  visibility: 'public' as 'public' | 'private'
})

const saving = ref(false)
const errorMessage = ref('')

onMounted(() => {
  loadProvinces()
})

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
    const finalSlug = form.slug.trim() || slugify(form.name)
    const response = await $fetch<{ data: ClubDto }>('/api/v1/clubs', {
      method: 'POST',
      body: {
        name: form.name,
        slug: finalSlug,
        description: form.description || null,
        province: provinceName.value || null,
        city: cityName.value || null,
        barangay: barangayName.value || null,
        court_name: form.courtName || null,
        court_address: form.courtAddress || null,
        visibility: form.visibility
      }
    })
    // Creating a club is the entry point into club mode — the account switcher
    // sends a player here when they have no club yet. Commit the switch now, so
    // they land as the club rather than having to switch a second time.
    switchToClub(response.data.id)
    await navigateTo(`/club/${response.data.id}/dashboard`)
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not create the club.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-fg">Create a Club</h1>
        <p class="mt-1 text-sm text-fg-muted">Build your pickleball community</p>
      </div>

      <!-- Form -->
      <form class="space-y-6" @submit.prevent="handleCreate">
        <!-- Basic Info -->
        <div class="rounded-xl bg-surface p-5">
          <h2 class="mb-4 font-semibold text-fg">Basic Information</h2>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm text-fg-secondary">Club Name</label>
              <input
                v-model="form.name"
                type="text"
                required
                placeholder="Enter club name"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
                @input="handleNameInput"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-fg-secondary">Club URL Slug <span class="text-fg-muted">(optional)</span></label>
              <input
                v-model="form.slug"
                type="text"
                placeholder="Auto-generated from name if empty"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
              />
              <p class="mt-1 text-xs text-fg-muted">Used in your club's URL</p>
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-fg-secondary">Description</label>
              <textarea
                v-model="form.description"
                rows="4"
                placeholder="Tell people about your club..."
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Location -->
        <div class="rounded-xl bg-surface p-5">
          <h2 class="mb-4 font-semibold text-fg">Location</h2>
          <div class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm text-fg-secondary">Province</label>
                <select
                  :value="selectedProvince"
                  :disabled="loadingProvinces"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none disabled:opacity-50"
                  @change="(e) => selectProvince((e.target as HTMLSelectElement).value)"
                >
                  <option value="">{{ loadingProvinces ? 'Loading...' : 'Select province' }}</option>
                  <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <label class="mb-1.5 block text-sm text-fg-secondary">City / Municipality</label>
                <select
                  :value="selectedCity"
                  :disabled="!selectedProvince || loadingCities"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none disabled:opacity-50"
                  @change="(e) => selectCity((e.target as HTMLSelectElement).value)"
                >
                  <option value="">{{ loadingCities ? 'Loading...' : 'Select city/municipality' }}</option>
                  <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-fg-secondary">Barangay <span class="text-fg-muted">(optional)</span></label>
              <select
                :value="selectedBarangay"
                :disabled="!selectedCity || loadingBarangays"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none disabled:opacity-50"
                @change="(e) => selectBarangay((e.target as HTMLSelectElement).value)"
              >
                <option value="">{{ loadingBarangays ? 'Loading...' : 'Select barangay (optional)' }}</option>
                <option v-for="b in barangays" :key="b.code" :value="b.code">{{ b.name }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Court Details (Optional) -->
        <div class="rounded-xl bg-surface p-5">
          <h2 class="mb-4 font-semibold text-fg">Court Details <span class="text-sm font-normal text-fg-muted">(optional)</span></h2>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm text-fg-secondary">Court Name</label>
              <input
                v-model="form.courtName"
                type="text"
                placeholder="e.g., Main Court, Sports Complex"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-fg-secondary">Court Address</label>
              <input
                v-model="form.courtAddress"
                type="text"
                placeholder="Full address of your home court"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Visibility -->
        <div class="rounded-xl bg-surface p-5">
          <h2 class="mb-4 font-semibold text-fg">Club Visibility</h2>
          <div class="space-y-3">
            <label
              class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
              :class="form.visibility === 'public'
                ? 'border-primary bg-primary/5'
                : 'border-border-strong hover:border-primary/50'"
            >
              <input
                v-model="form.visibility"
                type="radio"
                value="public"
                class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
              />
              <div>
                <span class="font-medium text-fg">Public</span>
                <p class="mt-0.5 text-sm text-fg-muted">
                  Anyone can find and join your club
                </p>
              </div>
            </label>
            <label
              class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
              :class="form.visibility === 'private'
                ? 'border-primary bg-primary/5'
                : 'border-border-strong hover:border-primary/50'"
            >
              <input
                v-model="form.visibility"
                type="radio"
                value="private"
                class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
              />
              <div>
                <span class="font-medium text-fg">Private</span>
                <p class="mt-0.5 text-sm text-fg-muted">
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
            class="flex-1 rounded-xl border border-border-strong py-3 text-center font-medium text-fg-secondary hover:bg-surface-2"
          >
            Cancel
          </NuxtLink>
          <button
            type="submit"
            :disabled="saving"
            class="flex-1 rounded-xl bg-primary py-3 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {{ saving ? 'Creating...' : 'Create Club' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
