<script setup lang="ts">
import type { RatingBackfillReport } from '~/server/domains/rating/services/rating-backfill.service'

/**
 * Two SuperAdmin rating tools.
 *
 * 1. Reset a player's rating — puts them back to "unrated" so they retake the
 *    Initial Skill Rating questionnaire (it refuses while a rating exists).
 *    Works on every environment; audit-logged server-side.
 *
 * 2. Recalculating the ratings that were never calculated (development only).
 *
 * Until 2026-09-01 the rating trigger lived inside the match-verification
 * endpoint, so the other route to a verified match — an organiser recording a
 * draw result — rated nothing. Every tournament match ever recorded left the
 * players' ratings untouched. New results are fixed; the ones already in the
 * table have to be replayed, which is what this page does.
 *
 * This exists as a page rather than an API call because the alternative was
 * asking somebody to paste JavaScript into a browser console to repair their
 * own data. The endpoint pages (rating is strictly sequential, so a few
 * thousand matches outlast any request), and the loop belongs here rather than
 * in the operator's hands.
 */
definePageMeta({ middleware: ['super-admin'] })
useHead({ title: 'Ratings' })

/**
 * Development only.
 *
 * The endpoint enforces this itself — a client cannot be trusted to withhold
 * an action it can still call — so this is the honest label rather than the
 * guard. Reaching this page on production shows the notice below and no button.
 */
const availableHere = import.meta.dev

const PAGE_SIZE = 100

/** How many pages to walk before stopping on its own, as a runaway guard. */
const MAX_PAGES = 200

type Totals = Pick<RatingBackfillReport, 'scanned' | 'rated' | 'already_rated' | 'failed'>

// ── Reset a player's rating ─────────────────────────────────────────────
interface LookedUp {
  id: string
  email: string
  is_self: boolean
  player: {
    id: string
    display_name: string
    singles_rating: number | null
    doubles_rating: number | null
    matches_played: number
  } | null
}

const email = ref('')
const searching = ref(false)
const searchError = ref('')
const found = ref<LookedUp | null>(null)
const confirmOpen = ref(false)
const resetting = ref(false)
const resetError = ref('')
const resetDone = ref('')

const isRated = computed(
  () => found.value?.player != null && found.value.player.singles_rating != null
)

async function lookup() {
  searchError.value = ''
  resetDone.value = ''
  found.value = null
  if (!email.value.trim()) return
  searching.value = true
  try {
    const response = await $fetch<{ data: LookedUp }>('/api/v1/admin/users/lookup', {
      query: { email: email.value }
    })
    found.value = response.data
  } catch (err) {
    searchError.value = apiErrorMessage(err, 'Could not look that account up.')
  } finally {
    searching.value = false
  }
}

async function resetRating() {
  if (!found.value?.player) return
  resetError.value = ''
  resetting.value = true
  try {
    await $fetch(`/api/v1/admin/players/${found.value.player.id}/rating-reset`, {
      method: 'POST'
    })
    resetDone.value = `${found.value.player.display_name}'s rating was reset. They will be asked to take the skill assessment the next time they open their dashboard.`
    found.value = {
      ...found.value,
      player: {
        ...found.value.player,
        singles_rating: null,
        doubles_rating: null,
        matches_played: 0
      }
    }
    confirmOpen.value = false
  } catch (err) {
    resetError.value = apiErrorMessage(err, 'Could not reset the rating.')
  } finally {
    resetting.value = false
  }
}

// ── Backfill (development only) ───────────────────────────────────────────
const running = ref(false)
const wasDryRun = ref(true)
const progressOffset = ref(0)
const totals = ref<Totals | null>(null)
const failedIds = ref<string[]>([])
const errorMessage = ref('')
const finished = ref(false)

async function run(dryRun: boolean) {
  running.value = true
  wasDryRun.value = dryRun
  errorMessage.value = ''
  finished.value = false
  failedIds.value = []
  progressOffset.value = 0
  totals.value = { scanned: 0, rated: 0, already_rated: 0, failed: 0 }

  let offset = 0

  try {
    for (let pageCount = 0; pageCount < MAX_PAGES; pageCount++) {
      const response = await $fetch<{ data: RatingBackfillReport }>(
        '/api/v1/admin/rating/backfill',
        { method: 'POST', body: { limit: PAGE_SIZE, offset, dry_run: dryRun } }
      )
      const report = response.data

      totals.value = {
        scanned: totals.value!.scanned + report.scanned,
        rated: totals.value!.rated + report.rated,
        already_rated: totals.value!.already_rated + report.already_rated,
        failed: totals.value!.failed + report.failed
      }
      failedIds.value = [...failedIds.value, ...report.failed_match_ids]

      if (!report.has_more) break
      offset = report.next_offset
      progressOffset.value = offset
    }
    finished.value = true
  } catch (err) {
    // Deliberately keeps the totals gathered so far on screen: knowing it
    // stopped at match 400 of 900 is the useful part, and re-running from the
    // start is safe anyway.
    errorMessage.value = apiErrorMessage(err, 'The backfill stopped early.')
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div class="page-shell px-4 py-6 lg:px-6">
    <header class="mb-6">
      <h1 class="font-display text-heading-1 text-fg">Ratings</h1>
      <p class="mt-1 max-w-prose text-body-2 text-fg-secondary">
        Super admin only. Reset a player's rating so they retake the skill assessment, or
        recalculate ratings for matches recorded before the rating engine could see them.
      </p>
    </header>

    <!-- Reset a player's rating -->
    <section class="mb-6 rounded-card border border-border bg-surface p-5 shadow-card">
      <h2 class="font-display text-heading-3 text-fg">Reset a player's rating</h2>
      <p class="mt-3 max-w-prose text-body-2 text-fg-secondary">
        Clears the player's singles and doubles ratings and match count so they take the Initial
        Skill Rating questionnaire again. Their rating history is kept. Every reset is audit-logged.
      </p>

      <form class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start" @submit.prevent="lookup">
        <div class="flex-1">
          <label for="reset-lookup-email" class="sr-only">Account email</label>
          <input
            id="reset-lookup-email"
            v-model="email"
            type="email"
            required
            autocomplete="off"
            placeholder="Account email"
            class="w-full rounded-button border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p v-if="searchError" role="alert" class="mt-2 text-body-2 text-danger">
            {{ searchError }}
          </p>
        </div>
        <UiButton type="submit" :disabled="searching">
          {{ searching ? 'Looking up…' : 'Look up' }}
        </UiButton>
      </form>

      <p
        v-if="resetDone"
        role="status"
        class="mt-4 rounded-button bg-primary-soft px-4 py-3 text-body-2 text-primary"
      >
        {{ resetDone }}
      </p>

      <div
        v-if="found"
        data-testid="reset-lookup-result"
        class="mt-5 flex flex-col gap-4 rounded-card border border-border bg-canvas p-4 sm:flex-row sm:items-center"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-fg">
            {{ found.player?.display_name ?? found.email }}
          </p>
          <p class="mt-0.5 truncate text-body-2 text-fg-muted">{{ found.email }}</p>
          <p v-if="found.player" class="mt-1 text-body-2 text-fg-secondary">
            <template v-if="isRated">
              Singles {{ found.player.singles_rating?.toFixed(2) }} · Doubles
              {{ found.player.doubles_rating?.toFixed(2) ?? '—' }} ·
              {{ found.player.matches_played }} rated
              {{ found.player.matches_played === 1 ? 'match' : 'matches' }}
            </template>
            <template v-else>Unrated — the assessment is already open to them</template>
          </p>
          <p v-else class="mt-1 text-body-2 text-fg-secondary">
            No player profile yet — there is nothing to reset
          </p>
        </div>
        <UiButton v-if="isRated" variant="danger" @click="confirmOpen = true">
          Reset rating
        </UiButton>
      </div>

      <UiModal
        v-model="confirmOpen"
        title="Reset this player's rating?"
        :description="`${found?.player?.display_name ?? 'This player'} will go back to unrated and be asked to take the skill assessment again. Their match history stays, but their current rating and match count are cleared.`"
        confirm-label="Reset rating"
        destructive
        :loading="resetting"
        @confirm="resetRating"
      >
        <p v-if="resetError" role="alert" class="text-body-2 text-danger">{{ resetError }}</p>
      </UiModal>
    </section>

    <div
      v-if="!availableHere"
      class="rounded-card border border-border bg-warning-soft p-5 text-body-2 text-warning"
    >
      <p class="font-medium">Not available on this environment.</p>
      <p class="mt-1 text-fg-secondary">
        The rating backfill runs against development only. It rewrites ratings and history in bulk,
        and there is no way to undo it — so it is disabled everywhere else, whoever is signed in.
      </p>
    </div>

    <section v-else class="rounded-card border border-border bg-surface p-5 shadow-card">
      <h2 class="font-display text-heading-3 text-fg">Backfill past matches</h2>

      <div class="mt-3 max-w-prose space-y-2 text-body-2 text-fg-secondary">
        <p>
          Tournament results used to be saved without ever reaching the rating engine, so those
          matches moved nobody's rating and left no history. Matches recorded from now on are rated
          correctly — this repairs the older ones.
        </p>
        <p>
          <strong class="text-fg">Check first</strong> counts what would change without writing
          anything. <strong class="text-fg">Apply</strong> does it for real. Running either one
          twice is harmless: a match that already has a rating is skipped.
        </p>
      </div>

      <div class="mt-5 flex flex-wrap gap-3">
        <UiButton :disabled="running" variant="secondary" @click="run(true)">
          {{ running && wasDryRun ? 'Checking…' : 'Check first (no changes)' }}
        </UiButton>
        <UiButton :disabled="running" @click="run(false)">
          {{ running && !wasDryRun ? 'Applying…' : 'Apply' }}
        </UiButton>
      </div>

      <p v-if="running" class="mt-3 text-caption text-fg-muted">
        Working through matches in order, {{ PAGE_SIZE }} at a time — {{ progressOffset }} so far.
        This can take a minute; leave the page open.
      </p>

      <!-- Results -->
      <div v-if="totals" class="mt-5 border-t border-border pt-5">
        <p class="mb-3 text-body-2 font-medium text-fg">
          {{ wasDryRun ? 'Would change (nothing was written)' : 'Done' }}
        </p>

        <dl class="grid gap-3 sm:grid-cols-4">
          <div class="rounded-button bg-canvas p-3">
            <dt class="text-caption text-fg-muted">Matches checked</dt>
            <dd class="font-mono text-heading-3 tabular-nums text-fg">{{ totals.scanned }}</dd>
          </div>
          <div class="rounded-button bg-primary-soft p-3">
            <dt class="text-caption text-primary">{{ wasDryRun ? 'Would rate' : 'Rated' }}</dt>
            <dd class="font-mono text-heading-3 tabular-nums text-primary">{{ totals.rated }}</dd>
          </div>
          <div class="rounded-button bg-canvas p-3">
            <dt class="text-caption text-fg-muted">Already rated</dt>
            <dd class="font-mono text-heading-3 tabular-nums text-fg-secondary">
              {{ totals.already_rated }}
            </dd>
          </div>
          <div class="rounded-button p-3" :class="totals.failed ? 'bg-warning-soft' : 'bg-canvas'">
            <dt class="text-caption" :class="totals.failed ? 'text-warning' : 'text-fg-muted'">
              Could not rate
            </dt>
            <dd
              class="font-mono text-heading-3 tabular-nums"
              :class="totals.failed ? 'text-warning' : 'text-fg-secondary'"
            >
              {{ totals.failed }}
            </dd>
          </div>
        </dl>

        <!-- Expected, not alarming — so it is explained rather than just counted. -->
        <p v-if="totals.failed" class="mt-3 max-w-prose text-caption text-fg-muted">
          Matches that could not be rated are almost always ones involving a player who has no
          starting rating yet. That is a known gap, not a fault here — they can be replayed safely
          once those players have ratings.
        </p>

        <p v-if="finished && !wasDryRun && totals.rated" class="mt-3 text-body-2 text-fg-secondary">
          Ratings and history are updated. Rating progress charts will now have data.
        </p>
      </div>

      <UiErrorState v-if="errorMessage" class="mt-5" :message="errorMessage" />
    </section>
  </div>
</template>
