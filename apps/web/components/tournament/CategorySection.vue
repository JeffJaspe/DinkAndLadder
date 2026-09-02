<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import type {
  BracketDto,
  LiveBracketScore,
  RecordBracketResultInput
} from '~/server/domains/event/dto/bracket.dto'
import type {
  TournamentDto,
  TournamentRegistrationWithPlayerDto
} from '~/server/domains/event/dto/tournament.dto'
import type {
  TournamentCategoryDto,
  TournamentCategoryTemplateDto,
  UpdateTournamentCategoryInput
} from '~/server/domains/event/dto/tournament-category.dto'
import {
  resolveBracketLock,
  resolveMatchType
} from '~/server/domains/event/dto/tournament-category.dto'
import {
  resolveEntrantRating,
  SLOT_HOLDING_REGISTRATION_STATUSES
} from '~/server/domains/event/dto/tournament.dto'
import { bandExclusionReason } from '~/utils/rating-bands'
import type { PlatformFeeRule } from '~/utils/convenience-fee'
import type { PartnerDto } from '~/server/domains/partnership/dto/partnership.dto'
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'
import { byRegistrationOrder } from '~/utils/bracket-preview'

/**
 * The whole body of a tournament event: its categories, one card each.
 *
 * Everything the cards need is fetched and mutated here so the cards stay
 * presentational — props in, events out — and can be mounted in a test without
 * a Nuxt fetch layer. The event page keeps only the header.
 *
 * One bracket request covers the page, not one per card. A collapsed card still
 * shows what is on next, so every category's draw is needed at load; asking for
 * each one separately would be N requests to render the first screen. The
 * endpoint returns every match when `category_id` is omitted, and the split is
 * done here.
 */
const props = defineProps<{
  event: EventDto
  /**
   * Whether this caller is exempt from the entry fee, decided server-side by
   * the event endpoint. Optional so a caller that has not been updated simply
   * quotes the ordinary price rather than breaking.
   */
  feeWaiver?: { waived: boolean; reason: string | null } | null
  tournament: TournamentDto
  /** Organiser, in club mode — may change the tournament's shape. */
  canManage: boolean
  isOrganizer: boolean
  myPlayerId: string | null
}>()

const router = useRouter()
const route = useRoute()

// --- Data ---
const { data: categoriesResponse, refresh: refreshCategories } = await useFetch<{
  data: TournamentCategoryDto[]
}>(`/api/v1/tournaments/${props.tournament.id}/categories`)
const categories = computed(() => categoriesResponse.value?.data ?? [])

const { data: templatesResponse } = await useFetch<{ data: TournamentCategoryTemplateDto[] }>(
  '/api/v1/tournament-category-templates',
  { default: () => ({ data: [] }) }
)
const templates = computed(() => templatesResponse.value?.data ?? [])
/**
 * A band is used up by a MATCH TYPE, not on its own.
 *
 * Keyed by template id alone, adding "4.5 Singles" removed the 4.5 band from
 * the picker entirely and "4.5 Doubles" could never be created — which is
 * exactly the pair of categories a weekend most often runs.
 */
const usedTemplates = computed(() =>
  categories.value
    .filter((c) => !!c.template_id)
    .map((c) => ({
      template_id: c.template_id!,
      match_type: resolveMatchType(c, props.tournament.match_type)
    }))
)

const {
  data: registrationsData,
  pending: regPending,
  refresh: refreshRegistrations
} = await useFetch<{ registrations: TournamentRegistrationWithPlayerDto[] }>(
  `/api/v1/tournaments/${props.tournament.id}/registrations`,
  { default: () => ({ registrations: [] }) }
)
const registrations = computed(() => registrationsData.value?.registrations ?? [])

const {
  data: wholeBracket,
  pending: bracketPending,
  error: bracketError,
  refresh: refreshBracket
} = await useFetch<BracketDto>(`/api/v1/tournaments/${props.tournament.id}/bracket`)

const { data: myPartnersData } = await useFetch<{ data: PartnerDto[] }>(
  '/api/v1/players/me/partners',
  { server: false, default: () => ({ data: [] }) }
)
const partners = computed(() => myPartnersData.value?.data ?? [])

/**
 * The convenience-fee ladder, so the register dialog can quote a real total
 * rather than only the entry fee. Public and cached for the page.
 */
const { data: feeRulesData } = await useFetch<{ data: PlatformFeeRule[] }>(
  '/api/v1/platform/fee-rules',
  { default: () => ({ data: [] }) }
)
const feeRules = computed(() => feeRulesData.value?.data ?? [])

/**
 * The reader's own ratings, so a category they cannot enter says so instead of
 * offering a button that fails on submit.
 *
 * Both disciplines, because which one a category is judged by follows that
 * category's match type — the same rule the server applies.
 */
const { data: myRatings } = await useFetch<{
  singles: { rating_value: number | null } | null
  doubles: { rating_value: number | null } | null
}>('/api/v1/players/me/ratings', {
  server: false,
  ignoreResponseError: true,
  default: () => ({ singles: null, doubles: null })
})

function myRatingFor(category: TournamentCategoryDto | null): number | null {
  const matchType = resolveMatchType(category, props.tournament.match_type)
  return resolveEntrantRating(
    {
      singles_rating: myRatings.value?.singles?.rating_value ?? null,
      doubles_rating: myRatings.value?.doubles?.rating_value ?? null
    },
    matchType
  )
}

/**
 * Why this category is closed to the reader, or null if it is not.
 *
 * Shares `bandExclusionReason` with the server check, so the sentence on screen
 * is generated by the same rule that would refuse the entry — including the
 * round-to-one-decimal step that decides which band a 3.550 belongs to.
 */
function bandReasonFor(category: TournamentCategoryDto | null): string | null {
  if (!category) return null
  if (category.min_rating == null && category.max_rating == null) return null
  return bandExclusionReason(myRatingFor(category), category.min_rating, category.max_rating)
}

/**
 * Everyone already holding a slot in a category, whichever column put them
 * there. A doubles entry is one row carrying two people, so a partner counts
 * every bit as much as the registrant — this is the client-side half of the
 * one-entry-per-category rule, used to keep taken players out of the partner
 * picker rather than letting the server refuse the submit.
 */
function entrantIdsFor(category: TournamentCategoryDto | null): Set<string> {
  const ids = new Set<string>()
  for (const reg of registrations.value) {
    if ((reg.category_id ?? null) !== (category?.id ?? null)) continue
    ids.add(reg.player_id)
    if (reg.partner_player_id) ids.add(reg.partner_player_id)
  }
  return ids
}

/**
 * Registration review is open to club staff as well as the organiser, in either
 * account mode — it is queue work at a live event, and making someone switch
 * hats to approve an entry costs a real person real time. Mirrors
 * `assertCanReviewRegistrations` in event.service.ts, which is the authority.
 */
const REVIEW_ROLES = ['OWNER', 'ADMIN', 'MODERATOR']

const { data: myClubs } = await useFetch<{ items: MyClubMembershipDto[] }>('/api/v1/clubs/mine', {
  ignoreResponseError: true,
  default: () => ({ items: [] })
})

const canReview = computed(() => {
  if (props.isOrganizer) return true
  const membership = myClubs.value?.items?.find(
    (m) => m.club.id === props.event.club_id && m.status === 'active'
  )
  return REVIEW_ROLES.includes(membership?.role ?? '')
})

// --- Splitting one bracket into per-category draws ---
/**
 * `groupByRound` on the server buckets by round number across the whole
 * tournament, so round 1 of the 3.5 draw and round 1 of the 4.0 draw arrive in
 * the same bucket. Flatten first, partition by category, then regroup — or a
 * card would show another category's matches.
 */
/**
 * Whether a category's draw has been frozen by the organiser.
 *
 * The lock lives on the category row (and on the tournament for the
 * category-less path), which is the same two-table contract `resolveMatchType`
 * and `resolveFormat` use — see `resolveBracketLock`.
 */
function lockedFor(categoryId: string | null): boolean {
  if (categoryId === null) return props.tournament.bracket_locked_at !== null
  const category = categories.value.find((c) => c.id === categoryId)
  return resolveBracketLock(category ?? null, props.tournament.bracket_locked_at) !== null
}

const bracketByCategory = computed(() => {
  const out = new Map<string | null, BracketDto>()
  const all = (wholeBracket.value?.rounds ?? []).flatMap((round) =>
    round.matches.map((match) => ({ match, round: round.round }))
  )

  for (const { match, round } of all) {
    const key = match.category_id
    let bracket = out.get(key)
    if (!bracket) {
      bracket = {
        tournament_id: props.tournament.id,
        category_id: key,
        // The combined fetch covers every category at once, so a single
        // `locked` on the response could not describe a weekend where the 3.5
        // draw is final and the 4.0 is still being seeded. Each card reads its
        // own category's lock instead.
        locked: lockedFor(key),
        rounds: []
      }
      out.set(key, bracket)
    }
    let bucket = bracket.rounds.find((r) => r.round === round)
    if (!bucket) {
      bucket = { round, matches: [] }
      bracket.rounds.push(bucket)
    }
    bucket.matches.push(match)
  }

  for (const bracket of out.values()) {
    bracket.rounds.sort((a, b) => a.round - b.round)
    for (const r of bracket.rounds) r.matches.sort((a, b) => a.position - b.position)
  }
  return out
})

function bracketFor(categoryId: string | null): BracketDto {
  return (
    bracketByCategory.value.get(categoryId) ?? {
      tournament_id: props.tournament.id,
      category_id: categoryId,
      // A category with no matches still has a lock state, and the card needs
      // it: "no draw yet" and "draw not published yet" look identical from an
      // empty rounds list and mean opposite things to the reader.
      locked: lockedFor(categoryId),
      rounds: []
    }
  )
}

// --- Per-category counts ---
/**
 * Vacancy counts CONFIRMED entries only: a pending entry is awaiting the
 * organiser and does not hold a place. The bracket generator agrees (F-23) —
 * it seeds confirmed only.
 */
interface CategoryStats {
  confirmed: TournamentRegistrationWithPlayerDto[]
  pending: TournamentRegistrationWithPlayerDto[]
  capacity: number | null
  isFull: boolean
  mine: TournamentRegistrationWithPlayerDto | null
  vacancyLabel: string
}

/**
 * Which of the reader's rows in a category is the one that counts.
 *
 * A player can legitimately have more than one row here: a rejected entry from
 * an earlier attempt sits alongside the confirmed one that replaced it, because
 * the list endpoint filters out `withdrawn` and nothing else. Picking the first
 * match meant picking the oldest, which is usually the dead one.
 */
function pickMyEntry(
  inCategory: TournamentRegistrationWithPlayerDto[]
): TournamentRegistrationWithPlayerDto | null {
  const mine = inCategory.filter(
    (r) =>
      (r.player_id === props.myPlayerId || r.partner_player_id === props.myPlayerId) &&
      SLOT_HOLDING_REGISTRATION_STATUSES.includes(r.status)
  )
  return mine.find((r) => r.status === 'confirmed') ?? mine[0] ?? null
}

function buildStats(
  inCategory: TournamentRegistrationWithPlayerDto[],
  capacity: number | null
): CategoryStats {
  const confirmed = inCategory.filter((r) => r.status === 'confirmed')
  const vacant = capacity === null ? null : Math.max(0, capacity - confirmed.length)
  const isFull = vacant !== null && vacant === 0

  let vacancyLabel: string
  if (capacity === null) {
    vacancyLabel = `${confirmed.length} registered`
  } else if (isFull) {
    vacancyLabel = `Full — ${capacity}/${capacity}`
  } else {
    vacancyLabel = `${confirmed.length}/${capacity} · ${vacant} ${vacant === 1 ? 'place' : 'places'} left`
  }

  return {
    confirmed,
    pending: inCategory.filter((r) => r.status === 'pending'),
    capacity,
    isFull,
    /**
     * The reader's own live entry in this category, if they have one.
     *
     * Either column, because a doubles entry is one row carrying two people —
     * matching `player_id` alone told the named partner they were not in a
     * category they were already entered in.
     *
     * And only a SLOT-HOLDING status. The list endpoint drops withdrawn rows
     * but not rejected ones, and returns them oldest-first, so a player with a
     * rejected entry from Monday and a confirmed one from Friday had the
     * rejected row picked — and the card read "Pending approval" for an entry
     * that was actually confirmed. Confirmed wins over pending for the same
     * reason: the stronger claim is the true one.
     */
    mine: pickMyEntry(inCategory),
    vacancyLabel
  }
}

function statsFor(category: TournamentCategoryDto | null): CategoryStats {
  if (!category) {
    return buildStats(registrations.value, props.tournament.max_participants ?? null)
  }
  return buildStats(
    registrations.value.filter((r) => r.category_id === category.id),
    category.max_participants
  )
}

/**
 * Who is in, in the order they entered.
 *
 * This used to mirror `sortBySeed` in bracket.service.ts (rating descending,
 * unrated last) so that a pre-generation list read as a seeding prediction. It
 * now feeds a PLACEHOLDER draw, which is a picture of the shape rather than a
 * claim about who plays whom — and registration order is the one ordering that
 * needs no explaining and cannot go stale when a rating moves.
 *
 * The two genuinely differ once a field is rated, so `PREVIEW_ORDER_NOTE` says
 * so on screen. Generation still seeds by rating.
 */
function seedPreviewFor(stats: CategoryStats) {
  return byRegistrationOrder(stats.confirmed)
}

/** A tournament with no categories still works: one implicit card. */
const cards = computed(() => (categories.value.length ? categories.value : [null]))

/**
 * Which card is open — exactly one, or none.
 *
 * This was a Set, so every card could be open at once. On a weekend running six
 * categories that turned the page into six stacked full-height panels, and the
 * card you wanted was always below the fold. One at a time keeps the list of
 * categories readable as a list, which is what it is for.
 */
const openId = ref<string | null>(null)

function keyFor(category: TournamentCategoryDto | null) {
  return category?.id ?? 'all'
}

function isOpen(category: TournamentCategoryDto | null) {
  return openId.value === keyFor(category)
}

function toggle(category: TournamentCategoryDto | null) {
  const key = keyFor(category)
  openId.value = openId.value === key ? null : key
}

/**
 * `?category=` used to select a tab on the old two-level page. Those links are
 * in the wild, so they now open that card instead of landing on a page with
 * everything shut.
 */
watch(
  [categories, () => route.query.category],
  ([cats, fromQuery]) => {
    const wanted = Array.isArray(fromQuery) ? fromQuery[0] : fromQuery
    if (wanted && cats.some((c) => c.id === wanted)) {
      openId.value = wanted
    } else if (openId.value === null && cats.length === 1) {
      // A single category has nothing to choose between; leaving it shut would
      // be one pointless click on every visit.
      openId.value = cats[0].id
    } else if (openId.value === null && !cats.length) {
      openId.value = 'all'
    }
  },
  { immediate: true }
)

// --- Mutations ---
const partnerByCategory = reactive<Record<string, string>>({})
const defaultPartnerId = computed(() => partners.value.find((p) => p.is_default)?.player_id ?? '')

/**
 * The partners still free to be named in this category.
 *
 * Offering someone who already holds a slot produces a button that can only
 * fail, so they are removed from the picker rather than refused on submit.
 */
function availablePartnersFor(category: TournamentCategoryDto | null): PartnerDto[] {
  const taken = entrantIdsFor(category)
  return partners.value.filter((partner) => !taken.has(partner.player_id))
}

function partnerFor(category: TournamentCategoryDto | null): string {
  const explicit = partnerByCategory[keyFor(category)]
  const chosen = explicit !== undefined ? explicit : defaultPartnerId.value
  // The default duo may itself already be in this category, in which case
  // pre-selecting them would arm a button that cannot succeed.
  return chosen && entrantIdsFor(category).has(chosen) ? '' : chosen
}

function setPartnerFor(category: TournamentCategoryDto | null, playerId: string) {
  partnerByCategory[keyFor(category)] = playerId
}

const registeringKey = ref<string | null>(null)
const registerErrors = reactive<Record<string, string>>({})

/**
 * "You need a partner" is a dialog, not a line of red text under a button.
 *
 * It is the one refusal a player cannot act on from this screen — the fix is to
 * go and link a partner in Community — so it gets the same themed, focus-trapped
 * treatment as every other blocking action (docs/33 §7) rather than a message
 * that scrolls away with the card.
 */
const partnerPromptOpen = ref(false)
const partnerPromptHasPartners = ref(false)

async function register(category: TournamentCategoryDto | null) {
  const key = keyFor(category)
  registerErrors[key] = ''

  // The category's own type, not the tournament's — a singles category of a
  // doubles tournament must not demand a partner.
  const isDoubles = resolveMatchType(category, props.tournament.match_type) === 'doubles'
  const partnerPlayerId = isDoubles ? partnerFor(category) : ''
  // Caught here rather than letting the server answer PARTNER_REQUIRED, so the
  // message names the missing control instead of describing an API rule.
  if (isDoubles && !partnerPlayerId) {
    partnerPromptHasPartners.value = availablePartnersFor(category).length > 0
    partnerPromptOpen.value = true
    return
  }

  // Everything checks out, so show what it costs before committing them.
  pendingRegistration.value = { category, partnerPlayerId }
  summaryOpen.value = true
}

/** The entry the summary dialog is quoting for, until it is confirmed. */
const summaryOpen = ref(false)
const pendingRegistration = ref<{
  category: TournamentCategoryDto | null
  partnerPlayerId: string
} | null>(null)

const summaryCategory = computed(() => pendingRegistration.value?.category ?? null)
const summaryPartnerName = computed(() => {
  const id = pendingRegistration.value?.partnerPlayerId
  return id ? (partners.value.find((p) => p.player_id === id)?.display_name ?? null) : null
})
const summaryKey = computed(() => keyFor(summaryCategory.value))

async function confirmRegistration() {
  const entry = pendingRegistration.value
  if (!entry) return
  const { category, partnerPlayerId } = entry
  const key = keyFor(category)

  registeringKey.value = key
  try {
    await $fetch(`/api/v1/tournaments/${props.tournament.id}/registrations`, {
      method: 'POST',
      body: { category_id: category?.id ?? null, partner_player_id: partnerPlayerId || null }
    })
    await refreshRegistrations()
    // Only on success: a failed entry keeps the dialog up with its reason, so
    // the player can fix the problem without rebuilding the whole choice.
    summaryOpen.value = false
    pendingRegistration.value = null
  } catch (err) {
    registerErrors[key] = apiErrorMessage(err, 'Registration failed.')
  } finally {
    registeringKey.value = null
  }
}

/**
 * Leaving a category you have entered but that nobody has approved yet.
 *
 * Deliberately limited to a PENDING entry. Once an organiser has confirmed you
 * they may have drawn you into a bracket and taken your fee, so pulling out is
 * a conversation with them, not a button — and any refund is theirs to make.
 *
 * The endpoint has existed since the tournament domain was built and nothing
 * ever called it; withdrawing was only ever possible at event level, which is a
 * different table and means nothing for a category entry.
 */
const withdrawingKey = ref<string | null>(null)
const withdrawErrors = reactive<Record<string, string>>({})

async function withdraw(category: TournamentCategoryDto | null, registrationId: string) {
  const key = keyFor(category)
  withdrawErrors[key] = ''
  withdrawingKey.value = key
  try {
    await $fetch(`/api/v1/registrations/${registrationId}/withdraw`, { method: 'POST' })
    await refreshRegistrations()
  } catch (err) {
    withdrawErrors[key] = apiErrorMessage(err, 'Could not withdraw from this category.')
  } finally {
    withdrawingKey.value = null
  }
}

/** Binning a category that is not going to be played. */
const trashingId = ref<string | null>(null)
const trashErrors = reactive<Record<string, string>>({})

async function trash(categoryId: string) {
  trashErrors[categoryId] = ''
  trashingId.value = categoryId
  try {
    await $fetch(`/api/v1/tournament-categories/${categoryId}`, { method: 'DELETE' })
    if (openId.value === categoryId) openId.value = null
    await Promise.all([refreshCategories(), refreshRegistrations(), refreshBracket()])
  } catch (err) {
    trashErrors[categoryId] = apiErrorMessage(err, 'Could not remove this category.')
  } finally {
    trashingId.value = null
  }
}

const reviewingId = ref<string | null>(null)
const reviewError = ref('')

/**
 * `confirmed` and `rejected` are the two answers the endpoint takes for a
 * pending entry; `waitlisted` exists too but there is no UI concept for a
 * waitlist yet, so it is not offered rather than half-built.
 */
async function review(registrationId: string, status: 'confirmed' | 'rejected') {
  reviewError.value = ''
  reviewingId.value = registrationId
  try {
    await $fetch(`/api/v1/registrations/${registrationId}`, {
      method: 'PATCH',
      body: { status }
    })
    await refreshRegistrations()
  } catch (err) {
    reviewError.value = apiErrorMessage(err, 'Could not update that registration.')
  } finally {
    reviewingId.value = null
  }
}

const generatingKey = ref<string | null>(null)
const generateErrors = reactive<Record<string, string>>({})

async function generate(category: TournamentCategoryDto | null) {
  const key = keyFor(category)
  generateErrors[key] = ''
  generatingKey.value = key
  try {
    await $fetch(`/api/v1/tournaments/${props.tournament.id}/generate-bracket`, {
      method: 'POST',
      body: categories.value.length ? { category_id: category?.id ?? null } : {}
    })
    await refreshBracket()
  } catch (err) {
    generateErrors[key] = apiErrorMessage(err, 'Could not generate the draw.')
  } finally {
    generatingKey.value = null
  }
}

/**
 * The rest of the draw's lifecycle: take it back, or publish it.
 *
 * Undo and lock share one pending flag and one error slot per card — they are
 * mutually exclusive in the UI (you cannot undo a locked draw, and there is
 * nothing to lock once it is undone), so separate state would only be state
 * that can never differ.
 */
const undoingKey = ref<string | null>(null)
const lockingKey = ref<string | null>(null)
const lifecycleErrors = reactive<Record<string, string>>({})

async function undoDraw(category: TournamentCategoryDto | null) {
  const key = keyFor(category)
  lifecycleErrors[key] = ''
  undoingKey.value = key
  try {
    await $fetch(`/api/v1/tournaments/${props.tournament.id}/bracket`, {
      method: 'DELETE',
      body: categories.value.length ? { category_id: category?.id ?? null } : {}
    })
    await refreshBracket()
  } catch (err) {
    lifecycleErrors[key] = apiErrorMessage(err, 'Could not remove the draw.')
  } finally {
    undoingKey.value = null
  }
}

async function setLocked(category: TournamentCategoryDto | null, locked: boolean) {
  const key = keyFor(category)
  lifecycleErrors[key] = ''
  lockingKey.value = key
  try {
    await $fetch(`/api/v1/tournaments/${props.tournament.id}/bracket/lock`, {
      method: 'POST',
      body: { category_id: category?.id ?? null, locked }
    })
    // The lock lives on the category row, so the categories list is stale too —
    // not just the draw.
    await Promise.all([refreshBracket(), refreshCategories()])
  } catch (err) {
    lifecycleErrors[key] = apiErrorMessage(
      err,
      locked ? 'Could not lock the draw.' : 'Could not unlock the draw.'
    )
  } finally {
    lockingKey.value = null
  }
}

const savingCategoryId = ref<string | null>(null)
const categoryErrors = reactive<Record<string, string>>({})

async function saveCategory(categoryId: string, input: UpdateTournamentCategoryInput) {
  categoryErrors[categoryId] = ''
  savingCategoryId.value = categoryId
  try {
    await $fetch(`/api/v1/tournament-categories/${categoryId}`, {
      method: 'PATCH',
      body: input
    })
    await refreshCategories()
  } catch (err) {
    categoryErrors[categoryId] = apiErrorMessage(err, 'Could not save the category.')
  } finally {
    savingCategoryId.value = null
  }
}

const completingId = ref<string | null>(null)
const completeErrors = reactive<Record<string, string>>({})

async function complete(categoryId: string) {
  completeErrors[categoryId] = ''
  completingId.value = categoryId
  try {
    await $fetch(`/api/v1/tournament-categories/${categoryId}`, {
      method: 'PATCH',
      body: { status: 'completed' }
    })
    await refreshCategories()
  } catch (err) {
    completeErrors[categoryId] = apiErrorMessage(err, 'Could not finish the category.')
  } finally {
    completingId.value = null
  }
}

const recordingId = ref<string | null>(null)
const recordError = ref('')

async function record(bracketMatchId: string, input: RecordBracketResultInput) {
  recordError.value = ''
  recordingId.value = bracketMatchId
  try {
    await $fetch(`/api/v1/bracket-matches/${bracketMatchId}/result`, {
      method: 'POST',
      body: input
    })
    // The draw moves the winner on, so the whole bracket is stale, not one row.
    await refreshBracket()
  } catch (err) {
    recordError.value = apiErrorMessage(err, 'Could not record the result.')
  } finally {
    recordingId.value = null
  }
}

/**
 * Live scoring for a draw match.
 *
 * Starting a match is not recording a result: a started match has no winner
 * and no `matches` row, so nothing has entered anybody's record. It gives
 * spectators a score to watch while it is played; the result still goes
 * through record() and its verification semantics.
 */
async function startMatch(bracketMatchId: string) {
  recordError.value = ''
  try {
    await $fetch(`/api/v1/bracket-matches/${bracketMatchId}/start`, { method: 'POST' })
    await refreshBracket()
  } catch (err) {
    recordError.value = apiErrorMessage(err, 'Could not start the match.')
  }
}

/**
 * Called on every point, so it deliberately does NOT refresh the whole bracket:
 * a draw refetch per tap makes the scoreboard lag behind the person pressing
 * the button. The poll picks it up for everyone else.
 *
 * That is what this comment always said, and the line under it did the
 * opposite — `await refreshBracket()` on every point, so each tap cost the
 * write plus a full re-read of the draw before the number moved. The row shows
 * the tap immediately now; only a failure needs to re-read, to put the score
 * back to whatever the server actually holds.
 */
async function updateLiveScore(bracketMatchId: string, scores: LiveBracketScore[]) {
  try {
    await $fetch(`/api/v1/bracket-matches/${bracketMatchId}/score`, {
      method: 'PATCH',
      body: { scores }
    })
  } catch (err) {
    recordError.value = apiErrorMessage(err, 'Could not update the score.')
    await refreshBracket()
  }
}

const addingCategory = ref(false)
const addCategoryError = ref('')

async function addCategory(body: Record<string, unknown>) {
  addCategoryError.value = ''
  addingCategory.value = true
  try {
    await $fetch(`/api/v1/tournaments/${props.tournament.id}/categories`, {
      method: 'POST',
      body
    })
    await refreshCategories()
  } catch (err) {
    addCategoryError.value = apiErrorMessage(err, 'Could not add the category.')
  } finally {
    addingCategory.value = false
  }
}

function openPlayer(playerId: string) {
  router.push(`/players/${playerId}`)
}
</script>

<template>
  <section>
    <h2 class="mb-3 text-sm font-medium uppercase tracking-wide text-fg-muted">Categories</h2>

    <div v-if="regPending" class="space-y-3">
      <div v-for="i in 2" :key="i" class="h-28 animate-pulse rounded-xl bg-surface-2" />
    </div>

    <div v-else class="space-y-3">
      <TournamentCategoryCard
        v-for="category in cards"
        :key="keyFor(category)"
        :category="category"
        :tournament="tournament"
        :bracket="bracketFor(category?.id ?? null)"
        :bracket-pending="bracketPending"
        :bracket-error="!!bracketError"
        :confirmed="statsFor(category).confirmed"
        :pending="statsFor(category).pending"
        :my-registration="statsFor(category).mine"
        :signed-in="!!myPlayerId"
        :my-player-id="myPlayerId"
        :vacancy-label="statsFor(category).vacancyLabel"
        :is-full="statsFor(category).isFull"
        :expanded="isOpen(category)"
        :can-manage="canManage"
        :can-review="canReview"
        :partners="availablePartnersFor(category)"
        :all-partner-count="partners.length"
        :band-reason="bandReasonFor(category)"
        :partner-id="partnerFor(category)"
        :registering="registeringKey === keyFor(category)"
        :register-error="registerErrors[keyFor(category)] ?? ''"
        :reviewing-id="reviewingId"
        :review-error="reviewError"
        :generating="generatingKey === keyFor(category)"
        :generate-error="generateErrors[keyFor(category)] ?? ''"
        :undoing="undoingKey === keyFor(category)"
        :locking="lockingKey === keyFor(category)"
        :lifecycle-error="lifecycleErrors[keyFor(category)] ?? ''"
        :saving-category="savingCategoryId === category?.id"
        :category-error="category ? (categoryErrors[category.id] ?? '') : ''"
        :completing="completingId === category?.id"
        :complete-error="category ? (completeErrors[category.id] ?? '') : ''"
        :withdrawing="withdrawingKey === keyFor(category)"
        :withdraw-error="withdrawErrors[keyFor(category)] ?? ''"
        :trashing="trashingId === category?.id"
        :trash-error="category ? (trashErrors[category.id] ?? '') : ''"
        :recording-id="recordingId"
        :record-error="recordError"
        :seed-preview="seedPreviewFor(statsFor(category))"
        @toggle="toggle(category)"
        @register="register(category)"
        @update:partner-id="(id) => setPartnerFor(category, id)"
        @review="review"
        @generate="generate(category)"
        @undo="undoDraw(category)"
        @set-locked="(v) => setLocked(category, v)"
        @save="saveCategory"
        @complete="complete"
        @withdraw="(registrationId) => withdraw(category, registrationId)"
        @trash="trash"
        @record="record"
        @start-match="startMatch"
        @live-score="updateLiveScore"
        @select-player="openPlayer"
      />

      <TournamentCategoryCreateCard
        v-if="canManage"
        :templates="templates"
        :used-templates="usedTemplates"
        :default-match-type="tournament.match_type"
        :default-format="tournament.format"
        :adding="addingCategory"
        :error="addCategoryError"
        @add-template="(input) => addCategory({ ...input })"
        @add-custom="(input) => addCategory({ ...input })"
      />
    </div>

    <!-- What entering costs, before committing to it. Doubles is the sharp
         case: a pair is two entries on one row, so the amount is double the
         number printed on the event and nothing used to say so. -->
    <TournamentRegisterSummaryModal
      v-model="summaryOpen"
      :category-name="summaryCategory?.name ?? 'All players'"
      :is-doubles="resolveMatchType(summaryCategory, tournament.match_type) === 'doubles'"
      :partner-name="summaryPartnerName"
      :fee-amount="event.fee_amount"
      :fee-currency="event.fee_currency ?? 'PHP'"
      :rules="feeRules"
      :fee-waiver="feeWaiver ?? null"
      :submitting="registeringKey === summaryKey"
      :error="registerErrors[summaryKey] ?? ''"
      @confirm="confirmRegistration"
    />

    <!-- A doubles entry needs two people, and the fix is not on this screen. -->
    <UiModal
      v-model="partnerPromptOpen"
      title="You need a partner for this category"
      :description="
        partnerPromptHasPartners
          ? 'This is a doubles category, so pick who you are playing with before you register.'
          : 'This is a doubles category. Link a duo partner in Community first — both of you enter on one entry.'
      "
      :confirm-label="partnerPromptHasPartners ? 'Got it' : 'Find a partner'"
      cancel-label="Close"
      @confirm="
        partnerPromptHasPartners
          ? (partnerPromptOpen = false)
          : navigateTo('/community?tab=partners')
      "
    />
  </section>
</template>
