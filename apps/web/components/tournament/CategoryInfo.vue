<script setup lang="ts">
import type {
  TournamentDto,
  TournamentFormat,
  TournamentMatchType
} from '~/server/domains/event/dto/tournament.dto'
import type {
  TournamentCategoryDto,
  UpdateTournamentCategoryInput
} from '~/server/domains/event/dto/tournament-category.dto'
import { formatDescription, formatLabel, TOURNAMENT_FORMATS } from '~/utils/tournament-formats'

/**
 * What this category is: its rating band, how full it is, and the format it
 * will be played in. The organiser's inline edit lives here too — it is a
 * property of the category, and it was previously buried in a list of every
 * category at once.
 *
 * The edit form covers everything an organiser realistically changes after
 * publishing: it used to reach only the name and the size, so correcting a
 * rating band or switching a category from a knockout to a round robin meant
 * deleting it and losing every entry.
 */
const props = defineProps<{
  /** Null on the flat, category-less path. */
  category: TournamentCategoryDto | null
  /** The parent, for the values a category inherits and for its status. */
  tournament: TournamentDto | null
  /** Resolved by the card: the category's own type, or the tournament's. */
  matchType?: TournamentMatchType | null
  /** Resolved by the card: the category's own format, or the tournament's. */
  format?: TournamentFormat | null
  confirmedCount: number
  pendingCount: number
  vacancyLabel: string
  /** A drawn bracket has to be regenerated for a format change to take effect. */
  hasDraw?: boolean
  canManage: boolean
  saving: boolean
  saveError: string
}>()

const emit = defineEmits<{
  save: [categoryId: string, input: UpdateTournamentCategoryInput]
}>()

function ratingRangeLabel(minRating: number | null, maxRating: number | null): string {
  if (minRating == null && maxRating == null) return 'Any rating'
  if (minRating == null) return `Up to ${maxRating}`
  if (maxRating == null) return `${minRating}+`
  return `${minRating}–${maxRating}`
}

const editing = ref(false)

const form = reactive({
  name: '',
  max_participants: '' as number | string,
  min_rating: '' as number | string,
  max_rating: '' as number | string,
  match_type: 'singles' as TournamentMatchType,
  format: 'single_elimination' as TournamentFormat
})

/**
 * Once anybody has entered, singles ↔ doubles is refused by the service
 * (MATCH_TYPE_LOCKED) because every doubles entry carries a partner. Disabling
 * the control says so before the organiser fills in a form that cannot be
 * saved.
 */
const matchTypeLocked = computed(() => props.confirmedCount + props.pendingCount > 0)

const formatChanged = computed(() => !!props.format && form.format !== props.format)

function startEdit() {
  if (!props.category) return
  form.name = props.category.name
  form.max_participants = props.category.max_participants ?? ''
  form.min_rating = props.category.min_rating ?? ''
  form.max_rating = props.category.max_rating ?? ''
  form.match_type = props.matchType ?? 'singles'
  form.format = props.format ?? 'single_elimination'
  editing.value = true
}

function toNumberOrNull(value: number | string): number | null {
  return value === '' ? null : Number(value)
}

function submit() {
  if (!props.category) return
  emit('save', props.category.id, {
    name: form.name,
    max_participants: toNumberOrNull(form.max_participants),
    min_rating: toNumberOrNull(form.min_rating),
    max_rating: toNumberOrNull(form.max_rating),
    // Sending an unchanged value would still trip the lock, so it is omitted
    // whenever it did not move.
    ...(matchTypeLocked.value ? {} : { match_type: form.match_type }),
    format: form.format
  })
}

// The parent clears `saving` when the request settles; a save that succeeded
// leaves no error behind, which is the signal to close the form.
watch(
  () => props.saving,
  (isSaving, wasSaving) => {
    if (wasSaving && !isSaving && !props.saveError) editing.value = false
  }
)
</script>

<template>
  <div class="space-y-4">
    <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <div v-if="category">
        <dt class="text-xs uppercase tracking-wide text-fg-muted">Rating band</dt>
        <dd class="mt-0.5 text-sm text-fg">
          {{ ratingRangeLabel(category.min_rating, category.max_rating) }}
        </dd>
      </div>
      <div v-if="matchType">
        <dt class="text-xs uppercase tracking-wide text-fg-muted">Played as</dt>
        <dd class="mt-0.5 text-sm capitalize text-fg">{{ matchType }}</dd>
      </div>
      <!-- The category's own format, not the tournament's. This row used to
           render only when a tournament was passed, which the card never did —
           so the format was invisible on every category. -->
      <div v-if="format" class="sm:col-span-2">
        <dt class="text-xs uppercase tracking-wide text-fg-muted">Format</dt>
        <dd class="mt-0.5 text-sm text-fg">
          {{ formatLabel(format) }}
          <span class="text-fg-muted">· {{ formatDescription(format) }}</span>
        </dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-fg-muted">Capacity</dt>
        <dd class="mt-0.5 text-sm text-fg">{{ vacancyLabel }}</dd>
      </div>
      <div v-if="pendingCount">
        <dt class="text-xs uppercase tracking-wide text-fg-muted">Awaiting approval</dt>
        <dd class="mt-0.5 text-sm text-fg">{{ pendingCount }}</dd>
      </div>
      <div v-if="tournament">
        <dt class="text-xs uppercase tracking-wide text-fg-muted">Tournament status</dt>
        <dd class="mt-0.5 text-sm capitalize text-fg">
          {{ tournament.status.replace('_', ' ') }}
        </dd>
      </div>
    </dl>

    <div v-if="canManage && category">
      <button
        v-if="!editing"
        type="button"
        class="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-secondary hover:border-primary hover:text-fg"
        @click="startEdit"
      >
        Edit category
      </button>

      <div v-else class="space-y-4 rounded-lg bg-canvas p-4">
        <div class="grid gap-3 sm:grid-cols-4">
          <div class="sm:col-span-2">
            <label class="mb-1 block text-xs text-fg-secondary" :for="`cat-name-${category.id}`">
              Name
            </label>
            <input
              :id="`cat-name-${category.id}`"
              v-model="form.name"
              type="text"
              class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-secondary" :for="`cat-size-${category.id}`">
              Players
            </label>
            <input
              :id="`cat-size-${category.id}`"
              v-model="form.max_participants"
              type="number"
              min="2"
              class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-4">
          <div>
            <label class="mb-1 block text-xs text-fg-secondary" :for="`cat-min-${category.id}`">
              Min rating
            </label>
            <input
              :id="`cat-min-${category.id}`"
              v-model="form.min_rating"
              type="number"
              step="0.1"
              placeholder="Any"
              class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-fg-secondary" :for="`cat-max-${category.id}`">
              Max rating
            </label>
            <input
              :id="`cat-max-${category.id}`"
              v-model="form.max_rating"
              type="number"
              step="0.1"
              placeholder="Any"
              class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
            />
          </div>
          <div class="sm:col-span-2">
            <span class="mb-1 block text-xs text-fg-secondary">Played as</span>
            <div class="flex gap-2">
              <label
                v-for="type in ['singles', 'doubles'] as const"
                :key="type"
                class="flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm capitalize transition-all"
                :class="[
                  form.match_type === type
                    ? 'border-primary bg-primary/5 text-fg'
                    : 'border-border-strong text-fg-secondary',
                  matchTypeLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                ]"
              >
                <input
                  v-model="form.match_type"
                  type="radio"
                  :value="type"
                  :disabled="matchTypeLocked"
                  class="accent-primary"
                />
                {{ type }}
              </label>
            </div>
            <p v-if="matchTypeLocked" class="mt-1 text-xs text-fg-muted">
              Locked — players have already entered. Add a separate category instead.
            </p>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs text-fg-secondary" :for="`cat-format-${category.id}`">
            Format
          </label>
          <select
            :id="`cat-format-${category.id}`"
            v-model="form.format"
            class="w-full max-w-sm rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
          >
            <option v-for="option in TOURNAMENT_FORMATS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <p class="mt-1 text-xs text-fg-muted">{{ formatDescription(form.format) }}</p>
          <p v-if="formatChanged && hasDraw" class="mt-1 text-xs text-warning">
            The draw was made in the old format — regenerate it from the Draw tab for this to take
            effect.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            :disabled="saving"
            class="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
            @click="submit"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm text-fg-muted hover:text-fg"
            @click="editing = false"
          >
            Cancel
          </button>
        </div>

        <!-- Surfaces CAPACITY_BELOW_CONFIRMED and MATCH_TYPE_LOCKED verbatim;
             both name the count that caused the refusal. -->
        <p v-if="saveError" role="alert" class="text-xs text-danger">{{ saveError }}</p>
      </div>
    </div>
  </div>
</template>
