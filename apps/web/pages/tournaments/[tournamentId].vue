<script setup lang="ts">
import type { TournamentDto, TournamentRegistrationDto } from '~/server/domains/event/dto/tournament.dto'
import type { BracketDto } from '~/server/domains/event/dto/bracket.dto'
import type {
  TournamentCategoryDto,
  TournamentCategoryTemplateDto
} from '~/server/domains/event/dto/tournament-category.dto'
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

interface RegistrationsResponse {
  registrations: TournamentRegistrationDto[]
}

const route = useRoute()
const tournamentId = route.params.tournamentId as string

const { data: tournament } = await useFetch<TournamentDto>(`/api/v1/tournaments/${tournamentId}`)
const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const eventUrl = computed(() => (tournament.value ? `/api/v1/events/${tournament.value.event_id}` : ''))
const { data: eventData } = await useFetch<EventDto>(eventUrl, { immediate: !!tournament.value })

const isOrganizer = computed(
  () => !!myProfile.value && !!eventData.value && eventData.value.created_by_player_id === myProfile.value.id
)

const { data: categoriesResponse, refresh: refreshCategories } = await useFetch<{
  data: TournamentCategoryDto[]
}>(`/api/v1/tournaments/${tournamentId}/categories`)
const categories = computed(() => categoriesResponse.value?.data ?? [])

const { data: templatesResponse } = await useFetch<{ data: TournamentCategoryTemplateDto[] }>(
  '/api/v1/tournament-category-templates'
)
const availableTemplates = computed(() => {
  const usedTemplateIds = new Set(categories.value.map((c) => c.template_id).filter(Boolean))
  return (templatesResponse.value?.data ?? []).filter((t) => !usedTemplateIds.has(t.id))
})

const { data: registrationsData, pending: regPending, error: regError, refresh: refreshRegistrations } =
  await useFetch<RegistrationsResponse>(`/api/v1/tournaments/${tournamentId}/registrations`)

// Bracket tab: one per category, plus the plain flat bracket when no categories exist.
const activeCategoryId = ref<string | null>(null)
watch(
  categories,
  (cats) => {
    if (cats.length && !cats.some((c) => c.id === activeCategoryId.value)) {
      activeCategoryId.value = cats[0].id
    }
  },
  { immediate: true }
)

const bracketQuery = computed(() =>
  categories.value.length ? { category_id: activeCategoryId.value ?? '' } : {}
)
const {
  data: bracket,
  pending: bracketPending,
  error: bracketError,
  refresh: refreshBracket
} = await useFetch<BracketDto>(`/api/v1/tournaments/${tournamentId}/bracket`, {
  query: bracketQuery,
  watch: [activeCategoryId]
})

const registering = ref(false)
const registerError = ref('')
const registerSuccess = ref(false)
const selectedRegistrationCategoryId = ref('')

const statusConfig: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  confirmed: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
  waitlisted: { bg: 'bg-[#B5B9F0]/20', text: 'text-[#B5B9F0]' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' }
}

const matchStatusConfig: Record<string, { bg: string; border: string }> = {
  pending: { bg: 'bg-[#2E4540]', border: 'border-[#3A5750]' },
  ready: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  in_progress: { bg: 'bg-[#4DB175]/10', border: 'border-[#4DB175]/30' },
  completed: { bg: 'bg-[#4DB175]/10', border: 'border-[#4DB175]/30' },
  bye: { bg: 'bg-[#2E4540]', border: 'border-[#3A5750]' }
}

function categoryLabel(categoryId: string | null): string {
  if (!categoryId) return 'Uncategorized'
  return categories.value.find((c) => c.id === categoryId)?.name ?? 'Unknown category'
}

async function register() {
  registering.value = true
  registerError.value = ''
  try {
    await $fetch(`/api/v1/tournaments/${tournamentId}/registrations`, {
      method: 'POST',
      body: categories.value.length ? { category_id: selectedRegistrationCategoryId.value || null } : {}
    })
    registerSuccess.value = true
    await refreshRegistrations()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    registerError.value = fetchError.data?.message ?? 'Registration failed.'
  } finally {
    registering.value = false
  }
}

// --- Category management (organizer only) ---
const selectedTemplateId = ref('')
const addingCategory = ref(false)
const categoryError = ref('')
const showCustomCategoryForm = ref(false)
const customCategory = reactive({ name: '', min_rating: '', max_rating: '' })

async function addFromTemplate() {
  if (!selectedTemplateId.value) return
  categoryError.value = ''
  addingCategory.value = true
  try {
    await $fetch(`/api/v1/tournaments/${tournamentId}/categories`, {
      method: 'POST',
      body: { template_id: selectedTemplateId.value }
    })
    selectedTemplateId.value = ''
    await refreshCategories()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    categoryError.value = fetchError.data?.message ?? 'Could not add category.'
  } finally {
    addingCategory.value = false
  }
}

async function addCustomCategory() {
  if (!customCategory.name) return
  categoryError.value = ''
  addingCategory.value = true
  try {
    await $fetch(`/api/v1/tournaments/${tournamentId}/categories`, {
      method: 'POST',
      body: {
        name: customCategory.name,
        min_rating: customCategory.min_rating ? Number(customCategory.min_rating) : null,
        max_rating: customCategory.max_rating ? Number(customCategory.max_rating) : null
      }
    })
    customCategory.name = ''
    customCategory.min_rating = ''
    customCategory.max_rating = ''
    showCustomCategoryForm.value = false
    await refreshCategories()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    categoryError.value = fetchError.data?.message ?? 'Could not add category.'
  } finally {
    addingCategory.value = false
  }
}

// --- Bracket generation (organizer only) ---
const generating = ref(false)
const generateError = ref('')

async function generateBracket() {
  generateError.value = ''
  generating.value = true
  try {
    await $fetch(`/api/v1/tournaments/${tournamentId}/generate-bracket`, {
      method: 'POST',
      body: categories.value.length ? { category_id: activeCategoryId.value } : {}
    })
    await refreshBracket()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    generateError.value = fetchError.data?.message ?? 'Could not generate bracket.'
  } finally {
    generating.value = false
  }
}

function ratingRangeLabel(minRating: number | null, maxRating: number | null): string {
  if (minRating == null && maxRating == null) return 'Any rating'
  if (minRating == null) return `Up to ${maxRating}`
  if (maxRating == null) return `${minRating}+`
  return `${minRating}–${maxRating}`
}

// Generate empty bracket preview based on max_participants
const emptyBracketRounds = computed(() => {
  if (bracket.value?.rounds.length) return []
  const maxP = tournament.value?.max_participants ?? 8
  const numRounds = Math.ceil(Math.log2(maxP))
  const rounds = []
  for (let r = 1; r <= numRounds; r++) {
    const matchesInRound = Math.pow(2, numRounds - r)
    const matches = []
    for (let m = 0; m < matchesInRound; m++) {
      matches.push({
        id: `preview-${r}-${m}`,
        round: r,
        match_number: m + 1,
        participant1: null,
        participant2: null,
        status: 'pending'
      })
    }
    rounds.push({ round: r, name: r === numRounds ? 'Final' : r === numRounds - 1 ? 'Semi-Finals' : `Round ${r}`, matches })
  }
  return rounds
})
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-4xl">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-white">{{ tournament?.name ?? 'Tournament' }}</h1>
        <p class="mt-1 text-sm text-[#6B7B75]">View registrations and bracket</p>
      </div>

      <!-- Category Management (organizer only) -->
      <div v-if="isOrganizer" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
        <h2 class="mb-4 font-semibold text-white">Categories</h2>
        <p class="mb-4 text-sm text-[#6B7B75]">
          Optional — split this tournament into rating-based brackets. Leave empty for a
          single flat bracket.
        </p>

        <ul v-if="categories.length" class="mb-4 space-y-2">
          <li
            v-for="cat in categories"
            :key="cat.id"
            class="flex items-center justify-between rounded-lg bg-[#0B0D09] px-3 py-2"
          >
            <span class="text-sm text-white">{{ cat.name }}</span>
            <span class="text-xs text-[#6B7B75]">{{ ratingRangeLabel(cat.min_rating, cat.max_rating) }}</span>
          </li>
        </ul>

        <div class="flex flex-wrap items-end gap-3">
          <div v-if="availableTemplates.length">
            <label class="mb-1.5 block text-xs text-[#A6ABA7]">Add from template</label>
            <div class="flex gap-2">
              <select
                v-model="selectedTemplateId"
                class="rounded-lg border border-[#3A5750] bg-[#0B0D09] px-3 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none"
              >
                <option value="">Select a template</option>
                <option v-for="t in availableTemplates" :key="t.id" :value="t.id">
                  {{ t.name }} ({{ ratingRangeLabel(t.min_rating, t.max_rating) }})
                </option>
              </select>
              <button
                type="button"
                :disabled="!selectedTemplateId || addingCategory"
                class="rounded-lg bg-[#4DB175] px-4 py-2 text-sm font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
                @click="addFromTemplate"
              >
                Add
              </button>
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-[#3A5750] px-4 py-2 text-sm text-[#A6ABA7] hover:bg-[#2E4540]"
            @click="showCustomCategoryForm = !showCustomCategoryForm"
          >
            {{ showCustomCategoryForm ? 'Cancel' : '+ Custom Category' }}
          </button>
        </div>

        <div v-if="showCustomCategoryForm" class="mt-4 grid gap-3 rounded-lg bg-[#0B0D09] p-4 sm:grid-cols-3">
          <div>
            <label class="mb-1.5 block text-xs text-[#A6ABA7]">Name</label>
            <input
              v-model="customCategory.name"
              type="text"
              placeholder="e.g., 3.5-4.0"
              class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs text-[#A6ABA7]">Min Rating</label>
            <input
              v-model="customCategory.min_rating"
              type="number"
              step="0.1"
              class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs text-[#A6ABA7]">Max Rating</label>
            <input
              v-model="customCategory.max_rating"
              type="number"
              step="0.1"
              class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none"
            />
          </div>
          <button
            type="button"
            :disabled="!customCategory.name || addingCategory"
            class="col-span-full rounded-lg bg-[#4DB175] px-4 py-2 text-sm font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
            @click="addCustomCategory"
          >
            Add Category
          </button>
        </div>

        <p v-if="categoryError" class="mt-3 text-sm text-red-400">{{ categoryError }}</p>
      </div>

      <!-- Registration Section -->
      <div class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-semibold text-white">Registrations</h2>
          <span v-if="registrationsData?.registrations.length" class="text-sm text-[#6B7B75]">
            {{ registrationsData.registrations.length }} registered
          </span>
        </div>

        <!-- Loading -->
        <div v-if="regPending" class="space-y-2">
          <div v-for="i in 3" :key="i" class="h-10 w-full animate-pulse rounded-lg bg-[#2E4540]" />
        </div>

        <!-- Error -->
        <div v-else-if="regError" class="rounded-lg bg-red-500/10 p-4 text-center">
          <p class="text-red-400">Could not load registrations.</p>
        </div>

        <!-- Registrations List -->
        <div v-else-if="registrationsData?.registrations.length" class="space-y-2">
          <div
            v-for="reg in registrationsData.registrations"
            :key="reg.id"
            class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#A6ABA7]">
                {{ reg.player_id.charAt(0).toUpperCase() }}
              </div>
              <span class="text-sm text-white">{{ reg.player_id.slice(0, 8) }}...</span>
              <span v-if="categories.length" class="rounded-full bg-[#2E4540] px-2 py-0.5 text-xs text-[#A6ABA7]">
                {{ categoryLabel(reg.category_id) }}
              </span>
            </div>
            <span
              class="rounded-md px-2 py-0.5 text-xs font-medium capitalize"
              :class="statusConfig[reg.status]?.bg + ' ' + statusConfig[reg.status]?.text"
            >
              {{ reg.status }}
            </span>
          </div>
        </div>

        <!-- Empty -->
        <p v-else class="text-[#6B7B75]">No registrations yet.</p>

        <!-- Register -->
        <div class="mt-4 space-y-3">
          <div v-if="categories.length">
            <label class="mb-1.5 block text-sm text-[#A6ABA7]">Category</label>
            <select
              v-model="selectedRegistrationCategoryId"
              class="w-full max-w-xs rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-sm text-white focus:border-[#4DB175] focus:outline-none"
            >
              <option value="">Select a category</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }} ({{ ratingRangeLabel(cat.min_rating, cat.max_rating) }})
              </option>
            </select>
          </div>
          <button
            type="button"
            :disabled="registering || (categories.length > 0 && !selectedRegistrationCategoryId)"
            class="rounded-lg bg-[#4DB175] px-6 py-2.5 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
            @click="register"
          >
            {{ registering ? 'Registering...' : 'Register for Tournament' }}
          </button>
          <p v-if="registerError" class="text-sm text-red-400">{{ registerError }}</p>
          <p v-if="registerSuccess" class="text-sm text-[#4DB175]">Successfully registered!</p>
        </div>
      </div>

      <!-- Bracket Section -->
      <div class="rounded-xl bg-[#1E2E2A] p-5">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-semibold text-white">Bracket</h2>
          <button
            v-if="isOrganizer"
            type="button"
            :disabled="generating"
            class="rounded-lg border border-[#3A5750] px-4 py-2 text-sm text-[#A6ABA7] hover:bg-[#2E4540] disabled:opacity-50"
            @click="generateBracket"
          >
            {{ generating ? 'Generating…' : 'Generate Bracket' }}
          </button>
        </div>
        <p v-if="generateError" class="mb-4 text-sm text-red-400">{{ generateError }}</p>

        <!-- Category Tabs -->
        <div v-if="categories.length" class="mb-4 flex gap-2 overflow-x-auto">
          <button
            v-for="cat in categories"
            :key="cat.id"
            type="button"
            class="flex-shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors"
            :class="activeCategoryId === cat.id
              ? 'bg-[#4DB175] text-white'
              : 'bg-[#2E4540] text-[#A6ABA7] hover:text-white'"
            @click="activeCategoryId = cat.id"
          >
            {{ cat.name }}
          </button>
        </div>

        <!-- Loading -->
        <div v-if="bracketPending" class="flex gap-6 overflow-x-auto py-4">
          <div v-for="i in 3" :key="i" class="h-72 w-48 animate-pulse rounded-xl bg-[#2E4540]" />
        </div>

        <!-- Error -->
        <div v-else-if="bracketError" class="rounded-lg bg-red-500/10 p-4 text-center">
          <p class="text-red-400">Could not load bracket.</p>
        </div>

        <!-- Bracket Display -->
        <div v-else-if="bracket?.rounds.length" class="overflow-x-auto">
          <div class="flex gap-6 pb-4">
            <div v-for="round in bracket.rounds" :key="round.round" class="min-w-[220px] flex-shrink-0">
              <h3 class="mb-3 text-sm font-medium text-[#A6ABA7]">
                Round {{ round.round }}
              </h3>
              <div class="space-y-3">
                <div
                  v-for="match in round.matches"
                  :key="match.id"
                  class="rounded-lg border p-3"
                  :class="matchStatusConfig[match.status]?.bg + ' ' + matchStatusConfig[match.status]?.border"
                >
                  <!-- Participant 1 -->
                  <div
                    class="flex items-center justify-between rounded-md px-2 py-1"
                    :class="match.winner_registration_id === match.participant1_registration_id
                      ? 'bg-[#4DB175]/20'
                      : 'bg-[#0B0D09]'"
                  >
                    <span class="text-sm font-medium text-white">
                      {{ match.participant1_registration_id?.slice(0, 8) || 'TBD' }}
                    </span>
                    <span v-if="match.winner_registration_id === match.participant1_registration_id" class="text-xs text-[#4DB175]">
                      W
                    </span>
                  </div>

                  <div class="my-1 text-center text-xs text-[#6B7B75]">vs</div>

                  <!-- Participant 2 -->
                  <div
                    class="flex items-center justify-between rounded-md px-2 py-1"
                    :class="match.winner_registration_id === match.participant2_registration_id
                      ? 'bg-[#4DB175]/20'
                      : 'bg-[#0B0D09]'"
                  >
                    <span class="text-sm font-medium text-white">
                      {{ match.participant2_registration_id?.slice(0, 8) || 'TBD' }}
                    </span>
                    <span v-if="match.winner_registration_id === match.participant2_registration_id" class="text-xs text-[#4DB175]">
                      W
                    </span>
                  </div>

                  <!-- Status -->
                  <div class="mt-2 text-center">
                    <span class="text-xs capitalize text-[#6B7B75]">{{ match.status.replace('_', ' ') }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty Bracket Preview (before generation) -->
        <div v-else-if="emptyBracketRounds.length" class="overflow-x-auto">
          <p class="mb-4 text-sm text-[#6B7B75]">
            Bracket preview ({{ tournament?.max_participants ?? 8 }} players) — Click "Generate Bracket" to assign players
          </p>
          <div class="flex gap-6 pb-4">
            <div v-for="round in emptyBracketRounds" :key="round.round" class="min-w-[220px] flex-shrink-0">
              <h3 class="mb-3 text-sm font-medium text-[#A6ABA7]">
                {{ round.name }}
              </h3>
              <div class="space-y-3">
                <div
                  v-for="match in round.matches"
                  :key="match.id"
                  class="rounded-lg border border-dashed border-[#3A5750] bg-[#2E4540]/30 p-3"
                >
                  <!-- Participant 1 -->
                  <div class="flex items-center justify-between rounded-md bg-[#0B0D09]/50 px-2 py-1">
                    <span class="text-sm text-[#6B7B75]">TBD</span>
                  </div>

                  <div class="my-1 text-center text-xs text-[#6B7B75]">vs</div>

                  <!-- Participant 2 -->
                  <div class="flex items-center justify-between rounded-md bg-[#0B0D09]/50 px-2 py-1">
                    <span class="text-sm text-[#6B7B75]">TBD</span>
                  </div>

                  <!-- Match Number -->
                  <div class="mt-2 text-center">
                    <span class="text-xs text-[#6B7B75]">Match {{ match.match_number }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- No bracket possible -->
        <p v-else class="text-[#6B7B75]">Configure tournament settings to see bracket preview.</p>
      </div>

      <!-- Back Link -->
      <div class="mt-6 text-center">
        <NuxtLink to="/events" class="text-sm text-[#4DB175] hover:underline">
          Back to events
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
