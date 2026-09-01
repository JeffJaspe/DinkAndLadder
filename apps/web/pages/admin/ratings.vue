<script setup lang="ts">
import type { RatingBackfillReport } from '~/server/domains/rating/services/rating-backfill.service'

/**
 * Recalculating the ratings that were never calculated.
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
        Recalculate ratings for matches that were recorded before the rating engine could see
        them.
      </p>
    </header>

    <div
      v-if="!availableHere"
      class="rounded-card border border-border bg-warning-soft p-5 text-body-2 text-warning"
    >
      <p class="font-medium">Not available on this environment.</p>
      <p class="mt-1 text-fg-secondary">
        The rating backfill runs against development only. It rewrites ratings and history in
        bulk, and there is no way to undo it — so it is disabled everywhere else, whoever is
        signed in.
      </p>
    </div>

    <section v-else class="rounded-card border border-border bg-surface p-5 shadow-card">
      <h2 class="font-display text-heading-3 text-fg">Backfill past matches</h2>

      <div class="mt-3 max-w-prose space-y-2 text-body-2 text-fg-secondary">
        <p>
          Tournament results used to be saved without ever reaching the rating engine, so those
          matches moved nobody's rating and left no history. Matches recorded from now on are
          rated correctly — this repairs the older ones.
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
