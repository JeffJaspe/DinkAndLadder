<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const eventId = route.params.eventId as string

const form = reactive({
  name: '',
  format: 'single_elimination' as 'single_elimination' | 'double_elimination' | 'round_robin' | 'swiss',
  match_type: 'singles' as 'singles' | 'doubles',
  max_participants: 32,
  min_rating: '',
  max_rating: '',
  registration_opens: '',
  registration_closes: ''
})

const submitting = ref(false)
const errorMessage = ref('')

const formats = [
  { value: 'single_elimination', label: 'Single Elimination' },
  { value: 'double_elimination', label: 'Double Elimination' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'swiss', label: 'Swiss System' }
]

const participantOptions = [8, 16, 32, 64, 128]

async function submit() {
  if (!form.name) {
    errorMessage.value = 'Tournament name is required.'
    return
  }
  errorMessage.value = ''
  submitting.value = true

  try {
    const created = await $fetch<{ id: string }>(`/api/v1/events/${eventId}/tournaments`, {
      method: 'POST',
      body: {
        name: form.name,
        format: form.format,
        match_type: form.match_type,
        max_participants: form.max_participants,
        min_rating: form.min_rating ? Number(form.min_rating) : null,
        max_rating: form.max_rating ? Number(form.max_rating) : null,
        registration_opens: form.registration_opens || null,
        registration_closes: form.registration_closes || null
      }
    })
    router.push(`/tournaments/${created.id}`)
  } catch (e: any) {
    errorMessage.value = e?.data?.statusMessage || 'Something went wrong.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- Header -->
      <div class="mb-6">
        <NuxtLink :to="`/events/${eventId}`" class="mb-4 inline-flex items-center gap-2 text-sm text-[#6B7B75] hover:text-white">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Event
        </NuxtLink>
        <h1 class="text-2xl font-bold text-white">Create Tournament</h1>
        <p class="mt-1 text-sm text-[#6B7B75]">Add a new tournament to this event</p>
      </div>

      <!-- Form -->
      <form class="space-y-6" @submit.prevent="submit">
        <!-- Basic Info -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Tournament Details</h2>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Tournament Name</label>
              <input
                v-model="form.name"
                type="text"
                required
                placeholder="e.g., Men's Singles Open"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm text-[#A6ABA7]">Format</label>
                <select
                  v-model="form.format"
                  class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
                >
                  <option v-for="f in formats" :key="f.value" :value="f.value">{{ f.label }}</option>
                </select>
              </div>
              <div>
                <label class="mb-1.5 block text-sm text-[#A6ABA7]">Match Type</label>
                <select
                  v-model="form.match_type"
                  class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
                >
                  <option value="singles">Singles</option>
                  <option value="doubles">Doubles</option>
                </select>
              </div>
            </div>

            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Max Participants</label>
              <select
                v-model="form.max_participants"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
              >
                <option v-for="n in participantOptions" :key="n" :value="n">{{ n }} players</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Rating Restrictions -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Rating Restrictions (Optional)</h2>
          <p class="mb-4 text-sm text-[#6B7B75]">Leave blank for open registration</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Minimum Rating</label>
              <input
                v-model="form.min_rating"
                type="number"
                min="0"
                placeholder="e.g., 1500"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Maximum Rating</label>
              <input
                v-model="form.max_rating"
                type="number"
                min="0"
                placeholder="e.g., 2000"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Registration Period -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Registration Period (Optional)</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Registration Opens</label>
              <input
                v-model="form.registration_opens"
                type="datetime-local"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Registration Closes</label>
              <input
                v-model="form.registration_closes"
                type="datetime-local"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-if="errorMessage" class="rounded-xl bg-red-500/10 p-4 text-red-400">
          {{ errorMessage }}
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <NuxtLink
            :to="`/events/${eventId}`"
            class="flex-1 rounded-xl border border-[#3A5750] py-3 text-center font-medium text-[#A6ABA7] hover:bg-[#2E4540]"
          >
            Cancel
          </NuxtLink>
          <button
            type="submit"
            :disabled="submitting"
            class="flex-1 rounded-xl bg-[#4DB175] py-3 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
          >
            {{ submitting ? 'Creating...' : 'Create Tournament' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
