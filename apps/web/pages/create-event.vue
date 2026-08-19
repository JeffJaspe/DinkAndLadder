<script setup lang="ts">
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'
import type { EventType, QueueMode } from '~/server/domains/event/dto/event.dto'

interface MineResponse {
  items: MyClubMembershipDto[]
}

const eventTypes: { value: EventType; label: string; description: string; ranked: boolean }[] = [
  { value: 'open_casual', label: 'Open Casual', description: 'Open to anyone, no rating impact', ranked: false },
  { value: 'open_ranked', label: 'Open Ranked', description: 'Open to anyone, affects ratings', ranked: true },
  { value: 'club_casual', label: 'Club Casual', description: 'Club members only, no rating impact', ranked: false },
  { value: 'club_ranked', label: 'Club Ranked', description: 'Club members only, affects ratings', ranked: true },
  { value: 'tournament', label: 'Tournament', description: 'Organized brackets, organizer inputs scores', ranked: true }
]

const form = reactive({
  club_id: '',
  name: '',
  description: '',
  event_type: 'open_casual' as EventType,
  venue: '',
  province: '',
  city: '',
  start_date: '',
  end_date: '',
  registration_opens: '',
  registration_closes: '',
  fee_amount: '',
  max_participants: '',
  queue_enabled: false,
  queue_mode: 'first_come' as QueueMode,
  queue_courts: '',
  visibility: 'public' as 'public' | 'private' | 'registered_only'
})

const submitting = ref(false)
const errorMessage = ref('')
const router = useRouter()

const { data: clubsData, pending: clubsPending, error: clubsError } = await useFetch<MineResponse>('/api/v1/clubs/mine')

const adminClubs = computed(() => {
  if (!clubsData.value?.items) return []
  return clubsData.value.items.filter(m =>
    m.status === 'active' && (m.role === 'OWNER' || m.role === 'ADMIN')
  )
})

// Auto-select when there's only one club to choose from — no reason to make someone
// pick from a dropdown with a single option (plan: Phase 4.3).
watch(
  adminClubs,
  (clubs) => {
    if (clubs.length === 1 && !form.club_id) {
      form.club_id = clubs[0].club.id
    }
  },
  { immediate: true }
)

const selectedEventType = computed(() => eventTypes.find(t => t.value === form.event_type))

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

async function submit() {
  if (!form.club_id || !form.name || !form.start_date || !form.end_date) {
    errorMessage.value = 'Club, name, start date, and end date are required.'
    return
  }
  errorMessage.value = ''
  submitting.value = true

  try {
    const created = await $fetch<{ id: string }>('/api/v1/events', {
      method: 'POST',
      body: {
        club_id: form.club_id,
        name: form.name,
        description: form.description || null,
        event_type: form.event_type,
        venue: form.venue || null,
        province: form.province || null,
        city: form.city || null,
        start_date: form.start_date,
        end_date: form.end_date,
        registration_opens: form.registration_opens || null,
        registration_closes: form.registration_closes || null,
        fee_amount: form.fee_amount ? parseFloat(form.fee_amount) : null,
        fee_currency: form.fee_amount ? 'PHP' : null,
        max_participants: form.max_participants ? parseInt(form.max_participants) : null,
        queue_enabled: form.queue_enabled,
        queue_mode: form.queue_mode,
        queue_courts: form.queue_courts ? parseInt(form.queue_courts) : undefined,
        visibility: form.visibility
      }
    })
    router.push(`/events/${created.id}`)
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
        <h1 class="text-2xl font-bold text-white">Create Event</h1>
        <p class="mt-1 text-sm text-[#6B7B75]">Organize open play, ranked sessions, or tournaments</p>
      </div>

      <!-- Loading clubs -->
      <div v-if="clubsPending" class="rounded-xl bg-[#1E2E2A] p-8 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#4DB175] border-t-transparent" />
        <p class="mt-4 text-[#6B7B75]">Loading your clubs...</p>
      </div>

      <!-- Error loading clubs -->
      <div v-else-if="clubsError" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">Could not load your clubs. Please try again.</p>
        <NuxtLink to="/my-clubs" class="mt-4 inline-block text-sm text-[#4DB175] hover:underline">
          Go to My Clubs
        </NuxtLink>
      </div>

      <!-- No admin clubs -->
      <div v-else-if="!adminClubs.length" class="rounded-xl bg-[#1E2E2A] p-8 text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#2E4540]">
          <svg class="h-8 w-8 text-[#6B7B75]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-white">No Clubs to Manage</h2>
        <p class="mt-2 text-sm text-[#6B7B75]">
          You need to be an owner or admin of a club to create events.
        </p>
        <div class="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <NuxtLink
            to="/create-club"
            class="rounded-lg bg-[#4DB175] px-6 py-2.5 font-medium text-white hover:bg-[#5FC287]"
          >
            Create a Club
          </NuxtLink>
          <NuxtLink
            to="/clubs"
            class="rounded-lg border border-[#3A5750] px-6 py-2.5 font-medium text-[#A6ABA7] hover:bg-[#2E4540]"
          >
            Browse Clubs
          </NuxtLink>
        </div>
      </div>

      <!-- Form -->
      <form v-else class="space-y-6" @submit.prevent="submit">
        <!-- Basic Info -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Basic Information</h2>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Hosting Club</label>
              <div
                v-if="adminClubs.length === 1"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09]/50 px-4 py-2.5 text-white"
              >
                {{ adminClubs[0].club.name }}
              </div>
              <select
                v-else
                v-model="form.club_id"
                required
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
              >
                <option value="" disabled>Select a club</option>
                <option v-for="m in adminClubs" :key="m.club.id" :value="m.club.id">
                  {{ m.club.name }} ({{ m.role }})
                </option>
              </select>
              <p class="mt-1 text-xs text-[#6B7B75]">Only clubs where you are an owner or admin are shown</p>
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Event Name</label>
              <input
                v-model="form.name"
                type="text"
                required
                placeholder="e.g., Friday Night Open Play"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Description</label>
              <textarea
                v-model="form.description"
                rows="3"
                placeholder="Describe your event..."
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Event Type -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Event Type</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <label
              v-for="t in eventTypes"
              :key="t.value"
              class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-all"
              :class="form.event_type === t.value
                ? 'border-[#4DB175] bg-[#4DB175]/5'
                : 'border-[#3A5750] hover:border-[#4DB175]/50'"
            >
              <input
                v-model="form.event_type"
                type="radio"
                :value="t.value"
                class="mt-1 h-4 w-4 border-[#3A5750] text-[#4DB175] focus:ring-[#4DB175]"
              />
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-white">{{ t.label }}</span>
                  <span
                    v-if="t.ranked"
                    class="rounded bg-[#B5B9F0]/20 px-1.5 py-0.5 text-xs text-[#B5B9F0]"
                  >
                    Ranked
                  </span>
                </div>
                <p class="mt-0.5 text-xs text-[#6B7B75]">{{ t.description }}</p>
              </div>
            </label>
          </div>
          <div v-if="selectedEventType?.ranked" class="mt-3 rounded-lg bg-[#B5B9F0]/10 p-3 text-sm text-[#B5B9F0]">
            Matches in this event will affect player ratings.
          </div>
        </div>

        <!-- Schedule -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Schedule</h2>
          <div class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm text-[#A6ABA7]">Start Date</label>
                <input
                  v-model="form.start_date"
                  type="date"
                  required
                  class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm text-[#A6ABA7]">End Date</label>
                <input
                  v-model="form.end_date"
                  type="date"
                  required
                  class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
                />
              </div>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm text-[#A6ABA7]">Registration Opens</label>
                <input
                  v-model="form.registration_opens"
                  type="date"
                  class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm text-[#A6ABA7]">Registration Closes</label>
                <input
                  v-model="form.registration_closes"
                  type="date"
                  class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Capacity & Fees -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Capacity & Fees</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Max Participants</label>
              <input
                v-model="form.max_participants"
                type="number"
                min="2"
                placeholder="Leave empty for unlimited"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Registration Fee (PHP)</label>
              <input
                v-model="form.fee_amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0 for free"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Queue Mode -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <h2 class="font-semibold text-white">Match Queue</h2>
              <p class="mt-0.5 text-sm text-[#6B7B75]">Optional matchmaking system for players at the event</p>
            </div>
            <label class="relative inline-flex cursor-pointer items-center">
              <input v-model="form.queue_enabled" type="checkbox" class="peer sr-only" />
              <div class="h-6 w-11 rounded-full bg-[#3A5750] transition-colors peer-checked:bg-[#4DB175] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
            </label>
          </div>

          <div v-if="form.queue_enabled" class="space-y-4">
            <div class="space-y-3">
              <label
                class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
                :class="form.queue_mode === 'first_come'
                  ? 'border-[#4DB175] bg-[#4DB175]/5'
                  : 'border-[#3A5750] hover:border-[#4DB175]/50'"
              >
                <input
                  v-model="form.queue_mode"
                  type="radio"
                  value="first_come"
                  class="mt-1 h-4 w-4 border-[#3A5750] text-[#4DB175] focus:ring-[#4DB175]"
                />
                <div>
                  <span class="font-medium text-white">First Come, First Served</span>
                  <p class="mt-0.5 text-sm text-[#6B7B75]">
                    Players are matched in the order they joined the queue
                  </p>
                </div>
              </label>
              <label
                class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
                :class="form.queue_mode === 'rating_based'
                  ? 'border-[#4DB175] bg-[#4DB175]/5'
                  : 'border-[#3A5750] hover:border-[#4DB175]/50'"
              >
                <input
                  v-model="form.queue_mode"
                  type="radio"
                  value="rating_based"
                  class="mt-1 h-4 w-4 border-[#3A5750] text-[#4DB175] focus:ring-[#4DB175]"
                />
                <div>
                  <span class="font-medium text-white">Rating Based</span>
                  <p class="mt-0.5 text-sm text-[#6B7B75]">
                    Players are matched with others of similar rating
                  </p>
                </div>
              </label>
              <label
                class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
                :class="form.queue_mode === 'random'
                  ? 'border-[#4DB175] bg-[#4DB175]/5'
                  : 'border-[#3A5750] hover:border-[#4DB175]/50'"
              >
                <input
                  v-model="form.queue_mode"
                  type="radio"
                  value="random"
                  class="mt-1 h-4 w-4 border-[#3A5750] text-[#4DB175] focus:ring-[#4DB175]"
                />
                <div>
                  <span class="font-medium text-white">Random</span>
                  <p class="mt-0.5 text-sm text-[#6B7B75]">
                    Players are randomly paired from the queue
                  </p>
                </div>
              </label>
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Number of Courts</label>
              <input
                v-model="form.queue_courts"
                type="number"
                min="1"
                placeholder="e.g., 4"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Location -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Location</h2>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Venue</label>
              <input
                v-model="form.venue"
                type="text"
                placeholder="e.g., Manila Sports Complex"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
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
        </div>

        <!-- Visibility -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Visibility</h2>
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
                  Anyone can see and register for this event
                </p>
              </div>
            </label>
            <label
              class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
              :class="form.visibility === 'registered_only'
                ? 'border-[#4DB175] bg-[#4DB175]/5'
                : 'border-[#3A5750] hover:border-[#4DB175]/50'"
            >
              <input
                v-model="form.visibility"
                type="radio"
                value="registered_only"
                class="mt-1 h-4 w-4 border-[#3A5750] text-[#4DB175] focus:ring-[#4DB175]"
              />
              <div>
                <span class="font-medium text-white">Registered Only</span>
                <p class="mt-0.5 text-sm text-[#6B7B75]">
                  Anyone can register, but only registered players see matches
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
                  Only invited participants can see and register
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
            to="/events"
            class="flex-1 rounded-xl border border-[#3A5750] py-3 text-center font-medium text-[#A6ABA7] hover:bg-[#2E4540]"
          >
            Cancel
          </NuxtLink>
          <button
            type="submit"
            :disabled="submitting"
            class="flex-1 rounded-xl bg-[#4DB175] py-3 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
          >
            {{ submitting ? 'Creating...' : 'Create Event' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
