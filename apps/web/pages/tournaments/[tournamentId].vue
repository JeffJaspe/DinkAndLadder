<script setup lang="ts">
import type { PartnerDto } from '~/server/domains/partnership/dto/partnership.dto'
import type {
  TournamentDto,
  TournamentRegistrationWithPlayerDto
} from '~/server/domains/event/dto/tournament.dto'
import type { BracketDto } from '~/server/domains/event/dto/bracket.dto'
import type {
  TournamentCategoryDto,
  TournamentCategoryTemplateDto
} from '~/server/domains/event/dto/tournament-category.dto'
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

interface RegistrationsResponse {
  registrations: TournamentRegistrationWithPlayerDto[]
}

const route = useRoute()
const tournamentId = route.params.tournamentId as string

const { data: tournament } = await useFetch<TournamentDto>(`/api/v1/tournaments/${tournamentId}`)
const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const eventUrl = computed(() =>
  tournament.value ? `/api/v1/events/${tournament.value.event_id}` : ''
)
const { data: eventData } = await useFetch<EventDto>(eventUrl, { immediate: !!tournament.value })

const { isClubMode } = useAccountMode()

/** Ownership only — see `canManageTournament`, which is what the template uses. */
const isOrganizer = computed(
  () =>
    !!myProfile.value &&
    !!eventData.value &&
    eventData.value.created_by_player_id === myProfile.value.id
)

/**
 * Running a tournament is club-mode work, so ownership alone does not unlock it.
 * Everything a player came here for stays visible in either mode — the bracket,
 * the matches, the categories and who is registered in them. What disappears in
 * player mode is the machinery: generating and editing the bracket, confirming
 * registrations, changing the format.
 */
const canManageTournament = computed(() => isOrganizer.value && isClubMode.value)

/**
 * Reviewing registrations is deliberately not part of `canManageTournament`.
 *
 * Two ways it is wider. It admits the hosting club's staff — owner, admin and
 * moderator — not only the event's creator, so the queue does not stall on one
 * person being unavailable. And it works in BOTH hats, for the same reason the
 * club-side join queue does: a pending registration is a player waiting for an
 * answer, and making them wait on someone noticing they are in the wrong mode
 * costs a real person real time.
 *
 * Mirrors `assertCanReviewRegistrations` in event.service.ts, which is the
 * authority; everything else on this page stays organiser-and-club-hat.
 */
const REVIEW_ROLES = ['OWNER', 'ADMIN', 'MODERATOR']

const { data: myClubs } = await useFetch<{ items: MyClubMembershipDto[] }>('/api/v1/clubs/mine', {
  ignoreResponseError: true,
  default: () => ({ items: [] })
})

const myRoleInHostClub = computed(() => {
  const clubId = eventData.value?.club_id
  if (!clubId) return null
  const membership = myClubs.value?.items?.find(
    (m) => m.club.id === clubId && m.status === 'active'
  )
  return membership?.role ?? null
})

const canReviewRegistrations = computed(
  () => isOrganizer.value || REVIEW_ROLES.includes(myRoleInHostClub.value ?? '')
)

const reviewingRegistrationId = ref<string | null>(null)
const reviewError = ref('')

/**
 * `confirmed` and `rejected` are the two answers the endpoint takes for a
 * pending entry; `waitlisted` exists too but there is no UI concept for a
 * waitlist yet, so it is not offered rather than half-built.
 */
async function reviewRegistration(registrationId: string, status: 'confirmed' | 'rejected') {
  reviewError.value = ''
  reviewingRegistrationId.value = registrationId
  try {
    await $fetch(`/api/v1/registrations/${registrationId}`, {
      method: 'PATCH',
      body: { status }
    })
    await refreshRegistrations()
  } catch (err) {
    reviewError.value = apiErrorMessage(err, 'Could not update that registration.')
  } finally {
    reviewingRegistrationId.value = null
  }
}

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

const {
  data: registrationsData,
  pending: regPending,
  error: regError,
  refresh: refreshRegistrations
} = await useFetch<RegistrationsResponse>(`/api/v1/tournaments/${tournamentId}/registrations`)

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

// Registration is per category, not per tournament: categories are the
// rating-banded thing a player actually enters, and a player may enter several.
// `registering` holds the category id currently in flight so only that button
// shows a spinner.
const registering = ref<string | null>(null)
const registerError = ref('')

/**
 * Doubles partner picker.
 *
 * This was the one genuinely broken path on the page: EventService requires
 * `partner_player_id` for a doubles tournament (PARTNER_REQUIRED), the endpoint
 * has always read it off the body, and the page never sent it — so registering
 * for any doubles category failed every time, with no control anywhere to fix
 * it. The field below is that control, pre-filled from the player's duo.
 *
 * Per category rather than per page: a player may enter several categories of
 * the same tournament, and the partner for mixed doubles is not necessarily
 * the partner for men's doubles.
 */
const isDoublesTournament = computed(() => tournament.value?.match_type === 'doubles')

const { data: myPartnersData } = await useFetch<{ data: PartnerDto[] }>(
  '/api/v1/players/me/partners',
  { server: false, default: () => ({ data: [] }) }
)
const myPartners = computed(() => myPartnersData.value?.data ?? [])
const defaultPartnerId = computed(
  () => myPartners.value.find((partner) => partner.is_default)?.player_id ?? null
)

/** Explicit per-category overrides. Absent means "use the duo". */
const partnerByCategory = reactive<Record<string, string>>({})

const CATEGORY_KEY_FLAT = 'flat'

function partnerKey(categoryId: string | null): string {
  return categoryId ?? CATEGORY_KEY_FLAT
}

function partnerFor(categoryId: string | null): string {
  const explicit = partnerByCategory[partnerKey(categoryId)]
  if (explicit !== undefined) return explicit
  return defaultPartnerId.value ?? ''
}

function setPartnerFor(categoryId: string | null, playerId: string) {
  partnerByCategory[partnerKey(categoryId)] = playerId
}

const registrations = computed(() => registrationsData.value?.registrations ?? [])

/**
 * Per-category counts.
 *
 * Vacancy deliberately counts CONFIRMED registrations only — a pending entry is
 * still awaiting the organiser's approval and does not hold a place. Pending is
 * surfaced separately so an organiser can see the queue behind the count.
 */
interface CategoryStats {
  confirmed: TournamentRegistrationWithPlayerDto[]
  pending: TournamentRegistrationWithPlayerDto[]
  capacity: number | null
  vacant: number | null
  isFull: boolean
  mine: TournamentRegistrationWithPlayerDto | undefined
}

const statsByCategory = computed<Record<string, CategoryStats>>(() => {
  const out: Record<string, CategoryStats> = {}
  for (const cat of categories.value) {
    const inCategory = registrations.value.filter((r) => r.category_id === cat.id)
    const confirmed = inCategory.filter((r) => r.status === 'confirmed')
    const pending = inCategory.filter((r) => r.status === 'pending')
    const capacity = cat.max_participants
    const vacant = capacity === null ? null : Math.max(0, capacity - confirmed.length)
    out[cat.id] = {
      confirmed,
      pending,
      capacity,
      vacant,
      isFull: vacant !== null && vacant === 0,
      mine: inCategory.find((r) => r.player_id === myProfile.value?.id)
    }
  }
  return out
})

function vacancyLabel(stats: CategoryStats): string {
  if (stats.capacity === null) return `${stats.confirmed.length} registered`
  if (stats.isFull) return `Full — ${stats.capacity}/${stats.capacity}`
  const noun = stats.vacant === 1 ? 'place' : 'places'
  return `${stats.confirmed.length}/${stats.capacity} · ${stats.vacant} ${noun} left`
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  confirmed: { bg: 'bg-primary/20', text: 'text-primary' },
  waitlisted: { bg: 'bg-accent/20', text: 'text-accent' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' }
}

const matchStatusConfig: Record<string, { bg: string; border: string }> = {
  pending: { bg: 'bg-surface-2', border: 'border-border-strong' },
  ready: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  in_progress: { bg: 'bg-primary/10', border: 'border-primary/30' },
  completed: { bg: 'bg-primary/10', border: 'border-primary/30' },
  bye: { bg: 'bg-surface-2', border: 'border-border-strong' }
}

/**
 * The bracket generator encodes the phase in the round number rather than a
 * separate column (see bracket.service.ts): knockout rounds count from 1, pools
 * start at 10, playoffs at 50, the losers bracket at 100, and the grand final
 * is 200. Rendering the raw number produced labels like "Round 51" and
 * "Round 200"; this turns them back into something a player recognises.
 */
const POOL_ROUND_OFFSET = 10
const PLAYOFF_ROUND_OFFSET = 50
const LOSERS_ROUND_OFFSET = 100
const GRAND_FINAL_ROUND = 200

function isPoolRound(round: number): boolean {
  return round >= POOL_ROUND_OFFSET && round < PLAYOFF_ROUND_OFFSET
}

function roundLabel(round: number): string {
  if (round === GRAND_FINAL_ROUND) return 'Grand Final'
  if (round >= LOSERS_ROUND_OFFSET) return `Losers Round ${round - LOSERS_ROUND_OFFSET}`
  if (round >= PLAYOFF_ROUND_OFFSET) return `Playoff Round ${round - PLAYOFF_ROUND_OFFSET}`
  if (isPoolRound(round)) {
    // Pool A, Pool B, … reads better than a number for parallel groups.
    return `Pool ${String.fromCharCode(65 + (round - POOL_ROUND_OFFSET))}`
  }
  return `Round ${round}`
}

// Pools are parallel groups; knockout and playoff rounds are a sequence. They
// are laid out differently, so they are split here rather than in the template.
const poolRounds = computed(() => (bracket.value?.rounds ?? []).filter((r) => isPoolRound(r.round)))
const knockoutRounds = computed(() =>
  (bracket.value?.rounds ?? []).filter((r) => !isPoolRound(r.round))
)

function categoryLabel(categoryId: string | null): string {
  if (!categoryId) return 'Uncategorized'
  return categories.value.find((c) => c.id === categoryId)?.name ?? 'Unknown category'
}

async function registerForCategory(categoryId: string | null) {
  registerError.value = ''

  const partnerPlayerId = isDoublesTournament.value ? partnerFor(categoryId) : ''
  // Caught here rather than letting the server answer PARTNER_REQUIRED, so the
  // message names the missing control instead of describing an API rule.
  if (isDoublesTournament.value && !partnerPlayerId) {
    registerError.value = myPartners.value.length
      ? 'Choose a partner before registering for a doubles category.'
      : 'Doubles needs a partner. Add one from Partners first, then register.'
    return
  }

  registering.value = categoryId ?? CATEGORY_KEY_FLAT
  try {
    await $fetch(`/api/v1/tournaments/${tournamentId}/registrations`, {
      method: 'POST',
      body: {
        category_id: categoryId,
        partner_player_id: partnerPlayerId || null
      }
    })
    await refreshRegistrations()
  } catch (err) {
    registerError.value = apiErrorMessage(err, 'Registration failed.')
  } finally {
    registering.value = null
  }
}

// --- Editing a draft tournament (organizer only) ---
// Only while draft: changing format or match type after a bracket has been
// drawn would invalidate it.
const isDraft = computed(() => tournament.value?.status === 'draft')
const canEditTournament = computed(() => canManageTournament.value && isDraft.value)

const editingTournament = ref(false)
const savingTournament = ref(false)
const tournamentError = ref('')
const tournamentForm = reactive({
  name: '',
  format: 'single_elimination',
  match_type: 'singles',
  min_rating: '' as string | number,
  max_rating: '' as string | number
})

function startEditTournament() {
  if (!tournament.value) return
  tournamentForm.name = tournament.value.name
  tournamentForm.format = tournament.value.format
  tournamentForm.match_type = tournament.value.match_type
  tournamentForm.min_rating = tournament.value.min_rating ?? ''
  tournamentForm.max_rating = tournament.value.max_rating ?? ''
  tournamentError.value = ''
  editingTournament.value = true
}

async function saveTournament() {
  savingTournament.value = true
  tournamentError.value = ''
  try {
    await $fetch(`/api/v1/tournaments/${tournamentId}`, {
      method: 'PATCH',
      body: {
        name: tournamentForm.name,
        format: tournamentForm.format,
        match_type: tournamentForm.match_type,
        min_rating: tournamentForm.min_rating === '' ? null : Number(tournamentForm.min_rating),
        max_rating: tournamentForm.max_rating === '' ? null : Number(tournamentForm.max_rating)
      }
    })
    editingTournament.value = false
    await refreshNuxtData()
  } catch (err) {
    tournamentError.value = apiErrorMessage(err, 'Could not save the tournament.')
  } finally {
    savingTournament.value = false
  }
}

// --- Editing a category (organizer only) ---
const editingCategoryId = ref<string | null>(null)
const savingCategory = ref(false)
const categoryEditError = ref('')
const categoryForm = reactive({ name: '', max_participants: 16 as number | string })

function startEditCategory(cat: TournamentCategoryDto) {
  editingCategoryId.value = cat.id
  categoryForm.name = cat.name
  categoryForm.max_participants = cat.max_participants ?? 16
  categoryEditError.value = ''
}

async function saveCategory(categoryId: string) {
  savingCategory.value = true
  categoryEditError.value = ''
  try {
    await $fetch(`/api/v1/tournament-categories/${categoryId}`, {
      method: 'PATCH',
      body: {
        name: categoryForm.name,
        max_participants:
          categoryForm.max_participants === '' ? null : Number(categoryForm.max_participants)
      }
    })
    editingCategoryId.value = null
    await refreshCategories()
  } catch (err) {
    // Surfaces CAPACITY_BELOW_CONFIRMED verbatim, which names the confirmed count.
    categoryEditError.value = apiErrorMessage(err, 'Could not save the category.')
  } finally {
    savingCategory.value = false
  }
}

// --- Category management (organizer only) ---
/** Bracket-friendly suggestions; the input stays free-text so any size works. */
const CATEGORY_SIZE_SUGGESTIONS = [8, 16, 32, 64]
const newCategorySize = ref<number | string>(16)
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
      body: {
        template_id: selectedTemplateId.value,
        max_participants: newCategorySize.value === '' ? null : Number(newCategorySize.value)
      }
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
        max_participants: newCategorySize.value === '' ? null : Number(newCategorySize.value),
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
    rounds.push({
      round: r,
      name: r === numRounds ? 'Final' : r === numRounds - 1 ? 'Semi-Finals' : `Round ${r}`,
      matches
    })
  }
  return rounds
})
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <!-- Header -->
      <div class="mb-6">
        <!-- A tournament is only reachable through its event, so there is always
             a parent to go back to. Names the event rather than saying "Back". -->
        <NuxtLink
          v-if="tournament"
          :to="`/events/${tournament.event_id}`"
          class="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-primary"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {{ eventData?.name ?? 'Back to event' }}
        </NuxtLink>

        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-2xl font-bold text-fg">{{ tournament?.name ?? 'Tournament' }}</h1>
            <p class="mt-1 text-sm text-fg-muted">View registrations and bracket</p>
          </div>
          <button
            v-if="canEditTournament && !editingTournament"
            type="button"
            class="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-secondary hover:border-primary hover:text-fg"
            @click="startEditTournament"
          >
            Edit tournament
          </button>
        </div>

        <!-- Draft only: changing format after a bracket exists would invalidate it. -->
        <div v-if="editingTournament" class="mt-4 rounded-xl bg-surface p-5 shadow-card">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="mb-1.5 block text-xs text-fg-secondary">Name</label>
              <input
                v-model="tournamentForm.name"
                type="text"
                class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-xs text-fg-secondary">Format</label>
              <select
                v-model="tournamentForm.format"
                class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
              >
                <option value="single_elimination">Single elimination</option>
                <option value="double_elimination">Double elimination</option>
                <option value="round_robin">Round robin</option>
                <option value="pool_play">Pool play</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-xs text-fg-secondary">Match type</label>
              <select
                v-model="tournamentForm.match_type"
                class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
              >
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-xs text-fg-secondary">Min rating</label>
              <input
                v-model="tournamentForm.min_rating"
                type="number"
                step="0.1"
                placeholder="Any"
                class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-xs text-fg-secondary">Max rating</label>
              <input
                v-model="tournamentForm.max_rating"
                type="number"
                step="0.1"
                placeholder="Any"
                class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <p v-if="tournamentError" class="mt-3 text-sm text-red-400">{{ tournamentError }}</p>
          <div class="mt-4 flex gap-2">
            <button
              type="button"
              :disabled="savingTournament"
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
              @click="saveTournament"
            >
              {{ savingTournament ? 'Saving…' : 'Save changes' }}
            </button>
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm text-fg-muted hover:text-fg"
              @click="editingTournament = false"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!--
        Visible to everyone: this is where registration happens, so a player has
        to be able to see the categories. Only the management controls inside
        are organizer-gated.
      -->
      <div
        v-if="canManageTournament || categories.length"
        class="mb-6 rounded-xl bg-surface p-5 shadow-card"
      >
        <h2 class="mb-4 font-semibold text-fg">Categories</h2>
        <p v-if="canManageTournament" class="mb-4 text-sm text-fg-muted">
          Split this tournament into rating-based brackets. Players register per category and may
          enter more than one.
        </p>

        <!-- Bracket-friendly suggestions; the inputs stay free-text. -->
        <datalist id="category-sizes">
          <option v-for="size in CATEGORY_SIZE_SUGGESTIONS" :key="size" :value="size" />
        </datalist>

        <ul v-if="categories.length" class="mb-4 space-y-2">
          <li v-for="cat in categories" :key="cat.id" class="rounded-lg bg-canvas px-3 py-2">
            <!-- Inline edit -->
            <div v-if="editingCategoryId === cat.id" class="space-y-2">
              <div class="flex flex-wrap items-end gap-2">
                <div class="min-w-0 flex-1">
                  <label class="mb-1 block text-xs text-fg-secondary">Name</label>
                  <input
                    v-model="categoryForm.name"
                    type="text"
                    class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
                  />
                </div>
                <div class="w-32">
                  <label class="mb-1 block text-xs text-fg-secondary">Players</label>
                  <input
                    v-model="categoryForm.max_participants"
                    type="number"
                    min="2"
                    list="category-sizes"
                    class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  :disabled="savingCategory"
                  class="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  @click="saveCategory(cat.id)"
                >
                  {{ savingCategory ? 'Saving…' : 'Save' }}
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3 py-2 text-sm text-fg-muted hover:text-fg"
                  @click="editingCategoryId = null"
                >
                  Cancel
                </button>
              </div>
              <p v-if="categoryEditError" class="text-xs text-red-400">{{ categoryEditError }}</p>
            </div>

            <div v-else class="space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                  <span class="text-sm font-medium text-fg">{{ cat.name }}</span>
                  <span class="ml-2 text-xs text-fg-muted">
                    {{ ratingRangeLabel(cat.min_rating, cat.max_rating) }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class="text-xs"
                    :class="statsByCategory[cat.id]?.isFull ? 'text-accent' : 'text-fg-muted'"
                  >
                    {{ statsByCategory[cat.id] ? vacancyLabel(statsByCategory[cat.id]) : '' }}
                  </span>
                  <button
                    v-if="canManageTournament"
                    type="button"
                    class="rounded-lg px-2 py-1 text-xs text-fg-muted hover:text-fg"
                    @click="startEditCategory(cat)"
                  >
                    Edit
                  </button>
                  <!-- Doubles needs a pair. Pre-selected to the player's duo
                       and editable per category, because mixed doubles and
                       men's doubles are rarely the same partner. -->
                  <select
                    v-if="isDoublesTournament && myProfile && !statsByCategory[cat.id]?.mine"
                    :value="partnerFor(cat.id)"
                    :aria-label="`Partner for ${cat.name}`"
                    class="max-w-[11rem] rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-xs text-fg focus:border-primary focus:outline-none"
                    @change="setPartnerFor(cat.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">
                      {{ myPartners.length ? 'Choose partner…' : 'No partners yet' }}
                    </option>
                    <option
                      v-for="mate in myPartners"
                      :key="mate.player_id"
                      :value="mate.player_id"
                    >
                      {{ mate.display_name }}{{ mate.is_default ? ' ★ your duo' : '' }}
                    </option>
                  </select>
                  <button
                    v-if="myProfile && !statsByCategory[cat.id]?.mine"
                    type="button"
                    :disabled="registering === cat.id || statsByCategory[cat.id]?.isFull"
                    class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                    @click="registerForCategory(cat.id)"
                  >
                    {{
                      registering === cat.id
                        ? 'Registering…'
                        : statsByCategory[cat.id]?.isFull
                          ? 'Full'
                          : 'Register'
                    }}
                  </button>
                  <span
                    v-else-if="statsByCategory[cat.id]?.mine"
                    class="rounded-lg bg-primary/20 px-3 py-1.5 text-xs text-primary"
                  >
                    {{
                      statsByCategory[cat.id]?.mine?.status === 'confirmed'
                        ? 'Registered'
                        : 'Pending'
                    }}
                  </span>
                </div>
              </div>

              <!-- Who is in this category -->
              <div
                v-if="statsByCategory[cat.id]?.confirmed.length"
                class="flex flex-wrap gap-x-3 gap-y-1"
              >
                <NuxtLink
                  v-for="reg in statsByCategory[cat.id].confirmed"
                  :key="reg.id"
                  :to="`/players/${reg.player_id}`"
                  class="text-xs text-fg-secondary underline-offset-2 hover:text-primary hover:underline"
                >
                  {{ reg.display_name
                  }}<template v-if="reg.partner_display_name">
                    &amp; {{ reg.partner_display_name }}</template
                  >
                </NuxtLink>
              </div>
              <p v-else class="text-xs text-fg-muted">No players registered yet.</p>

              <!-- Awaiting approval. This used to be a count and nothing else:
                   the PATCH endpoint existed but no screen ever called it, so a
                   pending registration could be seen and never actioned. -->
              <div
                v-if="canReviewRegistrations && statsByCategory[cat.id]?.pending.length"
                class="mt-2 space-y-1.5"
              >
                <p class="text-xs text-accent">
                  {{ statsByCategory[cat.id].pending.length }} awaiting approval
                </p>
                <div
                  v-for="reg in statsByCategory[cat.id].pending"
                  :key="reg.id"
                  class="flex flex-wrap items-center gap-2 rounded-button bg-canvas px-2 py-1.5"
                >
                  <span class="min-w-0 flex-1 truncate text-xs text-fg">
                    {{ reg.display_name
                    }}<template v-if="reg.partner_display_name">
                      &amp; {{ reg.partner_display_name }}</template
                    >
                  </span>
                  <button
                    type="button"
                    :disabled="reviewingRegistrationId === reg.id"
                    class="rounded-button bg-primary px-2.5 py-1 text-xs font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                    @click="reviewRegistration(reg.id, 'confirmed')"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    :disabled="reviewingRegistrationId === reg.id"
                    class="rounded-button border border-danger px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                    @click="reviewRegistration(reg.id, 'rejected')"
                  >
                    Reject
                  </button>
                </div>
                <p v-if="reviewError" role="alert" class="text-xs text-danger">
                  {{ reviewError }}
                </p>
              </div>
            </div>
          </li>
        </ul>

        <p v-if="registerError" role="alert" class="text-sm text-danger">{{ registerError }}</p>

        <div v-if="canManageTournament" class="flex flex-wrap items-end gap-3">
          <!-- Capacity moved off the tournament and onto the category; it is
               required here so a bracket always knows how big it should be. -->
          <div class="w-32">
            <label for="new-category-size" class="mb-1.5 block text-xs text-fg-secondary">
              Players
            </label>
            <input
              id="new-category-size"
              v-model="newCategorySize"
              type="number"
              min="2"
              list="category-sizes"
              class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
            />
          </div>

          <div v-if="availableTemplates.length">
            <label class="mb-1.5 block text-xs text-fg-secondary">Add from template</label>
            <div class="flex gap-2">
              <select
                v-model="selectedTemplateId"
                class="rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
              >
                <option value="">Select a template</option>
                <option v-for="t in availableTemplates" :key="t.id" :value="t.id">
                  {{ t.name }} ({{ ratingRangeLabel(t.min_rating, t.max_rating) }})
                </option>
              </select>
              <button
                type="button"
                :disabled="!selectedTemplateId || addingCategory"
                class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                @click="addFromTemplate"
              >
                Add
              </button>
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2"
            @click="showCustomCategoryForm = !showCustomCategoryForm"
          >
            {{ showCustomCategoryForm ? 'Cancel' : '+ Custom Category' }}
          </button>
        </div>

        <div
          v-if="showCustomCategoryForm"
          class="mt-4 grid gap-3 rounded-lg bg-canvas p-4 sm:grid-cols-3"
        >
          <div>
            <label class="mb-1.5 block text-xs text-fg-secondary">Name</label>
            <input
              v-model="customCategory.name"
              type="text"
              placeholder="e.g., 3.5-4.0"
              class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs text-fg-secondary">Min Rating</label>
            <input
              v-model="customCategory.min_rating"
              type="number"
              step="0.1"
              class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs text-fg-secondary">Max Rating</label>
            <input
              v-model="customCategory.max_rating"
              type="number"
              step="0.1"
              class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
            />
          </div>
          <button
            type="button"
            :disabled="!customCategory.name || addingCategory"
            class="col-span-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
            @click="addCustomCategory"
          >
            Add Category
          </button>
        </div>

        <p v-if="categoryError" class="mt-3 text-sm text-red-400">{{ categoryError }}</p>
      </div>

      <!-- Registration Section -->
      <div class="mb-6 rounded-xl bg-surface p-5 shadow-card">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-semibold text-fg">Registrations</h2>
          <span v-if="registrationsData?.registrations.length" class="text-sm text-fg-muted">
            {{ registrationsData.registrations.length }} registered
          </span>
        </div>

        <!-- Loading -->
        <div v-if="regPending" class="space-y-2">
          <div v-for="i in 3" :key="i" class="h-10 w-full animate-pulse rounded-lg bg-surface-2" />
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
            class="flex items-center justify-between rounded-lg bg-canvas p-3"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-fg-secondary"
              >
                {{ reg.player_id.charAt(0).toUpperCase() }}
              </div>
              <span class="text-sm text-fg">{{ reg.player_id.slice(0, 8) }}...</span>
              <span
                v-if="categories.length"
                class="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-secondary"
              >
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
        <p v-else class="text-fg-muted">No registrations yet.</p>

        <!--
          Registration lives on each category below, not here. A player enters a
          rating band, and may enter several — a single tournament-level button
          could express neither.
        -->
      </div>

      <!-- Bracket Section -->
      <div class="rounded-xl bg-surface p-5 shadow-card">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-semibold text-fg">Bracket</h2>
          <button
            v-if="canManageTournament"
            type="button"
            :disabled="generating"
            class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
            @click="generateBracket"
          >
            {{ generating ? 'Generating…' : 'Generate Bracket' }}
          </button>
        </div>
        <p v-if="generateError" class="mb-4 text-sm text-red-400">{{ generateError }}</p>

        <!-- Category Tabs -->
        <div v-if="categories.length" class="scroll-x mb-4 flex gap-2">
          <button
            v-for="cat in categories"
            :key="cat.id"
            type="button"
            class="flex-shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors"
            :class="
              activeCategoryId === cat.id
                ? 'bg-primary text-on-primary'
                : 'bg-surface-2 text-fg-secondary hover:text-on-primary'
            "
            @click="activeCategoryId = cat.id"
          >
            {{ cat.name }}
          </button>
        </div>

        <!-- Loading -->
        <div v-if="bracketPending" class="scroll-x flex gap-6 py-4">
          <div v-for="i in 3" :key="i" class="h-72 w-48 animate-pulse rounded-xl bg-surface-2" />
        </div>

        <!-- Error -->
        <div v-else-if="bracketError" class="rounded-lg bg-red-500/10 p-4 text-center">
          <p class="text-red-400">Could not load bracket.</p>
        </div>

        <!-- Bracket Display -->
        <div v-else-if="bracket?.rounds.length" class="space-y-8">
          <!--
            Pools are parallel groups, not a sequence, so they stack and wrap
            instead of extending the knockout scroll rail sideways. This is what
            keeps a pool-play draw readable without a horizontal scrollbar.
          -->
          <div v-if="poolRounds.length">
            <h3 class="mb-3 text-sm font-medium text-fg-secondary">Pools</h3>
            <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              <div v-for="round in poolRounds" :key="round.round" class="rounded-xl bg-canvas p-4">
                <h4 class="mb-3 text-sm font-semibold text-fg">{{ roundLabel(round.round) }}</h4>
                <div class="space-y-3">
                  <BracketMatchCard
                    v-for="match in round.matches"
                    :key="match.id"
                    :match="match"
                    :status-config="matchStatusConfig"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Knockout / playoff rounds keep the left-to-right rail. -->
          <div v-if="knockoutRounds.length" class="scroll-x">
            <div class="flex gap-6 pb-4">
              <div v-for="round in knockoutRounds" :key="round.round" class="min-w-[220px] flex-1">
                <h3 class="mb-3 text-sm font-medium text-fg-secondary">
                  {{ roundLabel(round.round) }}
                </h3>
                <div class="space-y-3">
                  <BracketMatchCard
                    v-for="match in round.matches"
                    :key="match.id"
                    :match="match"
                    :status-config="matchStatusConfig"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty Bracket Preview (before generation) -->
        <div v-else-if="emptyBracketRounds.length" class="scroll-x">
          <p class="mb-4 text-sm text-fg-muted">
            Bracket preview ({{ tournament?.max_participants ?? 8 }} players) — Click "Generate
            Bracket" to assign players
          </p>
          <div class="flex gap-6 pb-4">
            <div
              v-for="round in emptyBracketRounds"
              :key="round.round"
              class="min-w-[220px] flex-1"
            >
              <h3 class="mb-3 text-sm font-medium text-fg-secondary">
                {{ round.name }}
              </h3>
              <div class="space-y-3">
                <div
                  v-for="match in round.matches"
                  :key="match.id"
                  class="rounded-lg border border-dashed border-border-strong bg-surface-2/30 p-3"
                >
                  <!-- Participant 1 -->
                  <div class="flex items-center justify-between rounded-md bg-canvas/50 px-2 py-1">
                    <span class="text-sm text-fg-muted">TBD</span>
                  </div>

                  <div class="my-1 text-center text-xs text-fg-muted">vs</div>

                  <!-- Participant 2 -->
                  <div class="flex items-center justify-between rounded-md bg-canvas/50 px-2 py-1">
                    <span class="text-sm text-fg-muted">TBD</span>
                  </div>

                  <!-- Match Number -->
                  <div class="mt-2 text-center">
                    <span class="text-xs text-fg-muted">Match {{ match.match_number }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- No bracket possible -->
        <p v-else class="text-fg-muted">Configure tournament settings to see bracket preview.</p>
      </div>

      <!-- Back Link -->
      <div class="mt-6 text-center">
        <NuxtLink to="/events" class="text-sm text-primary hover:underline">
          Back to events
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
