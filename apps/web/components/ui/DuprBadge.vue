<script setup lang="ts">
/**
 * DUPR attribution — the mark that says a rating came from DUPR.
 *
 * Deliberately NOT `VerifiedBadge`. That one is a green shield reading
 * "Verified" and means "this club is verified by DinkAndLadder". Court green in
 * this system means *we* confirmed it; a DUPR rating is confirmed by somebody
 * else, so it carries DUPR's own mark instead and the two verifications never
 * share a visual language.
 *
 * THE MARK RENDERS AS SUPPLIED. No filter, no tint, no opacity, no colour
 * change — not for a stale rating, not for a disabled row, not for dark mode.
 * It is a third-party trademark and recolouring one is normally a breach of the
 * brand terms that come with the API agreement. State is carried by the text
 * and the indicator beside it, never by the logo.
 *
 * Dark mode is the one real problem with the supplied file. It is a single
 * navy (`#0f4299`), which measures 8.79:1 on the light canvas and **1.53:1 on
 * the dark surface** — invisible. Rather than recolour it, the mark sits on its
 * own light plate in dark mode, which is the standard reversed-ground treatment
 * every brand kit sanctions. If DUPR ships a reversed/white variant, drop it in
 * as `dupr-reversed.svg` and swap the plate for it — see `plateNeeded` below.
 */

const props = withDefaults(
  defineProps<{
    /**
     * How old the synced rating is, in days. Null when it is fresh or unknown.
     * A synced number that stopped syncing is the state most likely to
     * mislead, so it says its own age rather than presenting itself as current.
     */
    staleDays?: number | null
    /** `sm` for a card or ranking row, `md` for a profile. */
    size?: 'sm' | 'md'
    /** Hides the word beside the mark where the context already says it. */
    markOnly?: boolean
  }>(),
  { staleDays: null, size: 'sm', markOnly: false }
)

const isStale = computed(() => props.staleDays !== null && props.staleDays > 0)

/**
 * The wordmark is 576x234, so height is the only dimension worth setting and
 * width follows. 14px on a thumbnail is the floor at which four bold letters
 * stay legible; the profile gets 18px.
 *
 * If DUPR's brand guidelines set a minimum larger than this, the row shows the
 * word "DUPR" as text instead — shrinking a mark below its stated minimum
 * breaches the guidelines rather than merely looking small.
 */
const markHeight = computed(() => (props.size === 'md' ? 18 : 14))

const label = computed(() =>
  isStale.value
    ? `DUPR rating, last synced ${props.staleDays} days ago`
    : 'DUPR verified rating'
)
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5"
    :class="size === 'md' ? 'text-body-2' : 'text-caption'"
    :aria-label="label"
    role="img"
  >
    <!-- The plate. Only in dark mode, and only because the supplied file is a
         dark navy that disappears on a near-black ground. `bg-mark-plate` is a
         fixed token that does not flip with the theme — see tokens.css. -->
    <span
      class="inline-flex items-center leading-none dark:rounded-badge dark:bg-mark-plate dark:px-1 dark:py-0.5"
    >
      <img
        src="/dupr.svg"
        alt=""
        aria-hidden="true"
        width="576"
        height="234"
        :style="{ height: `${markHeight}px`, width: 'auto' }"
        class="block"
      />
    </span>

    <template v-if="!markOnly">
      <!-- Staleness lives here, on the text, because it cannot live on the
           mark. -->
      <span v-if="isStale" class="inline-flex items-center gap-1 font-medium text-warning">
        <span class="h-1.5 w-1.5 shrink-0 rounded-pill bg-warning" aria-hidden="true" />
        <span class="tabular-nums">{{ staleDays }}d old</span>
      </span>
      <span v-else class="font-medium text-fg-muted">verified</span>
    </template>
  </span>
</template>
