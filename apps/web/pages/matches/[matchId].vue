<script setup lang="ts">
import type { MatchDto } from '~/server/domains/match/dto/match.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

const route = useRoute()
const matchId = computed(() => route.params.matchId as string)

const {
  data: match,
  pending,
  error,
  refresh
} = await useFetch<MatchDto & { players: Record<string, string> }>(
  () => `/api/v1/matches/${matchId.value}`
)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

/**
 * Rating changes this match produced, for the verification timeline's final
 * step. Empty until the match is rated, which is a normal state — the endpoint
 * returns [] rather than erroring, so this never blocks the page.
 */
const { data: ratingChanges } = await useFetch<{
  data: Array<{
    player_id: string
    display_name: string
    rating_delta: number
    new_rating: number
    created_at: string
  }>
}>(() => `/api/v1/matches/${matchId.value}/rating-changes`, { server: false })

// The detail endpoint now returns a players map, so the timeline can name who
// submitted and who verified instead of showing a truncated uuid. The id
// fallback stays for a profile that has since been deleted.
const nameForPlayer = (playerId: string) => {
  if (playerId === myProfile.value?.id) return 'You'
  return match.value?.players?.[playerId] ?? `Player ${playerId.slice(0, 8)}`
}

const timelineVerifications = computed(() =>
  (match.value?.verifications ?? []).map((v) => ({
    verifier_player_id: v.verifier_player_id,
    verifier_name: nameForPlayer(v.verifier_player_id),
    status: v.status,
    response_note: v.response_note,
    responded_at: v.responded_at
  }))
)

const timelineChanges = computed(() => ratingChanges.value?.data ?? [])
const ratedAt = computed(() => timelineChanges.value[0]?.created_at ?? null)

const actionError = ref('')
const actionMessage = ref('')
const acting = ref(false)
const note = ref('')

const isParticipant = computed(
  () =>
    !!myProfile.value &&
    !!match.value?.participants.some((p) => p.player_id === myProfile.value!.id)
)
const myVerification = computed(
  () => match.value?.verifications.find((v) => v.verifier_player_id === myProfile.value?.id) ?? null
)
const canInitiate = computed(() => isParticipant.value && match.value?.status === 'submitted')
const canDecide = computed(
  () => match.value?.status === 'pending_verification' && myVerification.value?.status === 'pending'
)
const isSinglesMatch = computed(() => match.value?.participants.length === 2)
const canCounter = computed(
  () =>
    isSinglesMatch.value &&
    isParticipant.value &&
    (match.value?.status === 'submitted' || match.value?.status === 'pending_verification')
)

const showCounterForm = ref(false)
const counterSets = ref([{ team1Score: '', team2Score: '' }])

function addCounterSet() {
  if (counterSets.value.length < 5) counterSets.value.push({ team1Score: '', team2Score: '' })
}

function removeCounterSet(index: number) {
  if (counterSets.value.length > 1) counterSets.value.splice(index, 1)
}

const canSubmitCounter = computed(() =>
  counterSets.value.every((s) => s.team1Score !== '' && s.team2Score !== '')
)

async function submitCounter() {
  actionError.value = ''
  actionMessage.value = ''
  if (!canSubmitCounter.value) {
    actionError.value = 'Enter a score for every set.'
    return
  }
  acting.value = true
  try {
    await $fetch(`/api/v1/matches/${matchId.value}/counter`, {
      method: 'POST',
      body: {
        scores: counterSets.value.map((s, i) => ({
          set_number: i + 1,
          team1_score: Number(s.team1Score),
          team2_score: Number(s.team2Score)
        }))
      }
    })
    actionMessage.value =
      'Your proposed score was recorded. The match is now marked disputed for review.'
    showCounterForm.value = false
    counterSets.value = [{ team1Score: '', team2Score: '' }]
    await refresh()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    actionError.value = fetchError.data?.message ?? 'Could not propose a different score.'
  } finally {
    acting.value = false
  }
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  submitted: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  pending_verification: { bg: 'bg-accent/20', text: 'text-accent' },
  verified: { bg: 'bg-primary/20', text: 'text-primary' },
  disputed: { bg: 'bg-red-500/20', text: 'text-red-400' },
  cancelled: { bg: 'bg-surface-3', text: 'text-fg-muted' }
}

async function startVerification() {
  actionError.value = ''
  actionMessage.value = ''
  acting.value = true
  try {
    await $fetch(`/api/v1/matches/${matchId.value}/verification`, { method: 'POST' })
    actionMessage.value = 'Verification started.'
    await refresh()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    actionError.value = fetchError.data?.message ?? 'Could not start verification.'
  } finally {
    acting.value = false
  }
}

async function recordDecision(status: 'confirmed' | 'rejected' | 'disputed') {
  actionError.value = ''
  actionMessage.value = ''
  acting.value = true
  try {
    await $fetch(`/api/v1/matches/${matchId.value}/verification/decision`, {
      method: 'POST',
      body: { status, response_note: note.value || null }
    })
    actionMessage.value = 'Your decision was recorded.'
    note.value = ''
    await refresh()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    actionError.value = fetchError.data?.message ?? 'Could not record your decision.'
  } finally {
    acting.value = false
  }
}

function getTeamPlayers(teamNumber: number) {
  return match.value?.participants.filter((p) => p.team_number === teamNumber) ?? []
}

function didTeamWinSet(setNumber: number, teamNumber: number): boolean {
  const score = match.value?.scores.find((s) => s.set_number === setNumber)
  if (!score) return false
  if (teamNumber === 1) return score.team1_score > score.team2_score
  return score.team2_score > score.team1_score
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <UiPageHeader to="/matches" back-label="Matches" />

      <!-- Loading -->
      <div v-if="pending" class="space-y-4">
        <div class="h-32 animate-pulse rounded-xl bg-surface" />
        <div class="h-48 animate-pulse rounded-xl bg-surface" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">
          {{
            error.statusCode === 404
              ? 'This match does not exist, or you were not a participant.'
              : 'Could not load this match.'
          }}
        </p>
        <NuxtLink to="/dashboard" class="mt-4 inline-block text-sm text-primary hover:underline">
          Back to dashboard
        </NuxtLink>
      </div>

      <!-- Match Details -->
      <div v-else-if="match">
        <!-- Header -->
        <div class="mb-6 flex items-start justify-between">
          <div>
            <h1 class="text-2xl font-bold text-fg">
              {{ match.match_type === 'singles' ? 'Singles' : 'Doubles' }} Match
            </h1>
            <p class="mt-1 text-fg-muted">
              {{ new Date(match.played_at).toLocaleDateString() }} at
              {{
                new Date(match.played_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })
              }}
            </p>
            <p v-if="match.venue" class="text-sm text-fg-muted">{{ match.venue }}</p>
          </div>
          <span
            class="rounded-md px-3 py-1 text-sm font-medium capitalize"
            :class="statusConfig[match.status]?.bg + ' ' + statusConfig[match.status]?.text"
          >
            {{ match.status.replace('_', ' ') }}
          </span>
        </div>

        <!-- Score Card -->
        <div class="mb-6 rounded-xl bg-surface p-5 shadow-card">
          <div class="flex items-center justify-between gap-4">
            <!-- Team 1 -->
            <div class="flex-1 text-center">
              <div class="space-y-1">
                <NuxtLink
                  v-for="p in getTeamPlayers(1)"
                  :key="p.player_id"
                  :to="`/players/${p.player_id}`"
                  class="block text-sm font-medium text-primary hover:underline"
                >
                  {{ p.player_id === myProfile?.id ? 'You' : p.player_id.slice(0, 8) }}
                </NuxtLink>
              </div>
            </div>

            <!-- Sets -->
            <div class="flex items-center gap-2">
              <div
                v-for="s in match.scores"
                :key="s.set_number"
                class="flex flex-col items-center rounded-lg bg-canvas px-3 py-2"
              >
                <span class="text-xs text-fg-muted">Set {{ s.set_number }}</span>
                <div class="flex items-center gap-1 text-lg font-bold">
                  <span
                    :class="didTeamWinSet(s.set_number, 1) ? 'text-primary' : 'text-fg-secondary'"
                  >
                    {{ s.team1_score }}
                  </span>
                  <span class="text-fg-muted">-</span>
                  <span
                    :class="didTeamWinSet(s.set_number, 2) ? 'text-primary' : 'text-fg-secondary'"
                  >
                    {{ s.team2_score }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Team 2 -->
            <div class="flex-1 text-center">
              <div class="space-y-1">
                <NuxtLink
                  v-for="p in getTeamPlayers(2)"
                  :key="p.player_id"
                  :to="`/players/${p.player_id}`"
                  class="block text-sm font-medium text-primary hover:underline"
                >
                  {{ p.player_id === myProfile?.id ? 'You' : p.player_id.slice(0, 8) }}
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>

        <!-- Verification timeline. The mockup's central element: an auditable
             chain of who did what and when is what makes a disputed result
             resolvable (docs/33 §5.6). -->
        <div class="mb-6 rounded-card border border-border bg-surface p-5 shadow-card">
          <h2 class="mb-4 font-display text-heading-3 text-fg">Timeline</h2>

          <MatchVerificationTimeline
            :submitted-at="match.created_at"
            :submitted-by-name="nameForPlayer(match.submitted_by_player_id)"
            :status="match.status"
            :verifications="timelineVerifications"
            :rating-changes="timelineChanges"
            :rated-at="ratedAt"
          />

          <div
            v-if="match.verifications.length === 0 && canInitiate"
            class="mt-4 border-t border-border pt-4"
          >
            <p class="mb-3 text-body-2 text-fg-secondary">
              Verification has not started yet. Ask your opponent to confirm the score.
            </p>
            <UiButton :loading="acting" @click="startVerification"> Start verification </UiButton>
          </div>
        </div>

        <!-- Decision Form -->
        <div v-if="canDecide" class="mb-6 rounded-xl bg-surface p-5 shadow-card">
          <h2 class="mb-4 font-semibold text-fg">Your Decision</h2>
          <p class="mb-4 text-sm text-fg-muted">
            Please verify the match details above and confirm or dispute.
          </p>
          <textarea
            v-model="note"
            placeholder="Add an optional note..."
            class="mb-4 w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
            rows="2"
          />
          <div class="flex gap-2">
            <button
              :disabled="acting"
              class="flex-1 rounded-lg bg-primary py-2.5 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
              @click="recordDecision('confirmed')"
            >
              Confirm
            </button>
            <button
              :disabled="acting"
              class="flex-1 rounded-lg border border-red-400 py-2.5 font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-50"
              @click="recordDecision('rejected')"
            >
              Reject
            </button>
            <button
              :disabled="acting"
              class="flex-1 rounded-lg border border-yellow-400 py-2.5 font-medium text-yellow-400 hover:bg-yellow-400/10 disabled:opacity-50"
              @click="recordDecision('disputed')"
            >
              Dispute
            </button>
          </div>
        </div>

        <!-- Counter-Proposal -->
        <div v-if="canCounter" class="mb-6 rounded-xl bg-surface p-5 shadow-card">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-semibold text-fg">Disagree with the score?</h2>
            <button
              v-if="!showCounterForm"
              type="button"
              class="text-sm text-yellow-400 hover:underline"
              @click="showCounterForm = true"
            >
              Propose Different Score
            </button>
          </div>

          <div v-if="showCounterForm" class="space-y-3">
            <p class="text-sm text-fg-muted">
              This records your proposed score and marks the match disputed for organizer review.
            </p>
            <div
              v-for="(set, i) in counterSets"
              :key="i"
              class="flex items-center gap-3 rounded-lg bg-canvas p-3"
            >
              <span class="w-14 text-sm text-fg-muted">Set {{ i + 1 }}</span>
              <div class="flex flex-1 items-center gap-2">
                <input
                  v-model="set.team1Score"
                  type="number"
                  min="0"
                  placeholder="T1"
                  class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-center text-fg focus:border-primary focus:outline-none"
                />
                <span class="text-fg-muted">-</span>
                <input
                  v-model="set.team2Score"
                  type="number"
                  min="0"
                  placeholder="T2"
                  class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-center text-fg focus:border-primary focus:outline-none"
                />
              </div>
              <button
                v-if="counterSets.length > 1"
                type="button"
                class="text-fg-muted hover:text-red-400"
                @click="removeCounterSet(i)"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <button
              v-if="counterSets.length < 5"
              type="button"
              class="text-sm text-primary hover:underline"
              @click="addCounterSet"
            >
              + Add Set
            </button>
            <div class="flex gap-2 pt-2">
              <button
                type="button"
                :disabled="acting"
                class="flex-1 rounded-lg border border-yellow-400 py-2.5 font-medium text-yellow-400 hover:bg-yellow-400/10 disabled:opacity-50"
                @click="submitCounter"
              >
                {{ acting ? 'Submitting...' : 'Submit Proposed Score' }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-border-strong px-4 py-2.5 text-fg-secondary hover:bg-surface-2"
                @click="showCounterForm = false"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        <!-- Score Proposal History -->
        <div
          v-if="match.score_proposals.length > 0"
          class="mb-6 rounded-xl bg-surface p-5 shadow-card"
        >
          <h2 class="mb-4 font-semibold text-fg">Proposed Scores</h2>
          <div class="space-y-3">
            <div
              v-for="proposal in match.score_proposals"
              :key="proposal.id"
              class="rounded-lg bg-canvas p-3"
            >
              <div class="mb-2 flex items-center justify-between">
                <span class="text-sm text-fg-secondary">
                  Round {{ proposal.proposal_round }} by
                  {{
                    proposal.proposed_by_player_id === myProfile?.id
                      ? 'you'
                      : proposal.proposed_by_player_id.slice(0, 8)
                  }}
                </span>
                <span
                  class="rounded-md bg-yellow-500/20 px-2 py-0.5 text-xs font-medium capitalize text-yellow-400"
                >
                  {{ proposal.status }}
                </span>
              </div>
              <div class="flex gap-2 text-sm text-fg">
                <span
                  v-for="s in proposal.scores"
                  :key="s.set_number"
                  class="rounded bg-surface-2 px-2 py-1"
                >
                  {{ s.team1_score }}-{{ s.team2_score }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <div
          v-if="actionMessage"
          class="mb-6 rounded-xl bg-primary/10 p-4 text-center text-primary ring-1 ring-primary/30"
        >
          {{ actionMessage }}
        </div>
        <div v-if="actionError" class="mb-6 rounded-xl bg-red-500/10 p-4 text-red-400">
          {{ actionError }}
        </div>

        <!-- Back Link -->
        <div class="text-center">
          <NuxtLink to="/dashboard" class="text-sm text-primary hover:underline">
            Back to dashboard
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
