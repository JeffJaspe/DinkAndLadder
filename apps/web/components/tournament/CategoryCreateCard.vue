<script setup lang="ts">
import type { TournamentCategoryTemplateDto } from '~/server/domains/event/dto/tournament-category.dto'
import type {
  TournamentFormat,
  TournamentMatchType
} from '~/server/domains/event/dto/tournament.dto'
import { formatDescription, TOURNAMENT_FORMATS } from '~/utils/tournament-formats'

/**
 * Adding a category, from the end of the list.
 *
 * It used to be a disclosure panel wedged between the tournament header and the
 * categories, so the page read: what this tournament is → a form for making
 * things → the actual categories. Creation is not orientation. A dashed card
 * after the last real one says "and you can add another" in the place where
 * that is the obvious next thought.
 */
const props = defineProps<{
  templates: TournamentCategoryTemplateDto[]
  /**
   * Band/match-type pairs already in this tournament. A pair, not a bare id:
   * "4.5 Singles" does not use up the 4.5 band for a doubles category, and
   * keying on the id alone made that combination impossible to create.
   */
  usedTemplates: { template_id: string; match_type: TournamentMatchType }[]
  /** The tournament's type, offered as the starting point. */
  defaultMatchType: TournamentMatchType
  /** The tournament's format, likewise. */
  defaultFormat: TournamentFormat
  adding: boolean
  error: string
}>()

/** What the category is played to, sent with either creation path. */
interface GameRulesPayload {
  games_default: number
  round_game_rules: Record<string, number> | null
  target_points: number
  win_by_two: boolean
}

const emit = defineEmits<{
  'add-template': [
    input: GameRulesPayload & {
      template_id: string
      max_participants: number | null
      match_type: TournamentMatchType
      format: TournamentFormat
    }
  ]
  'add-custom': [
    input: GameRulesPayload & {
      name: string
      min_rating: number | null
      max_rating: number | null
      max_participants: number | null
      match_type: TournamentMatchType
      format: TournamentFormat
    }
  ]
}>()

/** Powers of two draw a clean single-elimination bracket. */
const SIZE_SUGGESTIONS = [8, 16, 32, 64]

const open = ref(false)
const matchType = ref<TournamentMatchType>(props.defaultMatchType)
const format = ref<TournamentFormat>(props.defaultFormat)
const mode = ref<'template' | 'custom'>('template')
const size = ref<number | string>(16)
const templateId = ref('')
const custom = reactive({
  name: '',
  min_rating: '' as number | string,
  max_rating: '' as number | string
})

/**
 * How the games are played, chosen when the category is created.
 *
 * Every category was silently one game to 11 because nothing ever set these —
 * the columns existed (046-category-game-rules) and no screen wrote to them, so
 * a best-of-three could not be run at all.
 *
 * Odd counts only: an even best-of cannot be decided. Same rule the server
 * enforces and the check constraint behind it.
 */
const GAME_COUNTS = [1, 3, 5] as const
const TARGET_POINTS = [11, 15, 21] as const

const gamesDefault = ref<number>(1)
const targetPoints = ref<number>(11)
const winByTwo = ref(true)

/**
 * Per-round overrides, keyed by round number.
 *
 * The common case is a longer final, and it is the reason `round_game_rules`
 * exists — so rather than a free-form editor this lists the rounds the chosen
 * draw size actually produces and lets each one differ. Only the rounds that
 * differ from the default are sent, which is exactly what the column stores.
 */
const roundOverrides = reactive<Record<number, number | ''>>({})

/** Rounds implied by the draw size: 16 entrants is four rounds. */
const roundCount = computed(() => {
  const entrants = Number(size.value)
  if (!Number.isFinite(entrants) || entrants < 2) return 0
  return Math.ceil(Math.log2(entrants))
})

const roundNumbers = computed(() => Array.from({ length: roundCount.value }, (_, i) => i + 1))

/** The last round is the final, whatever the draw size makes that. */
function roundName(round: number): string {
  const fromEnd = roundCount.value - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semi-finals'
  if (fromEnd === 2) return 'Quarter-finals'
  return `Round ${round}`
}

// A smaller draw has fewer rounds; an override left on a round that no longer
// exists would be sent for a round nobody plays.
watch(roundCount, (count) => {
  for (const round of Object.keys(roundOverrides)) {
    // Reset rather than delete: `roundGameRules` already skips empty values, and
    // a dynamic delete on a reactive object is both a lint error and a way to
    // lose reactivity on the key if it comes back.
    if (Number(round) > count) roundOverrides[Number(round)] = ''
  }
})

/** Only the rounds that actually differ from the default. */
const roundGameRules = computed(() => {
  const rules: Record<string, number> = {}
  for (const round of roundNumbers.value) {
    const value = roundOverrides[round]
    if (value !== '' && value !== undefined && value !== gamesDefault.value) {
      rules[String(round)] = Number(value)
    }
  }
  return Object.keys(rules).length ? rules : null
})

function gameRulesPayload() {
  return {
    games_default: gamesDefault.value,
    round_game_rules: roundGameRules.value,
    target_points: targetPoints.value,
    win_by_two: winByTwo.value
  }
}

function gamesLabel(count: number): string {
  return count === 1 ? '1 game' : `Best of ${count}`
}

// UiSegmented is a string control; these are numbers everywhere else, and
// storing them as strings would push the conversion into the payload builder
// where it is easier to forget.
const gamesDefaultModel = computed({
  get: () => String(gamesDefault.value),
  set: (value: string) => {
    gamesDefault.value = Number(value)
  }
})

const targetPointsModel = computed({
  get: () => String(targetPoints.value),
  set: (value: string) => {
    targetPoints.value = Number(value)
  }
})

/**
 * Re-filters as the organiser toggles singles/doubles, so a band that is taken
 * for one type comes straight back when they switch to the other.
 */
const available = computed(() => {
  const used = new Set(
    props.usedTemplates
      .filter((entry) => entry.match_type === matchType.value)
      .map((entry) => entry.template_id)
  )
  return props.templates.filter((t) => !used.has(t.id))
})

// A band taken under the previous match type leaves the selection pointing at
// something no longer on offer.
watch(available, (list) => {
  if (templateId.value && !list.some((t) => t.id === templateId.value)) templateId.value = ''
})

function ratingRangeLabel(minRating: number | null, maxRating: number | null): string {
  if (minRating == null && maxRating == null) return 'Any rating'
  if (minRating == null) return `Up to ${maxRating}`
  if (maxRating == null) return `${minRating}+`
  return `${minRating}–${maxRating}`
}

function toNumberOrNull(value: number | string): number | null {
  return value === '' ? null : Number(value)
}

function submitTemplate() {
  if (!templateId.value) return
  emit('add-template', {
    template_id: templateId.value,
    max_participants: toNumberOrNull(size.value),
    match_type: matchType.value,
    format: format.value,
    ...gameRulesPayload()
  })
}

function submitCustom() {
  if (!custom.name.trim()) return
  emit('add-custom', {
    name: custom.name.trim(),
    min_rating: toNumberOrNull(custom.min_rating),
    max_rating: toNumberOrNull(custom.max_rating),
    max_participants: toNumberOrNull(size.value),
    match_type: matchType.value,
    format: format.value,
    ...gameRulesPayload()
  })
}

// Parent clears `adding` when the request settles; no error means it landed.
watch(
  () => props.adding,
  (isAdding, wasAdding) => {
    if (wasAdding && !isAdding && !props.error) {
      open.value = false
      templateId.value = ''
      custom.name = ''
      custom.min_rating = ''
      custom.max_rating = ''
      matchType.value = props.defaultMatchType
      format.value = props.defaultFormat
    }
  }
)
</script>

<template>
  <div
    class="rounded-xl border-2 border-dashed border-border-strong/60 p-5"
    :class="open ? 'bg-surface' : ''"
  >
    <button
      v-if="!open"
      type="button"
      class="w-full py-2 text-sm font-medium text-fg-secondary transition-colors hover:text-primary"
      @click="open = true"
    >
      + Add category
    </button>

    <div v-else class="space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-semibold text-fg">Add a category</h3>
          <p class="mt-0.5 text-sm text-fg-muted">
            Players register per category and may enter more than one.
          </p>
        </div>
        <button type="button" class="text-sm text-fg-muted hover:text-fg" @click="open = false">
          Cancel
        </button>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm transition-colors"
          :class="
            mode === 'template' ? 'bg-primary text-on-primary' : 'text-fg-secondary hover:text-fg'
          "
          @click="mode = 'template'"
        >
          From a template
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm transition-colors"
          :class="
            mode === 'custom' ? 'bg-primary text-on-primary' : 'text-fg-secondary hover:text-fg'
          "
          @click="mode = 'custom'"
        >
          Custom
        </button>
      </div>

      <!-- Singles or doubles is per category: "Men's Doubles 4.0" and
           "Singles Open" are two categories of one weekend, not two events.
           Starts from the tournament's own type, which is the common case. -->
      <div>
        <span class="mb-1.5 block text-xs text-fg-secondary">Played as</span>
        <div class="flex gap-2">
          <label
            v-for="type in ['singles', 'doubles'] as const"
            :key="type"
            class="flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm capitalize transition-all"
            :class="
              matchType === type
                ? 'border-primary bg-primary/5 text-fg'
                : 'border-border-strong text-fg-secondary hover:border-primary/40'
            "
          >
            <input v-model="matchType" type="radio" :value="type" class="accent-primary" />
            {{ type }}
          </label>
        </div>
        <p v-if="matchType === 'doubles'" class="mt-1.5 text-xs text-fg-muted">
          Entrants are asked for a partner when they register.
        </p>
      </div>

      <!-- Format is per category too: one weekend runs an open round robin
           alongside a 4.5 knockout. Starts from the tournament's own. -->
      <div>
        <label for="new-category-format" class="mb-1.5 block text-xs text-fg-secondary">
          Format
        </label>
        <select
          id="new-category-format"
          v-model="format"
          class="w-full max-w-sm rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
        >
          <option v-for="option in TOURNAMENT_FORMATS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <p class="mt-1.5 text-xs text-fg-muted">{{ formatDescription(format) }}</p>
      </div>

      <!-- Capacity belongs to the category, not the tournament: a bracket has
           to know how big it should be, and the 3.5s and the 4.0s are rarely
           the same size. -->
      <div class="w-36">
        <label for="new-category-size" class="mb-1.5 block text-xs text-fg-secondary">
          Players
        </label>
        <input
          id="new-category-size"
          v-model="size"
          type="number"
          min="2"
          list="category-size-suggestions"
          class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
        />
        <datalist id="category-size-suggestions">
          <option v-for="n in SIZE_SUGGESTIONS" :key="n" :value="n" />
        </datalist>
      </div>

      <!-- How the games are played. These columns existed and nothing ever set
           them, so every category was silently one game to 11 and a best-of-3
           could not be run at all. -->
      <fieldset class="rounded-lg border border-border p-3">
        <legend class="px-1 text-xs font-medium text-fg-secondary">Games</legend>

        <div class="flex flex-wrap items-end gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-xs text-fg-secondary">Games per match</span>
            <UiSegmented
              v-model="gamesDefaultModel"
              size="sm"
              label="Games per match"
              :items="GAME_COUNTS.map((n) => ({ value: String(n), label: gamesLabel(n) }))"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-xs text-fg-secondary">A game goes to</span>
            <UiSegmented
              v-model="targetPointsModel"
              size="sm"
              label="Points to win a game"
              :items="TARGET_POINTS.map((n) => ({ value: String(n), label: String(n) }))"
            />
          </label>

          <label class="flex items-center gap-2 pb-1 text-sm text-fg">
            <input v-model="winByTwo" type="checkbox" class="accent-primary" />
            Must win by two
          </label>
        </div>

        <!-- Per-round overrides. A longer final is the reason this exists, so
             the rounds the chosen draw size actually produces are listed rather
             than asking for a round number in the abstract. -->
        <div v-if="roundNumbers.length > 1" class="mt-4">
          <p class="mb-2 text-xs text-fg-secondary">
            Different for a particular round? Anything left on “Same” follows
            {{ gamesLabel(gamesDefault).toLowerCase() }}.
          </p>
          <div class="flex flex-wrap gap-3">
            <label v-for="round in roundNumbers" :key="round" class="flex flex-col gap-1">
              <span class="text-caption text-fg-muted">{{ roundName(round) }}</span>
              <select
                v-model="roundOverrides[round]"
                class="rounded-lg border border-border-strong bg-canvas px-2 py-1.5 text-sm text-fg focus:border-primary focus:outline-none"
              >
                <option value="">Same</option>
                <option v-for="n in GAME_COUNTS" :key="n" :value="n">{{ gamesLabel(n) }}</option>
              </select>
            </label>
          </div>
        </div>
      </fieldset>

      <div v-if="mode === 'template'" class="space-y-3">
        <p v-if="!available.length" class="text-sm text-fg-muted">
          Every rating band is already used for {{ matchType }} in this tournament. Switch the match
          type, or add a custom category.
        </p>
        <template v-else>
          <div>
            <label for="category-template" class="mb-1.5 block text-xs text-fg-secondary">
              Rating band
            </label>
            <select
              id="category-template"
              v-model="templateId"
              class="w-full max-w-sm rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
            >
              <option value="">Choose a band…</option>
              <option v-for="t in available" :key="t.id" :value="t.id">
                {{ t.name }} ({{ ratingRangeLabel(t.min_rating, t.max_rating) }})
              </option>
            </select>
          </div>
          <button
            type="button"
            :disabled="!templateId || adding"
            class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
            @click="submitTemplate"
          >
            {{ adding ? 'Adding…' : 'Add category' }}
          </button>
        </template>
      </div>

      <div v-else class="space-y-3">
        <div class="grid gap-3 sm:grid-cols-3">
          <div>
            <label for="custom-name" class="mb-1.5 block text-xs text-fg-secondary">Name</label>
            <input
              id="custom-name"
              v-model="custom.name"
              type="text"
              placeholder="e.g. 3.5–4.0"
              class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label for="custom-min" class="mb-1.5 block text-xs text-fg-secondary">
              Min rating
            </label>
            <input
              id="custom-min"
              v-model="custom.min_rating"
              type="number"
              step="0.1"
              placeholder="Any"
              class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label for="custom-max" class="mb-1.5 block text-xs text-fg-secondary">
              Max rating
            </label>
            <input
              id="custom-max"
              v-model="custom.max_rating"
              type="number"
              step="0.1"
              placeholder="Any"
              class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        <button
          type="button"
          :disabled="!custom.name.trim() || adding"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
          @click="submitCustom"
        >
          {{ adding ? 'Adding…' : 'Add category' }}
        </button>
      </div>

      <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
    </div>
  </div>
</template>
