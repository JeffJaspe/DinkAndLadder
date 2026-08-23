<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const eventId = route.params.eventId as string

const form = reactive({
  name: '',
  format: 'single_elimination' as
    'single_elimination' | 'double_elimination' | 'round_robin' | 'swiss',
  match_type: 'singles' as 'singles' | 'doubles',
  min_rating: null as number | null,
  max_rating: null as number | null
})

const submitting = ref(false)
const errorMessage = ref('')
const selectedTemplate = ref('')
const showCustomRating = ref(false)
const customMinRating = ref<number | ''>('')
const customMaxRating = ref<number | ''>('')

const formats = [
  { value: 'single_elimination', label: 'Single Elimination' },
  { value: 'double_elimination', label: 'Double Elimination' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'swiss', label: 'Swiss System' }
]

const ratingTemplates = [
  { value: 'novice', label: 'Novice', description: 'Up to 2.5', min: null, max: 2.5 },
  { value: 'intermediate', label: 'Intermediate', description: '2.5 - 3.5', min: 2.5, max: 3.5 },
  { value: 'advanced', label: 'Advanced', description: '3.5 - 4.5', min: 3.5, max: 4.5 },
  { value: 'expert', label: 'Expert', description: '4.5 - 5.5', min: 4.5, max: 5.5 },
  { value: 'pro', label: 'Pro', description: '5.5+', min: 5.5, max: null },
  { value: 'open', label: 'Open', description: 'All skill levels', min: null, max: null }
]

const ratingOptions = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0]

const currentRatingDisplay = computed(() => {
  if (form.min_rating === null && form.max_rating === null) {
    return null
  }
  if (form.min_rating !== null && form.max_rating !== null) {
    return `${form.min_rating.toFixed(1)} - ${form.max_rating.toFixed(1)}`
  }
  if (form.min_rating !== null) {
    return `${form.min_rating.toFixed(1)}+`
  }
  return `Up to ${form.max_rating!.toFixed(1)}`
})

function applyTemplate() {
  if (!selectedTemplate.value) return
  const template = ratingTemplates.find((t) => t.value === selectedTemplate.value)
  if (template) {
    form.min_rating = template.min
    form.max_rating = template.max
    showCustomRating.value = false
  }
  selectedTemplate.value = ''
}

function applyCustomRating() {
  form.min_rating = customMinRating.value === '' ? null : customMinRating.value
  form.max_rating = customMaxRating.value === '' ? null : customMaxRating.value
  showCustomRating.value = false
  customMinRating.value = ''
  customMaxRating.value = ''
}

function clearRating() {
  form.min_rating = null
  form.max_rating = null
}

async function submit() {
  if (!form.name) {
    errorMessage.value = 'Category name is required.'
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
        min_rating: form.min_rating,
        max_rating: form.max_rating,
        auto_join: true
      }
    })
    router.push(`/tournaments/${created.id}`)
  } catch (e) {
    errorMessage.value = apiErrorMessage(e, 'Something went wrong.')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- Header -->
      <div class="mb-6">
        <NuxtLink
          :to="`/events/${eventId}`"
          class="mb-4 inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Event
        </NuxtLink>
        <h1 class="text-2xl font-bold text-fg">Create Category</h1>
        <p class="mt-1 text-sm text-fg-muted">Add a new category to this event</p>
      </div>

      <!-- Form -->
      <form class="space-y-6" @submit.prevent="submit">
        <!-- Basic Info -->
        <div class="rounded-xl bg-surface p-5 shadow-card">
          <h2 class="mb-4 font-semibold text-fg">Category Details</h2>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm text-fg-secondary">Category Name</label>
              <input
                v-model="form.name"
                type="text"
                required
                placeholder="e.g., Men's Singles Open"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm text-fg-secondary">Format</label>
                <select
                  v-model="form.format"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none"
                >
                  <option v-for="f in formats" :key="f.value" :value="f.value">
                    {{ f.label }}
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-1.5 block text-sm text-fg-secondary">Match Type</label>
                <select
                  v-model="form.match_type"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none"
                >
                  <option value="singles">Singles</option>
                  <option value="doubles">Doubles</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Rating Bracket -->
        <div class="rounded-xl bg-surface p-5 shadow-card">
          <h2 class="mb-2 font-semibold text-fg">Rating Bracket</h2>
          <p class="mb-4 text-sm text-fg-muted">
            Optional — set a rating-based restriction for this category. Leave empty for open
            registration.
          </p>

          <!-- Current Rating Display -->
          <div
            v-if="currentRatingDisplay"
            class="mb-4 flex items-center justify-between rounded-lg bg-canvas p-3"
          >
            <div>
              <p class="text-sm text-fg-secondary">Current bracket</p>
              <p class="font-medium text-fg">{{ currentRatingDisplay }}</p>
            </div>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
              @click="clearRating"
            >
              Remove
            </button>
          </div>

          <!-- Template Selection -->
          <div v-if="!showCustomRating" class="space-y-3">
            <div class="flex gap-2">
              <select
                v-model="selectedTemplate"
                class="flex-1 rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none"
              >
                <option value="">Select a template</option>
                <option v-for="t in ratingTemplates" :key="t.value" :value="t.value">
                  {{ t.label }} ({{ t.description }})
                </option>
              </select>
              <button
                type="button"
                :disabled="!selectedTemplate"
                class="rounded-lg bg-primary px-4 py-2.5 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                @click="applyTemplate"
              >
                Add
              </button>
            </div>

            <button
              type="button"
              class="flex items-center gap-2 text-sm text-primary hover:text-primary-hover"
              @click="showCustomRating = true"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Custom Rating Range
            </button>
          </div>

          <!-- Custom Rating Input -->
          <div v-else class="space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm text-fg-secondary">Minimum Rating</label>
                <select
                  v-model="customMinRating"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none"
                >
                  <option value="">No minimum</option>
                  <option v-for="r in ratingOptions" :key="r" :value="r">{{ r.toFixed(1) }}</option>
                </select>
              </div>
              <div>
                <label class="mb-1.5 block text-sm text-fg-secondary">Maximum Rating</label>
                <select
                  v-model="customMaxRating"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none"
                >
                  <option value="">No maximum</option>
                  <option v-for="r in ratingOptions" :key="r" :value="r">{{ r.toFixed(1) }}</option>
                </select>
              </div>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2"
                @click="showCustomRating = false"
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
                @click="applyCustomRating"
              >
                Apply
              </button>
            </div>
          </div>
        </div>

        <!-- Auto-join notice -->
        <div class="rounded-lg bg-primary/10 p-4">
          <p class="text-sm text-primary">
            You will be automatically registered as a participant when you create this category.
          </p>
        </div>

        <!-- Error -->
        <div v-if="errorMessage" class="rounded-xl bg-red-500/10 p-4 text-red-400">
          {{ errorMessage }}
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <NuxtLink
            :to="`/events/${eventId}`"
            class="flex-1 rounded-xl border border-border-strong py-3 text-center font-medium text-fg-secondary hover:bg-surface-2"
          >
            Cancel
          </NuxtLink>
          <button
            type="submit"
            :disabled="submitting"
            class="flex-1 rounded-xl bg-primary py-3 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {{ submitting ? 'Creating...' : 'Create Category' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
