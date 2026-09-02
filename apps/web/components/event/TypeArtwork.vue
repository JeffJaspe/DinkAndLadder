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
 * fold shadow — and the club row in the band from x 6% to 55%, y 55% to 80%,
 * which is the part of every background deliberately kept flat and light.
 *
 * That band is light in *both* themes, because it is a fixed illustration
 * rather than a themed surface. So the text on it uses `on-art`, a token that
 * deliberately does not flip with the theme (like `on-scrim`); using `fg` here
 * would put near-white text on a pale card in dark mode.
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

    <!-- The clear band. Laid out from the left so a long club name wraps into
         the empty middle of the card rather than over the illustration. -->
    <div class="absolute bottom-[20%] left-[6%] right-[45%] top-[55%]">
      <slot />
    </div>
  </div>
</template>
