<script setup lang="ts">
/**
 * Top-three podium for the Rankings screen.
 *
 * Follows the second reference the user supplied: the three blocks are **joined
 * into one stepped platform** rather than three separate cards, each face
 * carries a large rank numeral, and the player's number sits in a pill *above*
 * the block instead of printed on it.
 *
 * That last move is what makes the rest work — with no text on the face, the
 * block is free to be a saturated brand colour and read as an object on the
 * page rather than a panel of it.
 *
 * Depth comes from three cues, none needing an image: a trapezoid top face
 * (perspective), edge falloff across the front (a lit solid), and a seam where
 * the two faces meet. See the `.dnl-plinth-*` rules in tokens.css.
 *
 * What is deliberately not borrowed from either reference is their data: prize
 * money, points and countdowns do not exist here. The pill shows the rating,
 * which is what this ladder actually ranks on.
 */
import { formatRating, tierForRating } from '~/utils/rating-tiers'

export interface PodiumEntry {
  id: string
  name: string
  rating: number | null
  location?: string | null
  avatarUrl?: string | null
  matchesPlayed?: number | null
  trendDelta?: number | null
}

const props = withDefaults(
  defineProps<{
    /** In rank order: [first, second, third]. Short arrays render fewer places. */
    entries: PodiumEntry[]
    /** Highlights the reader's own entry if they are on the podium. */
    highlightId?: string | null
  }>(),
  { highlightId: null }
)

const emit = defineEmits<{ select: [PodiumEntry] }>()

/**
 * Visual order is silver, gold, bronze — not rank order. The blocks touch, so
 * their differing heights form a single silhouette; `items-end` aligns their
 * feet. Only the outer corners round, which is what makes three blocks look
 * like one platform.
 */
const PLACES = [
  {
    rank: 2,
    order: 'order-1',
    avatar: 'md' as const,
    block: 'h-24 sm:h-28',
    medal: 'bg-rating-silver',
    ring: 'ring-rating-silver',
    round: 'rounded-tl-card'
  },
  {
    rank: 1,
    order: 'order-2',
    avatar: 'lg' as const,
    block: 'h-36 sm:h-44',
    medal: 'bg-rating-gold',
    ring: 'ring-rating-gold',
    round: ''
  },
  {
    rank: 3,
    order: 'order-3',
    avatar: 'md' as const,
    block: 'h-16 sm:h-20',
    medal: 'bg-rating-bronze',
    ring: 'ring-rating-bronze',
    round: 'rounded-tr-card'
  }
] as const

const entryFor = (rank: number) => props.entries[rank - 1] ?? null
const tierFor = (entry: PodiumEntry) => (entry.rating === null ? null : tierForRating(entry.rating))
</script>

<template>
  <div class="mx-auto flex max-w-md items-end justify-center">
    <div
      v-for="place in PLACES"
      :key="place.rank"
      class="flex w-1/3 flex-col items-center"
      :class="place.order"
    >
      <template v-if="entryFor(place.rank)">
        <!-- Head: name, avatar, rating pill — all above the block. -->
        <button
          type="button"
          class="group flex w-full flex-col items-center gap-1.5 px-1 pb-2 text-center transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          @click="emit('select', entryFor(place.rank)!)"
        >
          <span
            class="line-clamp-2 w-full text-caption font-semibold leading-tight text-fg sm:text-body-2"
          >
            {{ entryFor(place.rank)!.name }}
          </span>

          <span class="relative">
            <UiAvatar
              :name="entryFor(place.rank)!.name"
              :src="entryFor(place.rank)!.avatarUrl"
              :size="place.avatar"
              shape="square"
              class="ring-2 ring-offset-2 ring-offset-canvas"
              :class="place.ring"
            />
            <!-- Medal on the avatar, the way the reference crowns its winner. -->
            <span
              class="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-md text-on-accent shadow-card"
              :class="place.medal"
            >
              <UiIcon name="trophy" size="h-3 w-3" :stroke-width="2.5" />
            </span>
          </span>

          <!-- The number lives here, not on the block face. -->
          <span
            class="rounded-pill border border-border bg-surface px-2.5 py-0.5 text-caption font-bold tabular-nums text-fg shadow-card"
            :title="tierFor(entryFor(place.rank)!)?.name ?? 'Unrated'"
          >
            {{ formatRating(entryFor(place.rank)!.rating) }}
          </span>

          <span
            v-if="highlightId && entryFor(place.rank)!.id === highlightId"
            class="rounded-pill bg-primary-soft px-2 py-0.5 text-caption font-medium text-primary"
            >You</span
          >
        </button>

        <!-- The block -->
        <div class="w-full">
          <div class="dnl-plinth-top h-3 w-full sm:h-4" :class="place.round" />
          <div
            class="dnl-plinth-face relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-b from-plinth to-plinth-deep shadow-raised"
            :class="place.block"
          >
            <!-- Decorative: the rank is already carried by position, the medal
                 and the table, so this is styling rather than information. -->
            <span
              class="font-display text-4xl font-bold leading-none text-plinth-numeral/90 sm:text-5xl"
              aria-hidden="true"
              >{{ place.rank }}</span
            >
          </div>
        </div>
      </template>

      <!-- Fewer than three rated players is normal for a young ladder, so an
           empty place is a real state rather than an error. -->
      <template v-else>
        <div class="flex w-full flex-col items-center gap-1.5 px-1 pb-2 opacity-40">
          <span class="text-caption text-fg-muted">Unclaimed</span>
          <span
            class="flex items-center justify-center rounded-2xl border-2 border-dashed border-border-strong"
            :class="place.rank === 1 ? 'h-16 w-16' : 'h-10 w-10'"
          >
            <UiIcon name="user" size="h-5 w-5" class="text-fg-muted" />
          </span>
        </div>
        <div class="w-full opacity-40">
          <div class="dnl-plinth-top h-3 w-full sm:h-4" :class="place.round" />
          <div
            class="dnl-plinth-face w-full bg-gradient-to-b from-plinth/40 to-plinth-deep/40"
            :class="place.block"
          />
        </div>
      </template>
    </div>
  </div>
</template>
