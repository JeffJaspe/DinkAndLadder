<script setup lang="ts">
/**
 * The shell behind /login and /register.
 *
 * Both pages were a `max-w-md` column centred in the viewport, which on a
 * laptop or desktop is a small box adrift in a very large field of near-white
 * canvas — the single biggest reason the light theme read as pale and empty.
 *
 * At `lg` and above the screen splits: a brand field on the left and the form
 * on the right. Below `lg` the field is dropped rather than shrunk — a
 * decorative panel above a form is something a phone user scrolls past to reach
 * the thing they came for, and it would push the form below the fold.
 */
withDefaults(
  defineProps<{
    /** Heading above the form. */
    title: string
    /** One line under the heading. */
    subtitle?: string
  }>(),
  { subtitle: undefined }
)

const { appName } = useBranding()

/**
 * The three audiences, rotating.
 *
 * Every line is a capability that ships today: the assessment and the
 * organiser-recorded result in the rating and match domains, sessions/brackets/courts/members in the
 * club and event domains, and `coaching` as an event type that carries a named
 * coach and a fee but no draw and no rating effect (see
 * `server/domains/event/dto/event.dto.ts`). Nothing here claims traction,
 * pricing, or a feature that does not exist — this is a pre-launch product.
 *
 * The audience name lives on the control rather than as a label above the
 * heading, so each slide leads with what it offers instead of with a category
 * word.
 */
const slides = [
  {
    id: 'players',
    tab: 'Players',
    title: 'Your rating comes from real matches.',
    points: [
      'A short assessment gives you a starting number.',
      'Every result is recorded by the organiser who ran the game — never self-reported.',
      'One ladder, singles and doubles.'
    ]
  },
  {
    id: 'clubs',
    tab: 'Clubs',
    title: 'Run your play, not a group chat.',
    points: [
      'Schedule open play and let members reserve a slot.',
      'Draw the bracket, assign courts, run the scoresheets.',
      'Approve members, invite players, post announcements.'
    ]
  },
  {
    id: 'coaches',
    tab: 'Coaches',
    title: 'A lesson is its own kind of session.',
    points: [
      'Set a time, a venue and a fee, with a named coach.',
      'No bracket and no draw.',
      "Nobody's rating moves."
    ]
  }
] as const

const active = ref(0)
const paused = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const ROTATE_MS = 7000

function show(index: number) {
  active.value = index
}

function start() {
  if (timer) return
  timer = setInterval(() => {
    active.value = (active.value + 1) % slides.length
  }, ROTATE_MS)
}

function stop() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

/**
 * Rotation is an enhancement, never the only way to read the panel: all three
 * slides are in the DOM and the tabs switch them, so with no JS, under
 * `prefers-reduced-motion`, or on a failed hydration the panel still shows a
 * complete slide and stays operable.
 *
 * It also stops on hover and on keyboard focus — text that moves while someone
 * is reading it is the whole complaint against carousels.
 */
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  start()
})

onBeforeUnmount(stop)

watch(paused, (isPaused) => {
  if (isPaused) stop()
  else if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) start()
})
</script>

<template>
  <div class="min-h-screen bg-canvas lg:grid lg:grid-cols-[1.1fr_1fr] xl:grid-cols-[1.25fr_1fr]">
    <!-- Brand field. `lg` and up only.

         It was a solid `primary` field, which filled half the screen with
         saturated green and read as too much of it. `surface-3` is the same
         brand hue at wash strength — the tint the system already uses behind an
         active nav item — so the panel keeps its mass and its identity while
         the green stops shouting. Ordinary `fg` ink, so it follows the theme.

         Dark mode takes `surface-2` instead: the dark `surface-3` (#3A5750) is
         light enough that `fg-secondary` measured 4.05:1 and `fg-muted` 3.57:1
         on it, both under AA, while `surface-2` reads 5.28 and 4.65 and still
         separates from the canvas at 1.90:1. The Two-Route Rule again — the two
         themes reach the same result from opposite ends. -->
    <aside
      class="relative hidden border-r border-border bg-surface-3 dark:bg-surface-2 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16"
      @mouseenter="paused = true"
      @mouseleave="paused = false"
      @focusin="paused = true"
      @focusout="paused = false"
    >
      <NuxtLink to="/" class="inline-flex w-fit items-center gap-3">
        <UiBrandMark size="lg" :show-name="false" />
        <span class="font-display text-heading-3 text-fg">{{ appName }}</span>
      </NuxtLink>

      <section aria-label="What this platform does">
        <!-- Every slide occupies the same grid cell, so the panel is as tall as
             its tallest slide and nothing shifts as they rotate. -->
        <div class="grid">
          <div
            v-for="(slide, i) in slides"
            :key="slide.id"
            class="col-start-1 row-start-1 transition-opacity duration-500 motion-safe:transition-[opacity,transform]"
            :class="
              i === active
                ? 'opacity-100 motion-safe:translate-y-0'
                : 'pointer-events-none opacity-0 motion-safe:translate-y-2'
            "
            :aria-hidden="i !== active"
          >
            <p
              class="max-w-[15ch] font-display text-4xl font-medium leading-[1.1] tracking-tight text-fg xl:text-5xl"
            >
              {{ slide.title }}
            </p>
            <ul class="mt-8 max-w-[42ch] space-y-4">
              <li
                v-for="point in slide.points"
                :key="point"
                class="border-t border-border-strong pt-4 text-body-1 text-fg-secondary"
              >
                {{ point }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Named controls rather than dots: the audience word is the useful
             label, and it tells a reader the panel has three things to say. -->
        <div class="mt-10 flex gap-2">
          <button
            v-for="(slide, i) in slides"
            :key="slide.id"
            type="button"
            class="rounded-button px-3 py-1.5 text-body-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-3"
            :class="
              i === active
                ? 'bg-fg/10 text-fg'
                : 'text-fg-muted hover:bg-fg/5 hover:text-fg-secondary'
            "
            :aria-current="i === active ? 'true' : undefined"
            @click="show(i)"
          >
            {{ slide.tab }}
          </button>
        </div>
      </section>

      <p class="text-body-2 text-fg-muted">Philippine pickleball, on one record.</p>
    </aside>

    <!-- Form side. Wider and larger than the old max-w-md column, and it grows
         with the viewport instead of staying a fixed card. -->
    <main class="flex min-h-screen items-center justify-center px-4 py-12 sm:px-8 lg:min-h-0">
      <div class="w-full max-w-md xl:max-w-lg">
        <!-- Way out. Both of these are chromeless pages with no header and no
             nav, so without this the only route back to the marketing site is
             the browser's Back button — and someone who arrived on /register
             from a shared link has no Back to press.

             It names a destination rather than a history step for that reason:
             "Home" is true however the visitor got here.

             The mark rides beside it only below `lg`, where the brand field is
             not on screen, so the logo is never shown twice. -->
        <div class="flex items-center justify-between gap-4">
          <NuxtLink to="/" class="inline-flex items-center gap-2 lg:hidden" aria-label="Home">
            <UiBrandMark size="xl" :show-name="false" />
          </NuxtLink>

          <NuxtLink
            to="/"
            class="inline-flex items-center gap-1.5 rounded-button py-1 text-body-2 font-medium text-fg-secondary transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <UiIcon name="arrow-left" size="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            Back to home
          </NuxtLink>
        </div>

        <h1 class="mt-6 font-display text-heading-1 text-fg xl:text-4xl">{{ title }}</h1>
        <p v-if="subtitle" class="mt-2 text-body-1 text-fg-secondary">{{ subtitle }}</p>

        <div class="mt-8">
          <slot />
        </div>

        <!-- Footer links -->
        <footer class="mt-8 border-t border-border pt-6 text-center">
          <nav aria-label="Policies" class="flex justify-center gap-4 text-caption text-fg-muted">
            <NuxtLink
              to="/legal/privacy"
              class="rounded-button underline-offset-2 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >Privacy</NuxtLink
            >
            <NuxtLink
              to="/legal/terms"
              class="rounded-button underline-offset-2 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >Terms</NuxtLink
            >
          </nav>
        </footer>
      </div>
    </main>
  </div>
</template>
