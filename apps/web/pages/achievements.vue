<script setup lang="ts">
import type { AchievementGalleryDto } from '~/server/domains/achievement/services/achievement-gallery.service'
import { achievementTier } from '~/utils/achievement-icons'

/**
 * The trophy cabinet: every badge the platform awards, marked earned or locked.
 *
 * Three things were wrong with the version this replaces.
 *
 * 1. **Nothing here had ever been earned by anybody.** The unlock logic existed
 *    and was never called from application code, so all sixteen rows were
 *    locked for every player on the platform, permanently. That is fixed on the
 *    server (server/utils/award-achievements.ts); what this page owes is a
 *    locked state that reads as an invitation rather than as a dead end.
 * 2. **A locked badge said nothing about how to get it.** It showed the same
 *    description as an earned one at 70% opacity. Every locked badge now
 *    carries its requirement, and its progress where the requirement is a
 *    count — both read from the same numbers the unlock decision uses, so the
 *    page cannot disagree with the grant.
 * 3. **`opacity-70` on the whole card** took body copy below the AA contrast
 *    floor to signal "locked". Locked is now signalled structurally — a flat,
 *    dashed, unelevated tile against the earned badge's raised card — and by
 *    desaturating the glyph, which is the only part that carries colour. All
 *    text stays at full strength in both states.
 */
definePageMeta({ middleware: ['feature-achievements'] })

useHead({ title: 'Achievements' })

const {
  data: galleryData,
  status,
  error,
  refresh
} = await useFetch<{ data: AchievementGalleryDto }>('/api/v1/players/me/achievements')

const gallery = computed(() => galleryData.value?.data ?? null)
const entries = computed(() => gallery.value?.entries ?? [])

/** The badge currently on the player's profile, so the tiles can say so. */
const { data: badgeData, refresh: refreshBadge } = await useFetch<{
  data: { showcase: { selectedBadgeId: string | null } | null }
}>('/api/v1/players/me/badge')

const selectedBadgeKey = computed(() => badgeData.value?.data?.showcase?.selectedBadgeId ?? null)

const CATEGORY_LABELS: Record<string, string> = {
  milestone: 'Milestones',
  skill: 'Skill',
  social: 'Community',
  event: 'Tournaments',
  streak: 'Streaks'
}

const activeCategory = ref<string>('all')

const categoryItems = computed(() => {
  const counts = new Map<string, number>()
  for (const entry of entries.value) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1)
  }
  return [
    { value: 'all', label: 'All', count: entries.value.length },
    ...[...counts.entries()].map(([category, count]) => ({
      value: category,
      label: CATEGORY_LABELS[category] ?? category,
      count
    }))
  ]
})

const visibleEntries = computed(() =>
  activeCategory.value === 'all'
    ? entries.value
    : entries.value.filter((e) => e.category === activeCategory.value)
)

const earnedVisible = computed(() => visibleEntries.value.filter((e) => e.earned))
const lockedVisible = computed(() => visibleEntries.value.filter((e) => !e.earned))

/**
 * Percentage earned, used for the one bar on the page.
 *
 * Guarded against a zero total: the gallery is seeded, but a feature flag turned
 * off mid-session or a failed fetch must not render `NaN%` into a style
 * attribute, which silently leaves the bar full.
 */
const earnedPercent = computed(() => {
  const total = gallery.value?.total_count ?? 0
  if (!total) return 0
  return Math.round(((gallery.value?.earned_count ?? 0) / total) * 100)
})

/**
 * The page's one authored moment: the progress bar sweeps from zero to its real
 * width as the page settles.
 *
 * The finished state is the CSS default (the bar is drawn at its true width on
 * the server). Only this handler winds it back, and only when motion is
 * welcome — so with no JS, a failed hydration, or reduced motion, the bar is
 * simply correct. See the Recoverable-Motion Rule in DESIGN.md.
 */
const barWound = ref(false)
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  barWound.value = true
  requestAnimationFrame(() => requestAnimationFrame(() => (barWound.value = false)))
})

/** Tier colouring shared with the badge mark, so chip and glyph agree. */
const tierOf = achievementTier

function earnedOn(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// ── Showing a badge on the profile ──────────────────────────────────────
const savingKey = ref<string | null>(null)
const showcaseError = ref('')

async function showOnProfile(key: string) {
  savingKey.value = key
  showcaseError.value = ''
  try {
    // Sending the key again would clear it, which is the natural meaning of
    // tapping the badge that is already there.
    const next = selectedBadgeKey.value === key ? null : key
    await $fetch('/api/v1/players/me/badge', { method: 'PUT', body: { badge_id: next } })
    await refreshBadge()
  } catch (err) {
    showcaseError.value = apiErrorMessage(err, 'Could not update your profile badge.')
  } finally {
    savingKey.value = null
  }
}
</script>

<template>
  <div class="min-h-screen bg-canvas px-4 py-6 lg:px-6">
    <div class="page-shell">
      <header class="border-b border-border-strong pb-6">
        <h1 class="font-display text-heading-1 text-fg">Achievements</h1>
        <p class="mt-1 max-w-prose text-body-2 text-fg-secondary">
          Badges are earned from your record — matches an organiser recorded, ratings you reached,
          clubs you joined. Earn one and you can show it on your profile.
        </p>

        <div v-if="gallery" class="mt-6">
          <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p class="text-body-1 text-fg">
              <span class="font-display font-medium tabular-nums">{{ gallery.earned_count }}</span>
              of
              <span class="tabular-nums">{{ gallery.total_count }}</span> earned
            </p>
            <p class="text-body-2 text-fg-muted">
              <span class="tabular-nums">{{ gallery.total_points }}</span> points ·
              <span class="tabular-nums">{{ gallery.points_remaining }}</span> still to play for
            </p>
          </div>

          <div
            class="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-3"
            role="img"
            :aria-label="`${earnedPercent}% of badges earned`"
          >
            <div
              class="h-full rounded-pill bg-primary motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]"
              :style="{ width: barWound ? '0%' : `${earnedPercent}%` }"
            />
          </div>
        </div>
      </header>

      <UiErrorState
        v-if="error"
        class="mt-6"
        message="Could not load your achievements."
        @retry="refresh()"
      />

      <template v-else>
        <div class="-mx-4 mt-6 overflow-x-auto px-4 pb-1">
          <UiSegmented
            v-model="activeCategory"
            class="w-max"
            :items="categoryItems"
            size="sm"
            label="Achievement category"
          />
        </div>

        <p
          v-if="showcaseError"
          role="alert"
          class="mt-4 rounded-button bg-danger-soft px-4 py-3 text-body-2 text-danger"
        >
          {{ showcaseError }}
        </p>

        <!-- Loading -->
        <div v-if="status === 'pending'" class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UiSkeleton v-for="i in 6" :key="i" variant="card" height="10rem" />
        </div>

        <template v-else>
          <!-- Earned -->
          <section v-if="earnedVisible.length" class="mt-8">
            <h2 class="font-display text-heading-3 text-fg">Earned</h2>
            <ul class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <li
                v-for="entry in earnedVisible"
                :key="entry.id"
                class="flex flex-col rounded-card border border-border bg-surface p-4 shadow-card"
              >
                <div class="flex items-start gap-3">
                  <AchievementBadgeIcon :achievement-key="entry.key" :tier="entry.tier" />
                  <div class="min-w-0 flex-1">
                    <h3 class="text-body-1 font-medium text-fg">{{ entry.name }}</h3>
                    <p class="mt-0.5 text-body-2 text-fg-secondary">{{ entry.description }}</p>
                  </div>
                </div>

                <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    class="rounded-badge px-2 py-0.5 text-caption font-medium"
                    :class="[tierOf(entry.tier).chip, tierOf(entry.tier).text]"
                  >
                    {{ tierOf(entry.tier).label }}
                  </span>
                  <span class="text-caption tabular-nums text-fg-muted">
                    +{{ entry.points }} pts
                  </span>
                  <span class="text-caption tabular-nums text-fg-muted">
                    · Earned {{ earnedOn(entry.earned_at) }}
                  </span>
                </div>

                <button
                  type="button"
                  class="mt-3 flex items-center gap-2 self-start border-t border-border pt-3 text-body-2 font-medium transition-colors disabled:opacity-60"
                  :class="
                    selectedBadgeKey === entry.key
                      ? 'text-primary hover:text-fg'
                      : 'text-fg-secondary hover:text-primary'
                  "
                  :disabled="savingKey === entry.key"
                  :aria-pressed="selectedBadgeKey === entry.key"
                  @click="showOnProfile(entry.key)"
                >
                  <UiIcon
                    :name="selectedBadgeKey === entry.key ? 'check' : 'user'"
                    size="h-4 w-4"
                    :stroke-width="2.2"
                    aria-hidden="true"
                  />
                  <template v-if="savingKey === entry.key">Saving…</template>
                  <template v-else-if="selectedBadgeKey === entry.key">
                    On your profile — tap to remove
                  </template>
                  <template v-else>Show on profile</template>
                </button>
              </li>
            </ul>
          </section>

          <!-- Nothing earned in this filter. Honest, and it names the next step. -->
          <UiEmptyState
            v-else-if="lockedVisible.length"
            class="mt-8"
            icon="trophy"
            title="No badges here yet"
            message="Every badge below says exactly what it takes. The first one usually arrives the day an organiser records your first match."
            compact
          />

          <!-- Locked -->
          <section v-if="lockedVisible.length" class="mt-8">
            <div class="flex items-baseline justify-between gap-4">
              <h2 class="font-display text-heading-3 text-fg">Still to earn</h2>
              <p class="text-caption tabular-nums text-fg-muted">
                {{ lockedVisible.length }} {{ lockedVisible.length === 1 ? 'badge' : 'badges' }}
              </p>
            </div>

            <ul class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <li
                v-for="entry in lockedVisible"
                :key="entry.id"
                class="flex flex-col rounded-card border border-dashed border-border-strong bg-canvas p-4"
              >
                <div class="flex items-start gap-3">
                  <!-- Greyed rather than faded. Dropping opacity on the whole
                       tile is what took the old page's body copy below the
                       contrast floor; the mark is the only part carrying
                       colour, so it is the only part that changes. -->
                  <AchievementBadgeIcon :achievement-key="entry.key" :tier="entry.tier" locked />
                  <div class="min-w-0 flex-1">
                    <h3 class="flex items-center gap-1.5 text-body-1 font-medium text-fg-secondary">
                      {{ entry.name }}
                      <UiIcon
                        name="lock"
                        size="h-3.5 w-3.5"
                        :stroke-width="2.2"
                        class="shrink-0 text-fg-muted"
                        aria-hidden="true"
                      />
                      <span class="sr-only">Locked</span>
                    </h3>
                    <p v-if="entry.hint" class="mt-0.5 text-body-2 text-fg-secondary">
                      {{ entry.hint }}
                    </p>
                  </div>
                </div>

                <!-- Requirement already met, badge not yet granted. Drawing a
                     full bar under a padlock reads as a broken page, so the
                     state is named instead. This is genuinely reachable:
                     badges are awarded from here forward with no backfill, so
                     a long-standing player's record can satisfy a badge before
                     anything has re-run the evaluator for them. -->
                <p
                  v-if="entry.pending"
                  class="mt-3 flex items-start gap-2 text-body-2 text-primary"
                >
                  <UiIcon
                    name="clock"
                    size="h-4 w-4"
                    :stroke-width="2.2"
                    class="mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>Requirement met — this lands the next time your record updates.</span>
                </p>

                <!-- Progress, only where the requirement is genuinely a count.
                     A rating is a level you reach, not a total you accumulate,
                     so those badges deliberately show no bar. -->
                <div v-else-if="entry.progress" class="mt-3">
                  <div class="flex items-baseline justify-between text-caption text-fg-muted">
                    <span>Progress</span>
                    <span class="tabular-nums"
                      >{{ entry.progress.current }} / {{ entry.progress.target }}</span
                    >
                  </div>
                  <div class="mt-1 h-1 overflow-hidden rounded-pill bg-surface-3">
                    <div
                      class="h-full rounded-pill bg-fg-muted"
                      :style="{
                        width: `${Math.round((entry.progress.current / entry.progress.target) * 100)}%`
                      }"
                    />
                  </div>
                </div>

                <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    class="rounded-badge border border-border px-2 py-0.5 text-caption font-medium text-fg-muted"
                  >
                    {{ tierOf(entry.tier).label }}
                  </span>
                  <span class="text-caption tabular-nums text-fg-muted">
                    +{{ entry.points }} pts when earned
                  </span>
                </div>
              </li>
            </ul>
          </section>

          <!-- Every badge held. Rare, and worth saying out loud. -->
          <p
            v-else-if="earnedVisible.length"
            class="mt-8 border-t border-border pt-6 text-body-2 text-fg-secondary"
          >
            That is every badge in this category. Nothing left to chase here.
          </p>
        </template>
      </template>
    </div>
  </div>
</template>
