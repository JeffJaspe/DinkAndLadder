<script setup lang="ts">
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

interface AssessmentQuestion {
  id: string
  category: string
  question: string
  choices: string[]
}

interface RatingResult {
  rating: number
  tier: {
    name: string
    description: string
    color: string
  }
}

const user = useSupabaseUser()
const route = useRoute()
const { switchToPlayer } = useAccountMode()

// Entry point for "switch to Player mode for the first time" (see AccountSwitcher.vue):
// a club-only account has a player_profiles row (created regardless of onboarding
// choice) but no rating yet. This flag skips straight to the questionnaire instead of
// the account-type prompt, and redirects back to wherever the switch was heading
// instead of into club creation.
const isRateOnlyFlow = computed(() => route.query.flow === 'rate-only')
const redirectAfter = computed(() =>
  typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
)

const step = ref<'type' | 'questionnaire' | 'result' | 'club'>('type')
const accountType = ref<'player' | 'club' | null>(null)
const loading = ref(false)

const questions = ref<AssessmentQuestion[]>([])
const currentQuestionIndex = ref(0)
const answers = ref<Record<string, number>>({})
const ratingResult = ref<RatingResult | null>(null)
const showCelebration = ref(false)

const currentQuestion = computed(() => questions.value[currentQuestionIndex.value])
const progress = computed(() => ((currentQuestionIndex.value + 1) / questions.value.length) * 100)
const isLastQuestion = computed(() => currentQuestionIndex.value === questions.value.length - 1)

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
        await navigateTo('/dashboard')
      } else {
        accountType.value = 'player'
        await loadQuestions()
      }
    }
  } catch {
    // No profile yet — fall through to the account-type chooser below.
  }
})

function selectAccountType(type: 'player' | 'club') {
  accountType.value = type
  if (type === 'player') {
    loadQuestions()
  } else {
    step.value = 'club'
  }
}

async function loadQuestions() {
  loading.value = true
  try {
    const response = await $fetch<{ data: AssessmentQuestion[] }>('/api/v1/rating/assessment-questions')
    questions.value = response.data
    currentQuestionIndex.value = 0
    answers.value = {}
    step.value = 'questionnaire'
  } finally {
    loading.value = false
  }
}

function selectAnswer(choiceIndex: number) {
  if (!currentQuestion.value) return
  answers.value[currentQuestion.value.id] = choiceIndex

  if (isLastQuestion.value) {
    submitAssessment()
  } else {
    currentQuestionIndex.value++
  }
}

async function goBack() {
  if (currentQuestionIndex.value > 0) {
    currentQuestionIndex.value--
  } else if (isRateOnlyFlow.value) {
    await navigateTo(redirectAfter.value)
  } else {
    step.value = 'type'
  }
}

async function submitAssessment() {
  loading.value = true
  try {
    const answerPayload = Object.entries(answers.value).map(([questionId, choiceIndex]) => ({
      questionId,
      choiceIndex
    }))

    const response = await $fetch<{ data: RatingResult }>('/api/v1/rating/submit-assessment', {
      method: 'POST',
      body: { answers: answerPayload }
    })

    ratingResult.value = response.data
    step.value = 'result'

    await nextTick()
    setTimeout(() => {
      showCelebration.value = true
    }, 100)
  } finally {
    loading.value = false
  }
}

async function continueToClubCreation() {
  loading.value = true
  try {
    await $fetch('/api/v1/players/me/onboarding', {
      method: 'POST',
      body: { account_type: 'club' }
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

const tierEmoji = computed(() => {
  if (!ratingResult.value) return '🏓'
  const name = ratingResult.value.tier.name.toLowerCase()
  if (name === 'champion') return '👑'
  if (name === 'elite') return '🌟'
  if (name === 'pro') return '🔥'
  if (name === 'expert') return '💪'
  if (name === 'skilled') return '🎯'
  if (name === 'advanced') return '⚡'
  if (name === 'intermediate') return '📈'
  if (name === 'novice') return '🌱'
  return '🏓'
})

const categoryLabel = (category: string) => {
  const labels: Record<string, string> = {
    experience: 'Experience',
    skill: 'Skills',
    strategy: 'Strategy',
    competition: 'Competition',
    'self-assessment': 'Self Assessment'
  }
  return labels[category] || category
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[#0B0D09] px-4 py-12">
    <div class="w-full max-w-lg">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#4DB175] text-2xl font-bold text-white">
          D
        </div>
      </div>

      <!-- Step: Account Type Selection -->
      <div v-if="step === 'type'" class="space-y-6">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-white">Welcome to DinkAndLadder!</h1>
          <p class="mt-2 text-[#6B7B75]">How will you be using the platform?</p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            :disabled="loading"
            class="group rounded-xl border-2 border-[#3A5750] bg-[#1E2E2A] p-6 text-left transition-all hover:border-[#4DB175] hover:bg-[#2E4540] disabled:opacity-50"
            @click="selectAccountType('player')"
          >
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#4DB175]/20 text-2xl">
              🏓
            </div>
            <h3 class="text-lg font-semibold text-white">I'm a Player</h3>
            <p class="mt-2 text-sm text-[#6B7B75]">
              Track your matches, build your rating, join clubs and compete in tournaments.
            </p>
          </button>

          <button
            type="button"
            class="group rounded-xl border-2 border-[#3A5750] bg-[#1E2E2A] p-6 text-left transition-all hover:border-[#4DB175] hover:bg-[#2E4540]"
            @click="selectAccountType('club')"
          >
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F5A623]/20 text-2xl">
              🏆
            </div>
            <h3 class="text-lg font-semibold text-white">I'm a Club Organizer</h3>
            <p class="mt-2 text-sm text-[#6B7B75]">
              Create your club, organize open play sessions and tournaments, manage members.
            </p>
          </button>
        </div>

        <p class="text-center text-xs text-[#6B7B75]">
          You can always change this later or do both!
        </p>
      </div>

      <!-- Step: Questionnaire -->
      <div v-else-if="step === 'questionnaire' && currentQuestion" class="space-y-6">
        <!-- Progress Bar -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-[#6B7B75]">Question {{ currentQuestionIndex + 1 }} of {{ questions.length }}</span>
            <span class="rounded-full bg-[#4DB175]/20 px-3 py-1 text-xs text-[#4DB175]">
              {{ categoryLabel(currentQuestion.category) }}
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-[#1E2E2A]">
            <div
              class="h-full rounded-full bg-[#4DB175] transition-all duration-500"
              :style="{ width: `${progress}%` }"
            />
          </div>
        </div>

        <!-- Question Card -->
        <div class="rounded-xl bg-[#1E2E2A] p-6">
          <h2 class="mb-6 text-lg font-semibold text-white">
            {{ currentQuestion.question }}
          </h2>

          <div class="space-y-3">
            <button
              v-for="(choice, index) in currentQuestion.choices"
              :key="index"
              type="button"
              :disabled="loading"
              class="w-full rounded-lg border-2 border-[#3A5750] bg-[#0B0D09] p-4 text-left text-white transition-all hover:border-[#4DB175] hover:bg-[#2E4540] disabled:opacity-50"
              :class="{ 'border-[#4DB175] bg-[#2E4540]': answers[currentQuestion.id] === index }"
              @click="selectAnswer(index)"
            >
              {{ choice }}
            </button>
          </div>
        </div>

        <!-- Navigation -->
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 rounded-lg border border-[#3A5750] py-3 text-sm text-[#A6ABA7] hover:bg-[#2E4540]"
            @click="goBack"
          >
            Back
          </button>
        </div>
      </div>

      <!-- Step: Result with Celebration -->
      <div v-else-if="step === 'result' && ratingResult" class="space-y-6">
        <!-- Celebration Modal -->
        <div
          class="relative overflow-hidden rounded-xl bg-[#1E2E2A] p-8 text-center"
          :class="{ 'animate-celebration': showCelebration }"
        >
          <!-- Confetti Effect -->
          <div v-if="showCelebration" class="confetti-container">
            <div v-for="i in 50" :key="i" class="confetti" :style="{ '--i': i }" />
          </div>

          <!-- Rating Badge -->
          <div
            class="relative mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full"
            :class="{ 'animate-bounce-in': showCelebration }"
            :style="{ backgroundColor: `${ratingResult.tier.color}20` }"
          >
            <div
              class="flex h-28 w-28 flex-col items-center justify-center rounded-full"
              :style="{ backgroundColor: `${ratingResult.tier.color}30`, border: `3px solid ${ratingResult.tier.color}` }"
            >
              <span class="text-4xl">{{ tierEmoji }}</span>
            </div>
          </div>

          <!-- Congratulations Text -->
          <h1
            class="mb-2 text-2xl font-bold text-white"
            :class="{ 'animate-fade-in': showCelebration }"
          >
            Congratulations!
          </h1>

          <p class="mb-6 text-[#6B7B75]" :class="{ 'animate-fade-in-delay': showCelebration }">
            Your initial rating has been determined
          </p>

          <!-- Rating Display -->
          <div
            class="mb-4 space-y-2"
            :class="{ 'animate-scale-in': showCelebration }"
          >
            <div class="text-6xl font-bold" :style="{ color: ratingResult.tier.color }">
              {{ ratingResult.rating.toFixed(2) }}
            </div>
            <div
              class="inline-block rounded-full px-4 py-1 text-lg font-semibold text-white"
              :style="{ backgroundColor: ratingResult.tier.color }"
            >
              {{ ratingResult.tier.name }}
            </div>
          </div>

          <p class="text-sm text-[#6B7B75]">
            {{ ratingResult.tier.description }}
          </p>

          <!-- Rating Scale -->
          <div class="mt-6 space-y-2">
            <div class="flex items-center justify-between text-xs text-[#6B7B75]">
              <span>2.0</span>
              <span>Your Rating</span>
              <span>8.0</span>
            </div>
            <div class="relative h-3 overflow-hidden rounded-full bg-gradient-to-r from-[#6B7B75] via-[#4DB175] to-[#F5A623]">
              <div
                class="absolute top-0 h-full w-1 bg-white shadow-lg"
                :style="{ left: `${((ratingResult.rating - 2) / 6) * 100}%` }"
              />
            </div>
          </div>
        </div>

        <!-- Continue Button -->
        <button
          type="button"
          class="w-full rounded-lg bg-[#4DB175] py-4 text-lg font-semibold text-white transition-colors hover:bg-[#5FC287]"
          @click="goToDashboard"
        >
          Start Playing
        </button>

        <p class="text-center text-xs text-[#6B7B75]">
          Your rating will adjust as you play more matches
        </p>
      </div>

      <!-- Step: Club Creation Prompt -->
      <div v-else-if="step === 'club'" class="space-y-6">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-white">Create Your Club</h1>
          <p class="mt-2 text-[#6B7B75]">Set up your club and start organizing events</p>
        </div>

        <div class="rounded-xl bg-[#1E2E2A] p-6">
          <div class="space-y-4">
            <div class="flex items-start gap-3">
              <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#4DB175]/20 text-sm text-[#4DB175]">
                1
              </div>
              <div>
                <p class="font-medium text-white">Create your club</p>
                <p class="text-sm text-[#6B7B75]">Set up your club name, location, and details</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#4DB175]/20 text-sm text-[#4DB175]">
                2
              </div>
              <div>
                <p class="font-medium text-white">Invite members</p>
                <p class="text-sm text-[#6B7B75]">Share your club and grow your community</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#4DB175]/20 text-sm text-[#4DB175]">
                3
              </div>
              <div>
                <p class="font-medium text-white">Organize events</p>
                <p class="text-sm text-[#6B7B75]">Create open play sessions and tournaments</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            :disabled="loading"
            class="mt-6 w-full rounded-lg bg-[#4DB175] py-3 font-semibold text-white transition-colors hover:bg-[#5FC287] disabled:opacity-50"
            @click="continueToClubCreation"
          >
            {{ loading ? 'Setting up...' : 'Create Your Club' }}
          </button>

          <button
            type="button"
            class="mt-3 w-full rounded-lg border border-[#3A5750] py-3 text-sm text-[#A6ABA7] hover:bg-[#2E4540]"
            @click="step = 'type'"
          >
            Back
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-else-if="loading" class="flex items-center justify-center py-12">
        <div class="h-12 w-12 animate-spin rounded-full border-4 border-[#4DB175] border-t-transparent" />
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes bounce-in {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
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

.animate-bounce-in {
  animation: bounce-in 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
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

.confetti {
  position: absolute;
  width: 10px;
  height: 10px;
  top: -10px;
  left: calc(var(--i) * 2%);
  background: hsl(calc(var(--i) * 7.2), 80%, 60%);
  border-radius: 2px;
  animation: confetti-fall 3s ease-out forwards;
  animation-delay: calc(var(--i) * 0.02s);
  transform: rotate(calc(var(--i) * 10deg));
}

@keyframes confetti-fall {
  0% {
    top: -10px;
    opacity: 1;
    transform: rotate(0deg) translateX(0);
  }
  100% {
    top: 100%;
    opacity: 0;
    transform: rotate(720deg) translateX(calc((var(--i) - 25) * 2px));
  }
}
</style>
