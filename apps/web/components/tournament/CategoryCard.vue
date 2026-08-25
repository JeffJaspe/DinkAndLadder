<script setup lang="ts">
import type { BracketDto, RecordBracketResultInput } from '~/server/domains/event/dto/bracket.dto'
import type {
  TournamentDto,
  TournamentRegistrationWithPlayerDto
} from '~/server/domains/event/dto/tournament.dto'
import type {
  TournamentCategoryDto,
  UpdateTournamentCategoryInput
} from '~/server/domains/event/dto/tournament-category.dto'
import { resolveFormat, resolveMatchType } from '~/server/domains/event/dto/tournament-category.dto'
import type { PartnerDto } from '~/server/domains/partnership/dto/partnership.dto'
import { isDrawDecided } from '~/utils/bracket-schedule'
import { formatLabel } from '~/utils/tournament-formats'
import { ratingRangeLabel } from '~/utils/rating-bands'

/**
 * One category, whole.
 *
 * Everything scoped to a category lives in its own card: who is in it, when
 * they play, the draw, the result, and the button that puts you in it. The page
 * used to spread this across two stacked tab bars — pick a category, then pick
 * one of six views of it — so seeing two categories meant driving the same
 * matrix twice and holding the difference in your head.
 *
 * Collapsed, a card is a summary plus what is on next. Open, it is the whole
 * category. Several can be open at once, deliberately: an organiser running two
 * draws at the same time needs both in view.
 */
const props = defineProps<{
  /** Null on the flat, category-less path of a legacy tournament. */
  category: TournamentCategoryDto | null
  tournament: TournamentDto
  bracket: BracketDto | null
  bracketPending: boolean
  bracketError: boolean
  confirmed: TournamentRegistrationWithPlayerDto[]
  pending: TournamentRegistrationWithPlayerDto[]
  myRegistration: TournamentRegistrationWithPlayerDto | null
  signedIn: boolean
  myPlayerId: string | null
  vacancyLabel: string
  isFull: boolean
  expanded: boolean
  canManage: boolean
  canReview: boolean
  /** Only those not already holding a slot in this category. */
  partners: PartnerDto[]
  /** How many the reader has in total, to tell "none linked" from "all taken". */
  allPartnerCount: number
  /** Why the reader's rating bars them from this category, or null. */
  bandReason: string | null
  partnerId: string
  registering: boolean
  registerError: string
  reviewingId: string | null
  reviewError: string
  generating: boolean
  generateError: string
  undoing: boolean
  locking: boolean
  lifecycleError: string
  savingCategory: boolean
  categoryError: string
  completing: boolean
  completeError: string
  withdrawing: boolean
  withdrawError: string
  trashing: boolean
  trashError: string
  recordingId: string | null
  recordError: string
  seedPreview: TournamentRegistrationWithPlayerDto[]
}>()

const emit = defineEmits<{
  toggle: []
  register: []
  'update:partnerId': [playerId: string]
  review: [registrationId: string, status: 'confirmed' | 'rejected']
  generate: []
  undo: []
  'set-locked': [locked: boolean]
  save: [categoryId: string, input: UpdateTournamentCategoryInput]
  complete: [categoryId: string]
  withdraw: [registrationId: string]
  trash: [categoryId: string]
  record: [bracketMatchId: string, input: RecordBracketResultInput]
  'select-player': [playerId: string]
}>()

const name = computed(() => props.category?.name ?? 'All players')

/**
 * Singles or doubles is a property of the CATEGORY.
 *
 * One weekend can run both, and nothing on a card used to say which it was —
 * the value lived only on the tournament, so every category silently shared it.
 * It sits next to the name because it is the first thing a player checks before
 * deciding whether they need a partner.
 */
const matchType = computed(() => resolveMatchType(props.category, props.tournament.match_type))
const isDoubles = computed(() => matchType.value === 'doubles')

/** Same resolution as matchType, for the same reason — see resolveFormat. */
const format = computed(() => resolveFormat(props.category, props.tournament.format))

/**
 * Standings appear only once the organiser says the category is done.
 *
 * Deliberately not derived from the draw being decided: a half-played category
 * that gets abandoned should not publish a table of results on its own, and a
 * result is a thing somebody declares.
 */
const isComplete = computed(() =>
  props.category ? props.category.status === 'completed' : props.tournament.status === 'completed'
)

/** What tells the organiser the draw is ready to be closed. */
const drawDecided = computed(() => isDrawDecided(props.bracket))

const statusLabel = computed(() => {
  if (isComplete.value) return 'Complete'
  if (drawDecided.value) return 'Draw decided'
  if (props.bracket?.rounds.length) return 'In progress'
  if (props.isFull) return 'Full'
  return 'Open'
})

const statusTone = computed(() => {
  if (isComplete.value) return 'bg-primary/15 text-primary'
  if (props.isFull && !props.bracket?.rounds.length) return 'bg-accent-soft text-on-accent'
  return 'bg-surface-2 text-fg-secondary'
})

const bandLabel = computed(() =>
  props.category ? ratingRangeLabel(props.category.min_rating, props.category.max_rating) : null
)

/**
 * A doubles category the reader has partners for, but none still free.
 *
 * Distinct from having no partners at all: the first is solved by withdrawing
 * or waiting, the second by going to Community. Telling a player "no partners
 * yet" when they have four — all already entered — sends them to fix the wrong
 * thing.
 */
const allPartnersTaken = computed(
  () => isDoubles.value && props.allPartnerCount > 0 && props.partners.length === 0
)

/** Registering is pointless if the band excludes them; the reason says why. */
const canRegister = computed(() => !props.bandReason && !props.isFull)

/**
 * What the reader's own entry says about itself.
 *
 * This was `status === 'confirmed' ? 'Registered' : 'Pending approval'`, which
 * quietly relabelled every other status as pending — so a waitlisted entry, and
 * more damagingly a REJECTED one, both read as "awaiting the organiser" and left
 * the player waiting for a decision that had already been made against them.
 * Each status now says its own name.
 */
const MY_STATUS: Record<string, { label: string; tone: string }> = {
  confirmed: { label: 'Registered', tone: 'bg-primary/20 text-primary' },
  pending: { label: 'Pending approval', tone: 'bg-warning-soft text-warning' },
  waitlisted: { label: 'On the waitlist', tone: 'bg-surface-2 text-fg-secondary' },
  rejected: { label: 'Entry declined', tone: 'bg-danger/10 text-danger' },
  withdrawn: { label: 'Withdrawn', tone: 'bg-surface-2 text-fg-muted' }
}

const myStatusLabel = computed(
  () => MY_STATUS[props.myRegistration?.status ?? '']?.label ?? 'Registered'
)
const myStatusTone = computed(
  () => MY_STATUS[props.myRegistration?.status ?? '']?.tone ?? 'bg-primary/20 text-primary'
)

// --- Sections inside an open card ---
type Section = 'players' | 'matches' | 'schedule' | 'draw' | 'results' | 'settings'

const section = ref<Section>('players')

const sections = computed(() => {
  const list: { value: Section; label: string; count?: number }[] = [
    { value: 'players', label: 'Players', count: props.confirmed.length },
    // Score entry, as a list ordered by what needs doing — the draw answers a
    // different question and is a poor place to type into.
    { value: 'matches', label: 'Matches' },
    { value: 'schedule', label: 'Schedule' },
    { value: 'draw', label: 'Draw' }
  ]
  // Only once it is a real thing to look at.
  if (isComplete.value) list.push({ value: 'results', label: 'Results' })
  if (props.canManage) list.push({ value: 'settings', label: 'Settings' })
  return list
})

// A card that closes and reopens should not remember a section that has since
// disappeared (Results vanishes if a category is reopened; Settings if the
// viewer switches out of club mode).
watch(sections, (list) => {
  if (!list.some((s) => s.value === section.value)) section.value = 'players'
})

const showCompleteConfirm = ref(false)
const showWithdrawConfirm = ref(false)
const showTrashConfirm = ref(false)

function confirmComplete() {
  if (!props.category) return
  emit('complete', props.category.id)
  showCompleteConfirm.value = false
}

/**
 * A pending entry is one the organiser has not looked at, so the player may
 * still take it back themselves. A confirmed one may already be in a drawn
 * bracket and paid for, which makes withdrawing a conversation with the
 * organiser rather than a button.
 */
const canWithdraw = computed(() => props.myRegistration?.status === 'pending')

function confirmWithdraw() {
  if (!props.myRegistration) return
  emit('withdraw', props.myRegistration.id)
  showWithdrawConfirm.value = false
}

/**
 * Finishing publishes the final standings, so it waits until there are final
 * standings to publish.
 *
 * This used to be available at any time with a note saying you could finish
 * anyway if the category was abandoned — which meant the commonest misclick on
 * the card published a half-played table as the result. An abandoned category
 * is now trashed instead, which says what actually happened.
 */
const canComplete = computed(() => drawDecided.value)

/**
 * Trashing is for a category that will not be played — postponed, cancelled,
 * nobody entered. It is a hard delete, so it is refused server-side once any
 * result exists: a played category is a record, and the way to close one is to
 * finish it.
 */
const hasResults = computed(() =>
  (props.bracket?.rounds ?? []).some((round) => round.matches.some((m) => !!m.match_id))
)

function confirmTrash() {
  if (!props.category) return
  emit('trash', props.category.id)
  showTrashConfirm.value = false
}
</script>

<template>
  <!-- Only one card is open at a time, so the open one is marked: a ring and a
       lifted surface, because on a list of six the reader needs to see at a
       glance which one they are inside. -->
  <div
    class="overflow-hidden rounded-xl shadow-card transition-colors"
    :class="expanded ? 'bg-surface ring-2 ring-primary' : 'bg-surface'"
  >
    <!-- Summary. Always visible, always enough to decide whether to open it. -->
    <button
      type="button"
      class="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-5 text-left transition-colors"
      :class="expanded ? 'bg-primary-soft' : ''"
      :aria-expanded="expanded"
      @click="emit('toggle')"
    >
      <UiIcon
        :name="expanded ? 'chevron-up' : 'chevron-down'"
        size="h-5 w-5"
        class="shrink-0 text-fg-muted"
      />

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 class="font-semibold text-fg">{{ name }}</h3>
          <span
            class="rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-medium capitalize text-on-accent"
          >
            {{ matchType }}
          </span>
          <span v-if="bandLabel" class="text-xs text-fg-muted">{{ bandLabel }}</span>
          <!-- The format decides whether one loss ends a player's day, so it
               belongs on the summary line beside the band, not two clicks in. -->
          <span class="text-xs text-fg-muted">· {{ formatLabel(format) }}</span>
        </div>
        <p class="mt-0.5 text-sm text-fg-muted">{{ vacancyLabel }}</p>
      </div>

      <span class="rounded-pill px-2.5 py-1 text-xs font-medium" :class="statusTone">
        {{ statusLabel }}
      </span>
    </button>

    <!-- What is on now, without opening anything. -->
    <div class="border-t border-border-strong/40 px-5 py-3">
      <TournamentCategoryUpNext :bracket="bracket" :loading="bracketPending" />
    </div>

    <div v-if="expanded" class="border-t border-border-strong/40 p-5">
      <!-- Registering is what a player came for, so it sits at the top of the
           category they are looking at rather than in a page-level bar that
           could only ever mean one category at a time. -->
      <div
        v-if="signedIn && !isComplete"
        class="mb-5 flex flex-wrap items-center gap-3 rounded-lg bg-canvas p-3"
      >
        <span class="min-w-0 flex-1 text-sm" :class="isFull ? 'text-warning' : 'text-fg-muted'">
          {{ vacancyLabel }}
        </span>

        <select
          v-if="isDoubles && !myRegistration && canRegister"
          :value="partnerId"
          :aria-label="`Partner for ${name}`"
          class="max-w-[12rem] rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg focus:border-primary focus:outline-none"
          @change="emit('update:partnerId', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            {{
              allPartnersTaken
                ? 'No partner available'
                : partners.length
                  ? 'Choose partner…'
                  : 'No partners yet'
            }}
          </option>
          <option v-for="mate in partners" :key="mate.player_id" :value="mate.player_id">
            {{ mate.display_name }}{{ mate.is_default ? ' ★ your duo' : '' }}
          </option>
        </select>

        <!-- The band decides whether registering is even possible, so the
             button is replaced by the reason rather than left to fail. -->
        <span v-if="!myRegistration && bandReason" class="text-sm text-warning">
          {{ bandReason }}
        </span>
        <button
          v-else-if="!myRegistration"
          type="button"
          :disabled="registering || isFull"
          class="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
          @click="emit('register')"
        >
          {{ registering ? 'Registering…' : isFull ? 'Full' : 'Register' }}
        </button>
        <span v-else class="rounded-lg px-3 py-1.5 text-sm" :class="myStatusTone">
          {{ myStatusLabel }}
        </span>

        <!-- Only while nobody has approved it. After that the organiser has a
             draw and possibly your money, so it goes through them. -->
        <button
          v-if="canWithdraw"
          type="button"
          :disabled="withdrawing"
          class="text-sm text-fg-muted underline-offset-2 hover:text-danger hover:underline disabled:opacity-50"
          @click="showWithdrawConfirm = true"
        >
          {{ withdrawing ? 'Withdrawing…' : 'Withdraw' }}
        </button>
      </div>
      <p v-if="withdrawError" role="alert" class="mb-4 text-sm text-danger">{{ withdrawError }}</p>

      <!-- Having partners but none free is a different problem from having
           none, and points at a different fix. -->
      <p v-if="allPartnersTaken && !myRegistration && !bandReason" class="mb-4 text-sm text-warning">
        No partner available — all of your linked partners are already in this category.
      </p>
      <p v-if="registerError" role="alert" class="mb-4 text-sm text-danger">{{ registerError }}</p>

      <!-- `query-key` null: several cards are open at once and would
           otherwise all write the same ?tab= param. -->
      <UiTabs v-model="section" :tabs="sections" :query-key="null" />

      <div class="mt-5">
        <TournamentCategoryPlayers
          v-if="section === 'players'"
          :confirmed="confirmed"
          :pending="pending"
          :can-review="canReview"
          :reviewing-id="reviewingId"
          :review-error="reviewError"
          @review="(id, status) => emit('review', id, status)"
        />

        <TournamentCategoryMatches
          v-else-if="section === 'matches'"
          :bracket="bracket"
          :can-manage="canManage"
          :recording-id="recordingId"
          :record-error="recordError"
          @record="(id, input) => emit('record', id, input)"
        />

        <TournamentCategorySchedule
          v-else-if="section === 'schedule'"
          :bracket="bracket"
          :confirmed="confirmed"
          :format="format"
          :my-player-id="myPlayerId"
          :can-manage="canManage"
          :recording-id="recordingId"
          :record-error="recordError"
          @record="(id, input) => emit('record', id, input)"
          @select-player="(id) => emit('select-player', id)"
        />

        <TournamentCategoryMatchups
          v-else-if="section === 'draw'"
          :bracket="bracket"
          :format="format"
          :pending="bracketPending"
          :error="bracketError"
          :can-manage="canManage"
          :generating="generating"
          :generate-error="generateError"
          :locked="bracket?.locked ?? false"
          :undoing="undoing"
          :locking="locking"
          :lifecycle-error="lifecycleError"
          :confirmed-count="confirmed.length"
          :has-results="hasResults"
          :seed-preview="seedPreview"
          :capacity="category?.max_participants ?? tournament.max_participants ?? null"
          @generate="emit('generate')"
          @undo="emit('undo')"
          @set-locked="(v) => emit('set-locked', v)"
          @select-player="(id) => emit('select-player', id)"
        />

        <TournamentCategoryStandings
          v-else-if="section === 'results'"
          :bracket="bracket"
          :confirmed="confirmed"
          :highlight-player-id="myPlayerId"
          @select="(id) => emit('select-player', id)"
        />

        <div v-else-if="section === 'settings'" class="space-y-5">
          <TournamentCategoryInfo
            :category="category"
            :tournament="tournament"
            :match-type="matchType"
            :format="format"
            :confirmed-count="confirmed.length"
            :pending-count="pending.length"
            :vacancy-label="vacancyLabel"
            :has-draw="!!bracket?.rounds.length"
            :can-manage="canManage"
            :saving="savingCategory"
            :save-error="categoryError"
            @save="(id, input) => emit('save', id, input)"
          />

          <div v-if="category && !isComplete" class="border-t border-border-strong/40 pt-4">
            <h4 class="text-sm font-medium text-fg">Finish this category</h4>
            <p class="mt-1 text-sm text-fg-muted">
              Publishes the final standings. Players see the table only after this.
            </p>
            <p v-if="!canComplete" class="mt-1 text-sm text-warning">
              Every match needs a result first. If this category is not going to be played,
              remove it below instead.
            </p>
            <button
              type="button"
              :disabled="completing || !canComplete"
              class="mt-3 rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-secondary hover:border-primary hover:text-fg disabled:opacity-50"
              @click="showCompleteConfirm = true"
            >
              {{ completing ? 'Finishing…' : 'Mark category complete' }}
            </button>
            <p v-if="completeError" role="alert" class="mt-2 text-sm text-danger">
              {{ completeError }}
            </p>
          </div>

          <!-- The other ending: a category that will not happen at all. -->
          <div v-if="category" class="border-t border-border-strong/40 pt-4">
            <h4 class="text-sm font-medium text-fg">Remove this category</h4>
            <p class="mt-1 text-sm text-fg-muted">
              For a category that is postponed or will not run. Its entries and draw are deleted
              permanently — this cannot be undone.
            </p>
            <p v-if="hasResults" class="mt-1 text-sm text-warning">
              This category has recorded results, so it cannot be removed. Finish it instead.
            </p>
            <button
              type="button"
              :disabled="trashing || hasResults"
              class="mt-3 rounded-lg border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
              @click="showTrashConfirm = true"
            >
              {{ trashing ? 'Removing…' : 'Trash this category' }}
            </button>
            <p v-if="trashError" role="alert" class="mt-2 text-sm text-danger">
              {{ trashError }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <UiModal
      v-model="showCompleteConfirm"
      title="Finish this category?"
      :description="`The final standings for ${name} become visible to everyone, and the category stops accepting results.`"
      confirm-label="Finish category"
      :loading="completing"
      @confirm="confirmComplete"
    />

    <UiModal
      v-model="showWithdrawConfirm"
      title="Withdraw from this category?"
      :description="`Your entry for ${name} is removed and your place is released. Any refund is handled by the organiser.`"
      confirm-label="Withdraw"
      destructive
      :loading="withdrawing"
      @confirm="confirmWithdraw"
    />

    <UiModal
      v-model="showTrashConfirm"
      title="Trash this category?"
      :description="`${name} and everything in it — every entry and its draw — are deleted permanently. This cannot be undone.`"
      confirm-label="Trash category"
      destructive
      :loading="trashing"
      @confirm="confirmTrash"
    />
  </div>
</template>
