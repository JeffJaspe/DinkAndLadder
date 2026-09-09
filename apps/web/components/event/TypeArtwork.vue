<script setup lang="ts">
/**
 * An event card's artwork panel: the supplied illustration for this kind of
 * event, its ribbon plate, and whatever the card lays in the clear band.
 *
 * The background and the plate are the files in `public/event-art/`, used as
 * images rather than redrawn in Vue — so re-cutting the design is a matter of
 * replacing a file. The label is the one thing that is *not* baked into the
 * artwork: it is real text over the plate, so it stays selectable, searchable
 * and translatable, and a long label cannot squash the drawing.
 *
 * The placements are the ones the artwork is drawn around (see the set's
 * README): the plate at left 4% / top 4.5% / width 68%, its text box inset to
 * 22%–16% of the plate and centred on its top 85% — the lower strip is the
 * fold shadow — and the club row in the band from x 6% to 55%, y 55% to 80%.
 *
 * That band was described here as "deliberately kept flat and light", and the
 * host club sat straight on it in the fixed `on-art` ink on that promise. The
 * promise does not hold. Sampling the band across the four shipped backgrounds:
 * the *average* is comfortable (9.9:1 to 12.8:1 against `on-art`), but each
 * drawing puts its own dark elements through the band, and at the darkest pixel
 * the club name measured 1.04:1 on open play, 1.98:1 on ranked night and 3.15:1
 * on coaching — with the "Host club" line, set in the lighter `on-art-muted`,
 * failing on all four. A club name that disappears behind a leaf is not a
 * legibility edge case; it is the one thing the card exists to answer.
 *
 * So nothing on this panel reads directly off the drawing any more. The status
 * chips already solved it — a flat `surface` plate closed by a hairline ring —
 * and the club row now uses the same device, which is why they read as one
 * family rather than two. On a themed surface the ink is the theme's own `fg`
 * and `fg-muted` at the contrast they carry everywhere else, in both themes,
 * whatever the illustration does underneath.
 *
 * `on-art` / `on-scrim` remain correct for the ribbon label, which is drawn
 * over its own supplied plate rather than over open artwork.
 */
import { eventKindLabel, eventTypeStyle } from '~/utils/event-type'
import type { EventType } from '~/server/domains/event/dto/event.dto'

const props = defineProps<{ eventType: EventType | string }>()

const style = computed(() => eventTypeStyle(props.eventType))
const label = computed(() => eventKindLabel(props.eventType))
</script>

<template>
  <div
    class="relative aspect-[1200/780] w-full bg-cover bg-center"
    :style="{ backgroundImage: `url('${style.background}')` }"
  >
    <div class="absolute left-[4%] top-[4.5%] w-[68%]">
      <!-- Decorative: the plate carries no information the label beside it does
           not, so it is not described to a screen reader. -->
      <img :src="style.ribbon" alt="" class="block w-full" aria-hidden="true" />
      <span
        class="absolute bottom-[15%] left-[22%] right-[16%] top-0 flex items-center text-[clamp(0.7rem,2.1vw,1.1rem)] font-extrabold uppercase leading-none tracking-wide text-on-scrim [text-shadow:0_2px_4px_rgb(0_0_0/0.25)]"
      >
        {{ label }}
      </span>
    </div>

    <!-- Status, in the corner every background leaves to halftone texture. -->
    <div class="absolute right-[4%] top-[5%] flex flex-col items-end gap-1">
      <slot name="status" />
    </div>

    <!-- The club band. Laid out from the left so a long club name truncates
         into the empty middle of the card rather than over the illustration,
         and bottom-aligned so the plate hugs its own content instead of
         stretching up into the drawing. -->
    <div class="absolute bottom-[10%] left-[6%] right-[42%] top-[50%] flex items-end">
      <slot />
    </div>
  </div>
</template>
