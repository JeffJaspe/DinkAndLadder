<script setup lang="ts">
/**
 * Generated cover art for events and clubs.
 *
 * The mockups show photographic covers on the Club Page and image-led Event
 * cards. There is no data behind them: no `cover_image_url`, `logo_url` or any
 * image column exists on events, clubs, or anywhere in the schema. Real covers
 * need a Liquibase changeset plus Supabase Storage and an upload flow — a
 * feature, not a styling pass — so that is tracked separately in docs/33.
 *
 * Rather than ship fake photos or a flat grey box, this derives a stable
 * gradient and monogram from the entity's name. Every event looks distinct and
 * recognisable, the same event always looks the same, and nothing is invented
 * about the entity itself. When a real image column lands, pass `src` and this
 * becomes the fallback for entities that have not uploaded one.
 */

const props = withDefaults(
  defineProps<{
    /** Drives the gradient and monogram. */
    name: string
    /** Real image once one exists; falls back to generated art if it fails. */
    src?: string | null
    /** `banner` for page headers, `card` for list thumbnails. */
    variant?: 'banner' | 'card'
    /** Shown over the art, e.g. a status pill. */
    rounded?: string
  }>(),
  { src: null, variant: 'card', rounded: 'rounded-card' }
)

/**
 * Token-based pairs only, so covers still flip with the theme. Six pairs is
 * enough that adjacent cards in a list rarely collide, without the palette
 * turning into confetti.
 */
const GRADIENTS = [
  'from-primary/70 to-primary-hover/40',
  'from-accent/70 to-primary/30',
  'from-rating-gold/60 to-warning-fill/30',
  'from-info/60 to-accent/30',
  'from-rating-bronze/60 to-rating-gold/30',
  'from-primary/50 to-info/40'
]

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0
  return h
}

const gradient = computed(() => GRADIENTS[hash(props.name) % GRADIENTS.length])

const monogram = computed(() => {
  const words = props.name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
})

const failed = ref(false)
const showImage = computed(() => Boolean(props.src) && !failed.value)

const HEIGHT = { banner: 'h-40 sm:h-56', card: 'h-28' } as const
</script>

<template>
  <div
    class="relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br"
    :class="[HEIGHT[variant], rounded, showImage ? '' : gradient]"
  >
    <img
      v-if="showImage"
      :src="src!"
      :alt="name"
      class="h-full w-full object-cover"
      loading="lazy"
      @error="failed = true"
    />
    <!-- Decorative: the name is always rendered as real text beside this. -->
    <span
      v-else
      class="font-display font-bold text-on-accent/70"
      :class="variant === 'banner' ? 'text-5xl' : 'text-2xl'"
      aria-hidden="true"
      >{{ monogram }}</span
    >

    <slot />
  </div>
</template>
