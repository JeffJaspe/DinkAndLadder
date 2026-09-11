<script setup lang="ts">
import type { HeroDto } from '~/server/domains/platform/dto/branding.dto'
import { focalPositionOf } from '~/server/domains/platform/dto/branding.dto'

/**
 * A miniature of the signed-out landing hero, painted from the operator's
 * *unsaved* form values so they can see what a slider does before it is live.
 *
 * It reproduces the landing page's composition rather than embedding the page:
 * the same two flat canvas washes (the whole band at the operator's strength,
 * a fixed 0.92 plate under the words), the same artwork reveal - beside the
 * claim on a wide screen, a strip above it on a phone - and the same focal
 * point driving the crop. Type is scaled to the frame, so it shows where the
 * words fall and whether the crop keeps the subject, not exact line breaks.
 *
 * Each frame carries its own theme class, so light and dark can be judged
 * side by side without leaving the console's own theme.
 */
const props = defineProps<{
  hero: HeroDto
  /** Which theme the frames paint in. Independent of the console's theme. */
  theme: 'light' | 'dark'
}>()

const BUILT_IN_TITLE = 'Run your open play and tournaments on one record.'
const BUILT_IN_SUBTITLE =
  'Sessions, entries, brackets, courts and results in one place instead of a group chat — and every result feeds a rating your players cannot argue with.'

const title = computed(() => props.hero.title?.trim() || BUILT_IN_TITLE)
const subtitle = computed(() => props.hero.subtitle?.trim() || BUILT_IN_SUBTITLE)

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgb(${r} ${g} ${b} / ${clamp01(alpha)})`
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

/** Mirrors `heroBackground` on pages/index.vue, minus the page-only bits. */
const artStyle = computed(() => {
  if (!props.hero.background_url) return null
  const overlay = withAlpha(props.hero.overlay_color, Number(props.hero.overlay_opacity))
  return {
    backgroundImage: `linear-gradient(${overlay}, ${overlay}), url("${props.hero.background_url}")`,
    backgroundSize: 'cover',
    backgroundPosition: focalPositionOf({
      focal_x: Number(props.hero.focal_x),
      focal_y: Number(props.hero.focal_y)
    }),
    '--dnl-hero-wash': String(1 - clamp01(Number(props.hero.background_opacity)))
  }
})
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
    <!-- Wide screen -->
    <figure class="min-w-0">
      <figcaption class="mb-1.5 text-caption text-fg-secondary">Wide screen</figcaption>
      <div
        class="dnl-preview dnl-preview--wide overflow-hidden rounded-card border border-border"
        :class="theme === 'dark' ? 'dark' : ''"
        :style="artStyle ?? undefined"
      >
        <div v-if="artStyle" class="dnl-preview-scrim" aria-hidden="true" />
        <div v-if="artStyle" class="dnl-preview-plate" aria-hidden="true" />
        <div class="relative z-10 flex h-full flex-col">
          <div class="dnl-preview-claim flex-1 px-[6%] pt-[7%]">
            <p class="dnl-preview-title font-display font-medium tracking-tight text-fg">
              {{ title }}
            </p>
            <p class="dnl-preview-sub mt-[2%] text-fg-secondary">{{ subtitle }}</p>
          </div>
          <div class="border-t border-fg-muted">
            <div class="dnl-preview-claim flex items-center gap-[1.5%] px-[6%] py-[2.5%]">
              <span class="dnl-preview-btn rounded-[3px] bg-primary px-[3%] py-[1.2%] font-semibold text-on-primary"
                >Create your club</span
              >
              <span
                class="dnl-preview-btn rounded-[3px] border border-fg-muted bg-canvas px-[3%] py-[1.2%] font-semibold text-fg"
                >Find play near you</span
              >
            </div>
          </div>
        </div>
      </div>
    </figure>

    <!-- Phone -->
    <figure class="sm:w-[9.5rem]">
      <figcaption class="mb-1.5 text-caption text-fg-secondary">Phone</figcaption>
      <div
        class="dnl-preview dnl-preview--phone overflow-hidden rounded-card border border-border"
        :class="theme === 'dark' ? 'dark' : ''"
        :style="artStyle ?? undefined"
      >
        <div v-if="artStyle" class="dnl-preview-scrim" aria-hidden="true" />
        <div v-if="artStyle" class="dnl-preview-plate" aria-hidden="true" />
        <div class="relative z-10 flex h-full flex-col">
          <div class="flex-1 px-[7%]" :class="artStyle ? 'pt-[52%]' : 'pt-[10%]'">
            <p class="dnl-preview-title font-display font-medium tracking-tight text-fg">
              {{ title }}
            </p>
            <p class="dnl-preview-sub mt-[4%] text-fg-secondary">{{ subtitle }}</p>
          </div>
          <div class="border-t border-fg-muted px-[7%] py-[5%]">
            <span
              class="dnl-preview-btn block rounded-[3px] bg-primary py-[3%] text-center font-semibold text-on-primary"
              >Create your club</span
            >
            <span
              class="dnl-preview-btn mt-[3%] block rounded-[3px] border border-fg-muted bg-canvas py-[3%] text-center font-semibold text-fg"
              >Find play near you</span
            >
          </div>
        </div>
      </div>
    </figure>
  </div>
</template>

<style scoped>
/*
 * The same layering as pages/index.vue, at frame scale. The numbers that
 * matter for fidelity - the 0.92 plate, the 38% reveal, the 44vw strip - are
 * the page's own; only the type ramp is reduced to fit a thumbnail.
 */
.dnl-preview {
  position: relative;
  isolation: isolate;
  background-color: rgb(var(--dnl-canvas));
  color: rgb(var(--dnl-fg));
  --dnl-hero-art: 0.38;
}

.dnl-preview--wide {
  aspect-ratio: 1440 / 560;
}

.dnl-preview--phone {
  aspect-ratio: 400 / 640;
}

.dnl-preview-scrim {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-color: rgb(var(--dnl-canvas) / var(--dnl-hero-wash, 0.92));
}

.dnl-preview-plate {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-color: rgb(var(--dnl-canvas) / 0.92);
}

.dnl-preview--wide .dnl-preview-plate {
  right: calc(100% * var(--dnl-hero-art));
}

.dnl-preview--wide .dnl-preview-claim {
  max-width: calc(100% * (1 - var(--dnl-hero-art)));
}

.dnl-preview--phone .dnl-preview-plate {
  /* The page's 44vw strip. `top` is a share of height, so 44% of the width
     of a 400 × 640 frame is 27.5% of its height. */
  top: 27.5%;
}

/* Type at frame scale. `cqw` would be ideal; these are set against the
   frame's own width via container queries where supported and fall back to
   sizes that read at the card widths the console actually renders. */
.dnl-preview--wide {
  container-type: inline-size;
}
.dnl-preview--phone {
  container-type: inline-size;
}

.dnl-preview-title {
  font-size: 0.95rem;
  line-height: 1.1;
}
.dnl-preview-sub {
  font-size: 0.55rem;
  line-height: 1.4;
}
.dnl-preview-btn {
  font-size: 0.5rem;
  line-height: 1.2;
  white-space: nowrap;
}

@container (min-width: 1px) {
  .dnl-preview--wide .dnl-preview-title {
    font-size: clamp(0.8rem, 4.2cqw, 2.5rem);
  }
  .dnl-preview--wide .dnl-preview-sub {
    font-size: clamp(0.5rem, 1.25cqw, 1rem);
  }
  .dnl-preview--wide .dnl-preview-btn {
    font-size: clamp(0.45rem, 1.1cqw, 0.9rem);
  }
  .dnl-preview--phone .dnl-preview-title {
    font-size: clamp(0.7rem, 9cqw, 1.5rem);
  }
  .dnl-preview--phone .dnl-preview-sub {
    font-size: clamp(0.45rem, 4cqw, 0.8rem);
  }
  .dnl-preview--phone .dnl-preview-btn {
    font-size: clamp(0.45rem, 4cqw, 0.8rem);
  }
}
</style>
