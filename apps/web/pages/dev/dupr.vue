<script setup lang="ts">
/**
 * Dev-only preview of the DUPR mark on your own account.
 *
 * The DUPR columns do not exist yet — that is migration 055, and 051 through
 * 054 are still queued ahead of it — so there is no way to look at this on a
 * real profile. This page renders the shipping `UiDuprBadge` against the
 * signed-in player's REAL name, city and rating, with the DUPR figure supplied
 * here as a clearly-marked sample.
 *
 * Switch accounts with the normal switcher and this re-reads: `players/me`
 * follows the active account, so each of your accounts can be looked at in
 * turn.
 *
 * Every DUPR number on this page is a sample. Nothing here is stored, and no
 * DUPR account has been linked — the integration does not exist yet.
 *
 * Not shipped: it 404s outside dev, like pages/dev/theme.vue.
 */
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { PlayerRatingDto } from '~/server/domains/rating/dto/rating.dto'
import { formatRating } from '~/utils/rating-tiers'

if (!import.meta.dev) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
}

definePageMeta({ layout: false })

const { data: me } = await useFetch<PlayerProfileDto>('/api/v1/players/me', { server: false })

const { data: ratings } = await useFetch<{
  singles: PlayerRatingDto | null
  doubles: PlayerRatingDto | null
}>(() => `/api/v1/players/${me.value?.id}/ratings`, {
  server: false,
  immediate: false,
  watch: [me]
})

/** The real DinkAndLadder doubles rating, or the singles one if that is all there is. */
const dnlRating = computed(
  () => ratings.value?.doubles?.rating_value ?? ratings.value?.singles?.rating_value ?? null
)

/**
 * A sample DUPR figure, offset from the real rating so the two are visibly
 * different numbers on the same scale — which is the whole design problem.
 * Never stored, never sent anywhere.
 */
const sampleDupr = computed(() => (dnlRating.value === null ? 4.12 : dnlRating.value - 0.115))

const displayName = computed(() => me.value?.display_name ?? 'Your account')
const location = computed(() =>
  [me.value?.city, me.value?.province].filter(Boolean).join(', ') || 'No location set'
)
const initials = computed(() =>
  displayName.value
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
)
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-8">
    <div class="mx-auto max-w-3xl space-y-8">
      <header>
        <div class="flex items-start justify-between gap-4">
          <p class="text-caption font-semibold uppercase tracking-widest text-fg-muted">
            Dev preview
          </p>
          <!-- The page sets `layout: false`, so it does not inherit the app
               chrome's toggle - and checking the mark in dark mode is half the
               reason this page exists. -->
          <UiThemeToggle />
        </div>
        <h1 class="mt-1 font-display text-heading-1 text-fg">DUPR mark on your account</h1>
        <p class="mt-2 max-w-prose text-body-2 text-fg-secondary">
          Your real name, location and DinkAndLadder rating, with a
          <strong>sample</strong> DUPR figure. Switch accounts and this follows.
        </p>
        <p
          class="mt-3 rounded-button bg-warning-soft px-3 py-2 text-caption font-medium text-warning"
        >
          Every DUPR number here is invented for this preview. No DUPR account is linked, nothing is
          stored, and the integration does not exist yet.
        </p>
      </header>

      <!-- Thumbnail: one rating slot, DUPR filling it -->
      <section class="space-y-3">
        <h2 class="font-display text-heading-3 text-fg">On a card</h2>

        <div class="flex items-center gap-3.5 rounded-card bg-surface p-3.5 shadow-card">
          <span
            class="grid h-11 w-11 shrink-0 place-items-center rounded-pill bg-surface-2 font-display font-semibold text-fg-secondary"
            aria-hidden="true"
          >
            {{ initials }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-fg">{{ displayName }}</span>
            <span class="block text-body-2 text-fg-muted">{{ location }}</span>
          </span>
          <span class="flex shrink-0 flex-col items-end gap-1">
            <span class="font-display text-heading-2 tabular-nums text-fg">
              {{ formatRating(sampleDupr) }}
            </span>
            <UiDuprBadge size="sm" />
          </span>
        </div>

        <div class="flex items-center gap-3.5 rounded-card bg-surface p-3.5 shadow-card">
          <span
            class="grid h-11 w-11 shrink-0 place-items-center rounded-pill bg-surface-2 font-display font-semibold text-fg-secondary"
            aria-hidden="true"
          >
            {{ initials }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-fg">{{ displayName }}</span>
            <span class="block text-body-2 text-fg-muted">Sync went stale</span>
          </span>
          <span class="flex shrink-0 flex-col items-end gap-1">
            <span class="font-display text-heading-2 tabular-nums text-fg-secondary">
              {{ formatRating(sampleDupr) }}
            </span>
            <UiDuprBadge size="sm" :stale-days="31" />
          </span>
        </div>
      </section>

      <!-- Profile: both numbers, in full -->
      <section class="space-y-3">
        <h2 class="font-display text-heading-3 text-fg">On your profile</h2>
        <div class="rounded-card bg-surface p-6 shadow-card">
          <p class="text-caption font-semibold uppercase tracking-widest text-fg-muted">
            Rating · doubles
          </p>
          <div class="mt-1 flex flex-wrap items-baseline gap-3">
            <span class="font-display text-stat-md tabular-nums text-fg">
              {{ formatRating(sampleDupr) }}
            </span>
            <UiDuprBadge size="md" />
          </div>
          <p class="mt-1 text-caption text-fg-muted">Synced from DUPR 2 hours ago (sample)</p>

          <div
            class="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4 text-body-2"
          >
            <span class="text-fg-muted">DinkAndLadder rating</span>
            <span class="font-semibold tabular-nums text-fg">
              {{ dnlRating === null ? 'Not rated yet' : formatRating(dnlRating) }}
            </span>
          </div>
          <p class="mt-2 text-caption text-fg-muted">
            Your real rating, still computed from verified matches. It returns as the displayed
            number if the DUPR link is removed.
          </p>
        </div>
      </section>

      <!-- The mark alone, both themes, at both sizes -->
      <section class="space-y-3">
        <h2 class="font-display text-heading-3 text-fg">The mark</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-card border border-border bg-surface p-4">
            <p class="mb-3 text-caption text-fg-muted">On surface — 14px and 18px</p>
            <div class="flex flex-col items-start gap-3">
              <UiDuprBadge size="sm" />
              <UiDuprBadge size="md" />
              <UiDuprBadge size="md" :stale-days="31" />
            </div>
          </div>
          <div class="rounded-card border border-border bg-canvas p-4">
            <p class="mb-3 text-caption text-fg-muted">On canvas — mark only</p>
            <div class="flex flex-col items-start gap-3">
              <UiDuprBadge size="sm" mark-only />
              <UiDuprBadge size="md" mark-only />
            </div>
            <p class="mt-3 text-caption text-fg-muted">
              Toggle the theme: in dark mode the mark takes a light plate, because the supplied navy
              measures 1.53:1 on our dark surface. It is never recoloured.
            </p>
          </div>
        </div>
      </section>

      <p class="text-caption text-fg-muted">
        Compare against the club mark — <VerifiedBadge size="sm" /> — which is
        <em>DinkAndLadder</em> confirming a club. The two verifications deliberately share no visual
        language.
      </p>
    </div>
  </div>
</template>
