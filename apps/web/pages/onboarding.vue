<script setup lang="ts">
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { QuestionKind } from '~/server/domains/rating/data/question-bank'

interface AssessmentQuestion {
  id: string
  category: string
  question: string
  /** How to present the choices. Declared by the question, not guessed here. */
  kind: QuestionKind
  choices: string[]
}

interface RatingResult {
  rating: number
  reliability: 'high' | 'medium' | 'low'
  flags: string[]
  tier: {
    name: string
    description: string
  }
}

const user = useSupabaseUser()
const route = useRoute()
const { switchToPlayer, activeClubId } = useAccountMode()
const { appName } = useBranding()

// Entry point for "switch to Player mode for the first time" (see AccountSwitcher.vue):
// a club-only account has a player_profiles row (created regardless of onboarding
// choice) but no rating yet. This flag skips straight to the questionnaire instead of
// the account-type prompt, and redirects back to wherever the switch was heading
// instead of into club creation.
const isRateOnlyFlow = computed(() => route.query.flow === 'rate-only')

/**
 * Where to land after onboarding completes. Respects an explicit redirect param,
 * otherwise sends to club dashboard if in club mode, else player dashboard.
 */
const redirectAfter = computed(() => {
  if (typeof route.query.redirect === 'string') return route.query.redirect
  if (activeClubId.value) return `/club/${activeClubId.value}/dashboard`
  return '/dashboard'
})

const step = ref<'loading' | 'type' | 'questionnaire' | 'submitting' | 'result' | 'club'>('loading')
const accountType = ref<'player' | 'club' | null>(null)
const loading = ref(false)

const questions = ref<AssessmentQuestion[]>([])
const currentQuestionIndex = ref(0)
const answers = ref<Record<string, number>>({})
const ratingResult = ref<RatingResult | null>(null)
const showCelebration = ref(false)

/** Set when the questions could not be fetched; the step becomes a retry. */
const loadError = ref<string | null>(null)
/** Set when scoring failed. The answers survive it — this is only the message. */
const submitError = ref<string | null>(null)

const currentQuestion = computed(() => questions.value[currentQuestionIndex.value])
const isLastQuestion = computed(() => currentQuestionIndex.value === questions.value.length - 1)

/**
 * Questions *completed*, not reached. The old `(index + 1) / length` filled the
 * bar to 100% while the last question was still unanswered, which told the
 * player they were finished one tap before they were.
 */
const answeredCount = computed(
  () => questions.value.filter((question) => answers.value[question.id] !== undefined).length
)
const progress = computed(() =>
  questions.value.length ? answeredCount.value / questions.value.length : 0
)

/** Ties the answer group to the question it answers, for assistive tech. */
const QUESTION_HEADING_ID = 'assessment-question'
const choiceScale = ref<{ focusFirst: () => void } | null>(null)
/**
 * Announces the question change. Advancing is automatic and reuses the same
 * controls, so without this a screen-reader user answers a question they were
 * never told had changed.
 */
const announcement = ref('')

/**
 * Twenty questions, on a phone, on court wifi. Held only in a ref, a refresh, a
 * backgrounded tab the OS reclaims, or a failed submit threw all of them away
 * and restarted the flow at question one. Draft locally, clear on success.
 */
const DRAFT_VERSION = 1
const draftKey = computed(() => (user.value ? `dnl:assessment-draft:${user.value.id}` : null))

interface AssessmentDraft {
  version: number
  questionIds: string[]
  answers: Record<string, number>
  index: number
}

function saveDraft() {
  const key = draftKey.value
  if (!key) return
  try {
    const draft: AssessmentDraft = {
      version: DRAFT_VERSION,
      questionIds: questions.value.map((question) => question.id),
      answers: answers.value,
      index: currentQuestionIndex.value
    }
    localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Private mode, blocked site data, quota — a draft is a convenience, and
    // losing it must never take the questionnaire down with it.
  }
}

function clearDraft() {
  const key = draftKey.value
  if (!key) return
  try {
    localStorage.removeItem(key)
  } catch {
    // See saveDraft.
  }
}

/**
 * Only restored against the same bank the draft was taken on: the draft carries
 * the question ids it was answering, so a changed bank is discarded rather than
 * having its answers mis-applied to questions that have moved.
 */
function restoreDraft() {
  const key = draftKey.value
  if (!key) return
  let draft: AssessmentDraft | null = null
  try {
    const raw = localStorage.getItem(key)
    draft = raw ? (JSON.parse(raw) as AssessmentDraft) : null
  } catch {
    draft = null
  }
  if (!draft || draft.version !== DRAFT_VERSION) return

  const ids = questions.value.map((question) => question.id)
  if (draft.questionIds.length !== ids.length || draft.questionIds.some((id, i) => id !== ids[i])) {
    clearDraft()
    return
  }

  answers.value = { ...draft.answers }
  currentQuestionIndex.value = Math.min(Math.max(draft.index, 0), ids.length - 1)
}

onMounted(async () => {
  if (!user.value) {
    await navigateTo('/login')
    return
  }
  if (isRateOnlyFlow.value) {
    accountType.value = 'player'
    await loadQuestions()
    return
  }
  try {
    const profile = await $fetch<PlayerProfileDto>('/api/v1/players/me')
    if (profile?.id) {
      // A profile with no rating means a previous assessment attempt never
      // actually persisted (e.g. the RLS bug where player_ratings writes were
      // silently rejected) or this is a club-only account rating for the
      // first time — either way, send them straight to the questionnaire
      // instead of the dashboard so they can (re)take it.
      const ratings = await $fetch<{ singles: unknown }>('/api/v1/players/me/ratings', {
        ignoreResponseError: true
      })
      if (ratings && !(ratings as { statusCode?: number }).statusCode && ratings.singles) {
        await navigateTo(redirectAfter.value)
        return
      } else {
        accountType.value = 'player'
        await loadQuestions()
        return
      }
    }
  } catch {
    // No profile yet — fall through to the account-type chooser below.
  }
  // Only show account type chooser after confirming user needs onboarding
  step.value = 'type'
})

/**
 * Collected here rather than defaulted server-side. display_name is published
 * through the public-read policy on player_profiles, and the previous default
 * was the local part of the user's email address — so signing up as
 * firstname.lastname@work.com published a real name before the user saw any
 * settings screen.
 */
const displayName = ref('')
const displayNameError = ref('')

const isDisplayNameValid = computed(() => displayName.value.trim().length >= 2)

function selectAccountType(type: 'player' | 'club') {
  if (!isDisplayNameValid.value) {
    displayNameError.value = 'Enter a display name of at least 2 characters.'
    return
  }
  displayNameError.value = ''
  accountType.value = type
  if (type === 'player') {
    loadQuestions()
  } else {
    step.value = 'club'
  }
}

async function loadQuestions() {
  loading.value = true
  loadError.value = null
  step.value = 'loading'
  try {
    const response = await $fetch<{ data: AssessmentQuestion[] }>(
      '/api/v1/rating/assessment-questions'
    )
    questions.value = response.data
    currentQuestionIndex.value = 0
    answers.value = {}
    restoreDraft()
    step.value = 'questionnaire'
  } catch (err) {
    // Without this the step stayed on 'loading' and the player watched a
    // spinner forever — the single most likely failure on court wifi.
    loadError.value = apiErrorMessage(
      err,
      'We could not load the questions. Check your connection and try again.'
    )
  } finally {
    loading.value = false
  }
}

async function announceCurrentQuestion() {
  const question = currentQuestion.value
  if (!question) return
  announcement.value = `Question ${currentQuestionIndex.value + 1} of ${questions.value.length}. ${question.question}`
  await nextTick()
  // Keep the keyboard inside the answer group rather than dropping it back to
  // the top of the document on every one of twenty questions.
  choiceScale.value?.focusFirst()
}

async function selectAnswer(choiceIndex: number) {
  if (!currentQuestion.value) return
  // Two taps on the last option, closer together than Vue's next DOM update,
  // would otherwise fire two POSTs and the second would come back 409
  // ALREADY_RATED — an error screen on top of a successful submission.
  // `submitAssessment` moves the step synchronously, so this catches it.
  if (step.value !== 'questionnaire') return
  answers.value[currentQuestion.value.id] = choiceIndex

  if (isLastQuestion.value) {
    saveDraft()
    await submitAssessment()
    return
  }
  currentQuestionIndex.value++
  saveDraft()
  await announceCurrentQuestion()
}

async function goBack() {
  if (currentQuestionIndex.value > 0) {
    submitError.value = null
    currentQuestionIndex.value--
    saveDraft()
    await announceCurrentQuestion()
  } else if (isRateOnlyFlow.value) {
    await navigateTo(redirectAfter.value)
  } else {
    step.value = 'type'
  }
}

async function submitAssessment() {
  submitError.value = null
  step.value = 'submitting'
  try {
    const answerPayload = Object.entries(answers.value).map(([questionId, choiceIndex]) => ({
      questionId,
      choiceIndex
    }))

    const response = await $fetch<{ data: RatingResult }>('/api/v1/rating/submit-assessment', {
      method: 'POST',
      body: { answers: answerPayload, display_name: displayName.value.trim() }
    })

    ratingResult.value = response.data
    clearDraft()
    step.value = 'result'

    await nextTick()
    setTimeout(() => {
      showCelebration.value = true
    }, 100)
  } catch (err) {
    // The answers are still in memory and in the draft, so this returns to the
    // last question rather than to a dead end: retry, or change the answer.
    submitError.value = apiErrorMessage(
      err,
      'We could not save your rating. Your answers are safe — try again.'
    )
    step.value = 'questionnaire'
  }
}

async function continueToClubCreation() {
  loading.value = true
  try {
    await $fetch('/api/v1/players/me/onboarding', {
      method: 'POST',
      body: { display_name: displayName.value.trim() }
    })
    await navigateTo('/create-club')
  } finally {
    loading.value = false
  }
}

async function goToDashboard() {
  if (isRateOnlyFlow.value) {
    switchToPlayer()
  }
  await navigateTo(redirectAfter.value)
}

/**
 * The tier's *tokens*. `tierForRating` is the same ladder the rating badge,
 * the rankings board and the profile header already draw from — the API sends
 * no colour of its own (see RATING_TIERS).
 */
const tierTokens = computed(() =>
  ratingResult.value ? tierForRating(ratingResult.value.rating) : null
)

/**
 * The result screen says how much to trust the number. Wording stays plain:
 * the reliability grade comes from the scoring model (agreement between skill
 * areas, playing history, and whether the self-reported level matched).
 */
const reliabilityNote = computed(() => {
  switch (ratingResult.value?.reliability) {
    case 'high':
      return 'Confidence: high — your answers were consistent and backed by playing experience.'
    case 'medium':
      return 'Confidence: medium — a reasonable estimate that a few rated matches will sharpen.'
    default:
      return 'Confidence: low — treat this as a rough starting point; your first rated matches will matter most.'
  }
})

const categoryLabel = (category: string) => {
  const labels: Record<string, string> = {
    serve_return: 'Serve & Return',
    groundstrokes: 'Groundstrokes',
    dinking: 'Dinking',
    third_shot: 'Third Shot',
    net_game: 'Net Game',
    positioning: 'Positioning',
    strategy: 'Strategy',
    consistency: 'Consistency',
    experience: 'Experience',
    competition: 'Competition',
    self_level: 'Your Level'
  }
  return labels[category] || category
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
    <!-- max-w-xl, not lg: the five-stop scale is the widest thing this
         flow has to lay out, and at 512px each segment gave "Sometimes"
         (74.7px in Inter 500/14) a 76px content box. 576px takes that to
         89px — measured headroom rather than a coincidence. -->
    <div class="w-full max-w-xl">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <UiBrandMark size="2xl" :show-name="false" class="justify-center" />
      </div>

      <!-- Step: Account Type Selection -->
      <div v-if="step === 'type'" class="space-y-6">
        <div class="text-center">
          <h1 class="font-display text-heading-1 text-fg">Welcome to {{ appName }}!</h1>
          <p class="mt-2 text-fg-muted">First, what should we call you?</p>
        </div>

        <div class="rounded-card bg-surface p-5 shadow-card">
          <label for="display-name" class="block text-sm font-medium text-fg"> Display name </label>
          <input
            id="display-name"
            v-model="displayName"
            type="text"
            maxlength="50"
            autocomplete="nickname"
            placeholder="e.g. Jeff J."
            class="mt-2 w-full rounded-button border border-border-strong bg-canvas px-3 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            @input="displayNameError = ''"
          />
          <p v-if="displayNameError" class="mt-2 text-sm text-danger">
            {{ displayNameError }}
          </p>
          <p v-else class="mt-2 text-xs text-fg-muted">
            This is shown publicly on your profile, in rankings and in search. You can change it any
            time in Settings.
          </p>
        </div>

        <p class="text-center text-fg-muted">How will you be using the platform?</p>

        <div class="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            :disabled="loading"
            class="group rounded-card border-2 border-border-strong bg-surface p-6 text-left transition-all hover:border-primary hover:bg-surface-2 disabled:opacity-50 shadow-card hover:shadow-card-hover"
            @click="selectAccountType('player')"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-2xl"
            >
              🏓
            </div>
            <h3 class="font-display text-heading-3 text-fg">I'm a Player</h3>
            <p class="mt-2 text-sm text-fg-muted">
              Track your matches, build your rating, join clubs and compete in tournaments.
            </p>
          </button>

          <button
            type="button"
            class="group rounded-card border-2 border-border-strong bg-surface p-6 text-left transition-all hover:border-primary hover:bg-surface-2 shadow-card hover:shadow-card-hover"
            @click="selectAccountType('club')"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-fill/20 text-2xl"
            >
              🏆
            </div>
            <h3 class="font-display text-heading-3 text-fg">I'm a Club Organizer</h3>
            <p class="mt-2 text-sm text-fg-muted">
              Create your club, organize open play sessions and tournaments, manage members.
            </p>
          </button>
        </div>

        <p class="text-center text-xs text-fg-muted">
          You can always change this later or do both!
        </p>
      </div>

      <!-- Step: Questionnaire -->
      <div v-else-if="step === 'questionnaire' && currentQuestion" class="space-y-6">
        <!-- Progress -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-fg-muted"
              >Question {{ currentQuestionIndex + 1 }} of {{ questions.length }}</span
            >
            <span class="rounded-pill bg-primary-soft px-3 py-1 text-xs text-primary">
              {{ categoryLabel(currentQuestion.category) }}
            </span>
          </div>
          <!-- The track is tinted from the foreground, not filled with `surface`:
               white on the near-white canvas measured 1.06:1, so the unfilled
               remainder was invisible and the bar read as a floating stub with
               no scale. At 35% the track sits at 1.59:1 on canvas while the
               green fill still clears 3:1 against it (3.02 light, 3.58 dark) —
               which is the pair SC 1.4.11 actually asks about. -->
          <div
            class="h-2 overflow-hidden rounded-pill bg-fg-muted/35"
            role="progressbar"
            :aria-valuemin="0"
            :aria-valuemax="questions.length"
            :aria-valuenow="answeredCount"
            :aria-valuetext="`Question ${currentQuestionIndex + 1} of ${questions.length}`"
          >
            <!-- scaleX, not width: the same movement off the layout thread. -->
            <div
              class="h-full w-full origin-left bg-primary transition-transform duration-500 ease-out motion-reduce:transition-none"
              :style="{ transform: `scaleX(${progress})` }"
            />
          </div>
        </div>

        <UiErrorState
          v-if="submitError"
          compact
          title="We could not save your rating"
          :message="submitError"
          retry-label="Try again"
          @retry="submitAssessment"
        />

        <!-- Question -->
        <div class="rounded-card bg-surface p-6 shadow-card">
          <h1 :id="QUESTION_HEADING_ID" class="mb-6 font-display text-heading-3 text-fg">
            {{ currentQuestion.question }}
          </h1>

          <OnboardingChoiceScale
            ref="choiceScale"
            data-testid="question-choices"
            :choices="currentQuestion.choices"
            :kind="currentQuestion.kind"
            :model-value="answers[currentQuestion.id] ?? null"
            :labelled-by="QUESTION_HEADING_ID"
            @select="selectAnswer"
          />
        </div>

        <!-- Back is a way out, not the action of the screen; full-bleed it
             outweighed the answers it sits under. -->
        <div class="flex">
          <button
            type="button"
            class="rounded-button border border-border-strong px-5 py-3 text-sm text-fg-secondary transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            @click="goBack"
          >
            Back
          </button>
        </div>

        <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
      </div>

      <!-- Step: Scoring -->
      <div
        v-else-if="step === 'submitting'"
        class="flex flex-col items-center justify-center gap-4 py-16"
        role="status"
      >
        <div
          class="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"
        />
        <p class="text-body-2 text-fg-muted">Scoring your answers…</p>
      </div>

      <!-- Step: Result with Celebration -->
      <div v-else-if="step === 'result' && ratingResult" class="space-y-6">
        <!-- Celebration Modal -->
        <div
          class="relative overflow-hidden rounded-card bg-surface p-8 text-center shadow-card"
          :class="{ 'animate-celebration': showCelebration }"
        >
          <!-- Confetti Effect -->
          <div v-if="showCelebration" class="confetti-container">
            <div v-for="i in 50" :key="i" class="confetti" :style="{ '--i': i }" />
          </div>

          <!-- Rating Badge -->
          <div
            class="relative mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-pill"
            :class="[tierTokens?.softClass, { 'animate-badge-in': showCelebration }]"
          >
            <div
              class="flex h-28 w-28 items-center justify-center rounded-pill border-2 border-current"
              :class="[tierTokens?.softClass, tierTokens?.textClass]"
            >
              <UiIcon name="trophy" size="h-12 w-12" :stroke-width="1.5" />
            </div>
          </div>

          <!-- Congratulations Text -->
          <h1
            class="mb-2 font-display text-heading-1 text-fg"
            :class="{ 'animate-fade-in': showCelebration }"
          >
            Congratulations!
          </h1>

          <p class="mb-6 text-fg-muted" :class="{ 'animate-fade-in-delay': showCelebration }">
            Your provisional rating has been determined
          </p>

          <!-- Rating Display -->
          <div class="mb-4 space-y-2" :class="{ 'animate-scale-in': showCelebration }">
            <div class="font-display text-stat-xl tabular-nums" :class="tierTokens?.textClass">
              {{ ratingResult.rating.toFixed(2) }}
            </div>
            <div
              class="inline-block rounded-pill px-4 py-1 font-display text-heading-3"
              :class="[tierTokens?.softClass, tierTokens?.textClass]"
            >
              {{ ratingResult.tier.name }}
            </div>
          </div>

          <p class="text-sm text-fg-muted">
            {{ ratingResult.tier.description }}
          </p>

          <p class="mt-2 text-xs text-fg-muted" data-testid="assessment-reliability">
            {{ reliabilityNote }}
          </p>

          <!-- Rating Scale -->
          <div class="mt-6 space-y-2">
            <div class="flex items-center justify-between text-xs text-fg-muted">
              <span>2.0</span>
              <span>Your Rating</span>
              <span>8.0</span>
            </div>
            <div
              class="relative h-3 overflow-hidden rounded-full bg-gradient-to-r from-fg-muted via-primary to-warning-fill"
            >
              <div
                class="absolute top-0 h-full w-1 rounded-pill bg-fg ring-2 ring-surface"
                :style="{ left: `${((ratingResult.rating - 2) / 6) * 100}%` }"
              />
            </div>
          </div>
        </div>

        <!-- Continue Button -->
        <button
          type="button"
          class="w-full rounded-button bg-primary py-4 text-lg font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          @click="goToDashboard"
        >
          Start Playing
        </button>

        <p class="text-center text-xs text-fg-muted">
          This is a starting estimate, not an official rating. It will move toward your real results
          as you play rated matches.
        </p>
      </div>

      <!-- Step: Club Creation Prompt -->
      <div v-else-if="step === 'club'" class="space-y-6">
        <div class="text-center">
          <h1 class="font-display text-heading-1 text-fg">Create Your Club</h1>
          <p class="mt-2 text-fg-muted">Set up your club and start organizing events</p>
        </div>

        <div class="rounded-card bg-surface p-6 shadow-card">
          <div class="space-y-4">
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm text-primary"
              >
                1
              </div>
              <div>
                <p class="font-medium text-fg">Create your club</p>
                <p class="text-sm text-fg-muted">Set up your club name, location, and details</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm text-primary"
              >
                2
              </div>
              <div>
                <p class="font-medium text-fg">Invite members</p>
                <p class="text-sm text-fg-muted">Share your club and grow your community</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm text-primary"
              >
                3
              </div>
              <div>
                <p class="font-medium text-fg">Organize events</p>
                <p class="text-sm text-fg-muted">Create open play sessions and tournaments</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            :disabled="loading"
            class="mt-6 w-full rounded-button bg-primary py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            @click="continueToClubCreation"
          >
            {{ loading ? 'Setting up...' : 'Create Your Club' }}
          </button>

          <button
            type="button"
            class="mt-3 w-full rounded-button border border-border-strong py-3 text-sm text-fg-secondary hover:bg-surface-2"
            @click="step = 'type'"
          >
            Back
          </button>
        </div>
      </div>

      <!-- The questions could not be fetched. Previously this state did not
           exist and the spinner below simply never stopped. -->
      <UiErrorState
        v-else-if="loadError"
        title="We could not load the questions"
        :message="loadError"
        retry-label="Try again"
        @retry="loadQuestions"
      />

      <!-- Loading State (initial check or questions in flight) -->
      <div v-else class="flex items-center justify-center py-12">
        <div
          class="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes badge-in {
  0% {
    transform: scale(0.86);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scale-in {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes celebration {
  0% {
    transform: scale(0.95);
  }
  50% {
    transform: scale(1.02);
  }
  100% {
    transform: scale(1);
  }
}

.animate-badge-in {
  animation: badge-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-fade-in {
  animation: fade-in 0.5s ease-out 0.3s forwards;
  opacity: 0;
}

.animate-fade-in-delay {
  animation: fade-in 0.5s ease-out 0.5s forwards;
  opacity: 0;
}

.animate-scale-in {
  animation: scale-in 0.5s ease-out 0.4s forwards;
  opacity: 0;
}

.animate-celebration {
  animation: celebration 0.5s ease-out;
}

.confetti-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  pointer-events: none;
}

/* Confetti in the product's own inks rather than a 360-degree hue sweep.
   A rainbow here was the one place the app spent colour it does not own, and
   it read as a stock celebration bolted onto a green system. Three tokens,
   cycled, so the piece follows the theme like everything else on the page. */
.confetti {
  position: absolute;
  width: 10px;
  height: 10px;
  top: -10px;
  left: calc(var(--i) * 2%);
  background: rgb(var(--dnl-primary));
  /* A 10px chip: 2px is the shape at this size, not a scale step.
     impeccable-disable-next-line design-system-radius -- confetti particle */
  border-radius: 2px;
  animation: confetti-fall 3s ease-out forwards;
  animation-delay: calc(var(--i) * 0.02s);
}

.confetti:nth-child(3n + 2) {
  background: rgb(var(--dnl-accent));
}

.confetti:nth-child(3n + 3) {
  background: rgb(var(--dnl-rating-gold));
}

@media (prefers-reduced-motion: reduce) {
  .confetti-container {
    display: none;
  }

  .animate-badge-in,
  .animate-fade-in,
  .animate-fade-in-delay,
  .animate-scale-in,
  .animate-celebration {
    animation: none;
    opacity: 1;
  }
}

/* Falls on the compositor. This used to animate `top` from -10px to 100%,
   which relaid out fifty absolutely-positioned nodes on every frame for three
   seconds. The container clips the overshoot. */
@keyframes confetti-fall {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) rotate(0deg);
  }
  100% {
    opacity: 0;
    transform: translate3d(calc((var(--i) - 25) * 2px), 100vh, 0) rotate(720deg);
  }
}
</style>
