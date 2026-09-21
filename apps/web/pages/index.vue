<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import { focalPositionOf, rgbTripletOf } from '~/server/domains/platform/dto/branding.dto'

// This page ships its own fixed marketing header. Under the default layout a
// signed-in visitor got that header *and* the app sidebar - two sets of chrome
// on one screen. middleware/guest-only.global.ts now redirects them away
// before render; the marketing layout is what a signed-out visitor sees.
definePageMeta({ layout: 'marketing' })

useHead({
  title: 'Run your open play and tournaments on one record',
  meta: [
    {
      name: 'description',
      content:
        'DinkAndLadder gives Philippine pickleball clubs one place to run open play, tournaments, brackets and members — and gives players a rating that only moves on results the club that ran the game recorded.'
    }
  ]
})

/**
 * Sponsors, controlled from the SuperAdmin console (042-sponsors).
 *
 * Lazy and non-blocking: the claim band is what the page is for, and a logo row
 * must never hold up first paint. An empty list hides the whole band, which is
 * also what a platform with no sponsors shows - so there is no empty state to
 * design.
 */
interface Sponsor {
  id: string
  label: string
  image_url: string | null
  link_url: string | null
}

const { data: sponsorsData } = useLazyFetch<{ data: Sponsor[] }>('/api/v1/platform/sponsors', {
  default: () => ({ data: [] as Sponsor[] })
})

const sponsors = computed(() => sponsorsData.value?.data ?? [])

/**
 * Landing claim, overridable by the SuperAdmin (docs/30 §2.3).
 *
 * Every field falls back to the copy this page shipped with, so an unbranded
 * platform looks exactly as it always has. A custom headline renders as one
 * plain block: splitting someone else's sentence to emphasise half of it
 * guesses at emphasis they did not ask for.
 */
const { appName, hero } = useBranding()

const heroBackground = computed(() => {
  if (!hero.value.background_url) return null
  // The 026 overlay (hero_overlay_color / opacity) is no longer applied: the
  // plate under the words is the legibility device now, and the console no
  // longer offers the overlay. Everything here is clamped again because it is
  // a value arriving from the network on a public page.
  return {
    backgroundImage: `url("${cssUrl(hero.value.background_url)}")`,
    backgroundSize: 'cover',
    // The operator's focal point, so the part of the image they care about
    // survives both the wide reveal and the phone strip.
    backgroundPosition: focalPositionOf(hero.value),
    // How much canvas .dnl-hero-scrim lays over the artwork. This was a
    // hardcoded 0.92, which left an uploaded background as a ghost with no way
    // to change it; it is now the inverse of the operator's own setting, so
    // "image opacity 100%" means no wash at all. Clamped again here because it
    // is a number arriving from the network on a public page.
    '--dnl-hero-wash': String(1 - clamp01(hero.value.background_opacity)),
    // The plate under the words: the operator's colour as an "r g b" triplet
    // so it slots into the same rgb(... / a) the theme canvas uses, or the
    // theme's own canvas when none is set.
    '--dnl-hero-plate': hero.value.plate_color
      ? rgbTripletOf(hero.value.plate_color)
      : 'var(--dnl-canvas)',
    '--dnl-hero-plate-alpha': String(clamp01(hero.value.plate_opacity)),
    // How far the plate's edge dissolves into the artwork.
    '--dnl-hero-fade': String(clamp01(hero.value.fade))
  }
})

/** Anything outside 0..1 would put an invalid alpha into the inline style. */
function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

/** Closes the url() a stray quote or paren could otherwise escape. */
function cssUrl(url: string): string {
  return url.replace(/["'()\\]/g, encodeURIComponent)
}

/**
 * Browse destinations.
 *
 * These were five tabs that swapped panels inside `/`, which meant the rankings
 * a visitor was looking at had no URL to send anyone, and the marketing page and
 * a browse tool competed for the same screen. They are real routes now, and this
 * strip is the index that points at them.
 */
const browse: ReadonlyArray<{ to: string; label: string; line: string }> = [
  { to: '/rankings', label: 'Rankings', line: 'The ladder, singles and doubles' },
  { to: '/events', label: 'Events', line: 'Open play and tournaments' },
  { to: '/clubs', label: 'Clubs', line: 'Who runs play, and where' },
  { to: '/players', label: 'Players', line: 'Every rated player' }
]

/** What a club actually runs here. Shipped capabilities only - see PRODUCT.md. */
const clubLedger: ReadonlyArray<{ label: string; line: string }> = [
  {
    label: 'Open play sessions',
    line: 'Schedule a session, set the skill range, and let members reserve a slot instead of replying in a thread.'
  },
  {
    label: 'Tournaments, brackets and courts',
    line: 'Draw the bracket, assign courts, and run scoresheets through the event rather than on paper at the desk.'
  },
  {
    label: 'Members, roles and invitations',
    line: 'Approve requests, invite players, and hand organiser duties to the people who actually run the sessions.'
  },
  {
    label: 'Announcements',
    line: 'Say it once to the club, on the same record the sessions and results already live on.'
  }
]

/** What a player builds here. */
const playerRecord: ReadonlyArray<{ label: string; line: string }> = [
  {
    label: 'A rating that follows you',
    line: 'One number across every club you play at, built from recorded matches, not estimates.'
  },
  {
    label: 'Rankings by area',
    line: 'See where you stand in your city, province, or barangay — not just nationally.'
  },
  {
    label: 'Tournament history',
    line: 'Every bracket you entered and every result — searchable, shareable, and always on your profile.'
  },
  {
    label: 'Badges and achievements',
    line: 'Milestones, streaks, and tournament placements you actually earned, displayed on your profile.'
  }
]

/** What makes a verified club. */
const verifiedBenefits: ReadonlyArray<{ label: string; line: string }> = [
  {
    label: 'Results that count',
    line: 'Matches at a verified club feed the national ranking. Unverified results stay local.'
  },
  {
    label: 'Online entry fees',
    line: 'Players pay when they register, not in cash at the desk. The club sees who paid before the event starts.'
  },
  {
    label: 'Priority placement',
    line: 'Verified events surface first in search and the feed, so players find them.'
  }
]

/**
 * The record loop. This is the mechanism, and it is drawn, not claimed.
 *
 * `record` is the same match travelling the three stops, so the band shows one
 * result changing state rather than three captions in a row. The numbers are
 * illustrative and labelled as such on the page - they are the shape of a
 * rating move, not a claim that this match happened.
 *
 * The middle stop used to be the opponent confirming a player's own
 * submission. Players no longer submit at all: the organiser running the
 * session enters the score, and that record is final. The stop that earns
 * Court Green is therefore the organiser's entry, not an opponent's nod.
 */
const loop: ReadonlyArray<{
  label: string
  line: string
  /** `null` on the stop that assembles its record from live state. */
  record: string | null
  /** Court Green marks the step where the record is made final, and nothing else on this page. */
  confirmed?: boolean
}> = [
  {
    label: 'Played',
    line: 'A game at a club’s open play, ladder night or tournament.',
    record: '11 — 7'
  },
  {
    label: 'Recorded',
    line: 'The organiser running it enters the score at the desk. Nobody reports their own.',
    record: 'Entered by the organiser',
    confirmed: true
  },
  {
    label: 'Rating moves',
    line: 'Only a recorded result moves a rating — and it leaves a trail.',
    // Assembled from `ratingTick` below so the figure can travel the gap the
    // sentence describes. `null` means "this stop builds its own record".
    record: null
  }
]

/**
 * The second beat of the page's one authored moment.
 *
 * The third stop says a rating moves, so the figure moves. It counts the same
 * 45 thousandths a recorded match is worth here, and it starts when the
 * connecting rule arrives at that stop rather than when the band enters view,
 * so the stroke and the number read as one event instead of two.
 *
 * Its resting value is the finished one, exactly like the rule's, and nothing
 * winds it back unless motion is allowed - so the record is correct with no JS
 * and under `prefers-reduced-motion`.
 */
const RATING_FROM = 4.102
const RATING_TO = 4.147
const ratingTick = ref(RATING_TO)

/**
 * Whether the move has happened yet. A rule wound back to nothing reads as a
 * rule not yet drawn; a number wound back to its own starting value reads as
 * wrong data - `4.102 → 4.102` is a match that did nothing. So while the record
 * is wound back it shows the rating before the match and nothing else, and the
 * arrow and the destination arrive with the movement they describe.
 *
 * `true` at rest, so the no-JS and reduced-motion record is the complete one.
 */
const ratingMoved = ref(true)
const ratingRecord = computed(() =>
  ratingMoved.value
    ? `${RATING_FROM.toFixed(3)} → ${ratingTick.value.toFixed(3)}`
    : RATING_FROM.toFixed(3)
)

const { data: eventsData } = await useFetch<{ events: EventDto[] }>('/api/v1/events')

const upcoming = computed(() =>
  (eventsData.value?.events ?? [])
    .filter((e) => e.status === 'published' && new Date(e.start_date) > new Date())
    .sort((a, b) => +new Date(a.start_date) - +new Date(b.start_date))
    .slice(0, 4)
)

/**
 * Schedule rows carry weekday, date and start time rather than the date alone.
 * Several sessions on one day at one venue is the normal case for a club, and
 * date-only rendered four consecutive rows as the same line - real data reading
 * as filler.
 */
function formatEventDay(start: string): string {
  return new Date(start).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

function formatEventTime(start: string): string {
  return new Date(start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Mobile nav panel. The header cannot fit the browse destinations plus Log in
 * and the primary action below `sm`, so they move into a sheet. Structure
 * follows the app drawer in `layouts/default.vue`: scrim, sheet, close button,
 * Escape, and focus returned to the control that opened it.
 */
const menuOpen = ref(false)
const menuButton = ref<HTMLButtonElement | null>(null)

/**
 * The header's own rule, doubling as the read position.
 *
 * The page is a ledger and its structure is horizontal rules, so the one piece
 * of persistent chrome that tells a visitor where they are is a rule too -
 * drawn in the page's structural ink rather than in Court Green, because a
 * scroll position is neither confirmed nor actionable and green is reserved for
 * things that are. It is 2px, it sits on a line that already exists, and it is
 * the only thing on the page that tracks the scroll.
 *
 * Written straight to a CSS custom property inside a rAF so a fast flick does
 * not queue a reactive render per scroll event.
 */
const progressRule = ref<HTMLElement | null>(null)
let progressFrame = 0

function onScroll() {
  if (progressFrame) return
  progressFrame = requestAnimationFrame(() => {
    progressFrame = 0
    const el = progressRule.value
    if (!el) return
    const travel = document.documentElement.scrollHeight - window.innerHeight
    const ratio = travel > 0 ? Math.min(1, Math.max(0, window.scrollY / travel)) : 0
    el.style.setProperty('--dnl-read', String(ratio))
  })
}

function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  nextTick(() => menuButton.value?.focus())
}

// The panel is teleported to <body>, so Escape has to be caught globally.
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu()
}

/**
 * The page's one authored motion moment: the verification loop's connecting
 * rule advances stop by stop as the band comes into view, so the mechanism
 * reads as a single stroke rather than as three separate items.
 *
 * The default state in CSS is the finished one. Only this handler winds the
 * rule back before releasing it, so the band is complete with no JS, on a
 * failed hydration, and under `prefers-reduced-motion` — the animation is
 * something the page opts into, never something it recovers from.
 */
const loopBand = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let revealObserver: IntersectionObserver | null = null
let failsafe: ReturnType<typeof setTimeout> | null = null
let tickFrame = 0

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const hasObserver = typeof IntersectionObserver !== 'undefined'

  // Scroll-reveal animations for content sections
  if (!prefersReducedMotion && hasObserver) {
    const revealSections = document.querySelectorAll<HTMLElement>('.dnl-reveal')
    revealSections.forEach((section) => {
      section.dataset.reveal = 'pending'
    })

    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            el.dataset.reveal = 'visible'
            revealObserver?.unobserve(el)
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    )

    revealSections.forEach((section) => revealObserver?.observe(section))
  }

  // The verification loop's rule animation
  const band = loopBand.value
  if (!band) return
  if (prefersReducedMotion) return
  if (!hasObserver) return

  band.dataset.animate = 'true'
  ratingTick.value = RATING_FROM
  ratingMoved.value = false

  const draw = () => {
    band.dataset.drawn = 'true'
    tickRating()
    observer?.disconnect()
    observer = null
    if (failsafe) {
      clearTimeout(failsafe)
      failsafe = null
    }
  }

  failsafe = setTimeout(draw, 2500)

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) draw()
    },
    { threshold: 0.2 }
  )
  observer.observe(band)
})

/**
 * Counts the rating across the gap, starting as the connecting rule lands on
 * the third stop (820ms stagger + 700ms travel). Tabular figures mean the
 * digits change without the record moving a pixel sideways.
 */
function tickRating() {
  if (ratingMoved.value) return

  const START = 1500
  const RUN = 900
  const begin = performance.now() + START

  const step = (now: number) => {
    const t = (now - begin) / RUN
    if (t <= 0) {
      tickFrame = requestAnimationFrame(step)
      return
    }
    ratingMoved.value = true
    if (t >= 1) {
      tickFrame = 0
      ratingTick.value = RATING_TO
      return
    }
    // The same exponential settle the rule uses, so the two beats share a hand.
    const eased = 1 - Math.pow(1 - t, 3)
    ratingTick.value = RATING_FROM + (RATING_TO - RATING_FROM) * eased
    tickFrame = requestAnimationFrame(step)
  }

  tickFrame = requestAnimationFrame(step)
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onScroll)
  observer?.disconnect()
  revealObserver?.disconnect()
  if (failsafe) clearTimeout(failsafe)
  if (progressFrame) cancelAnimationFrame(progressFrame)
  if (tickFrame) cancelAnimationFrame(tickFrame)
})
</script>

<template>
  <div class="dnl-landing min-h-screen bg-canvas">
    <header class="sticky top-0 z-50 border-b border-fg-muted bg-canvas">
      <!-- The header's rule, doubling as the read position. Structural ink, not
           Court Green: where you are is not a thing you confirmed. -->
      <div ref="progressRule" class="dnl-read-rule" aria-hidden="true" />
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <UiBrandMark size="lg" name-class="text-body-1 font-semibold" />
        <div class="flex items-center gap-2">
          <UiThemeToggle size="sm" />
          <NuxtLink
            to="/login"
            class="dnl-press hidden rounded-button px-3 py-2 text-body-2 font-medium text-fg-secondary transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-block"
            >Log in</NuxtLink
          >
          <NuxtLink
            to="/register"
            class="dnl-press hidden rounded-button bg-primary px-4 py-2 text-body-2 font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:inline-block"
            >Sign up</NuxtLink
          >
          <button
            ref="menuButton"
            type="button"
            class="dnl-press rounded-button p-2 text-fg-secondary transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:hidden"
            aria-label="Open menu"
            aria-haspopup="dialog"
            :aria-expanded="menuOpen"
            @click="menuOpen = true"
          >
            <UiIcon name="menu" :stroke-width="2" />
          </button>
        </div>
      </div>
    </header>

    <Teleport to="body">
      <!-- The sheet arrives from the edge it lives on. A panel that pops into
           existence is the single loudest "this is a document" tell on a phone;
           240ms of travel is what makes the same markup read as an app. Both
           halves are pure transform/opacity and both are neutralised under
           `prefers-reduced-motion` by the media query in this page's styles. -->
      <Transition name="dnl-sheet">
        <div v-if="menuOpen" class="dnl-sheet fixed inset-0 z-[60] sm:hidden">
          <div class="dnl-sheet-scrim absolute inset-0 bg-black/60" @click="closeMenu" />
          <aside
            class="dnl-sheet-panel absolute right-0 top-0 flex h-full w-72 max-w-[85%] flex-col border-l border-fg-muted bg-canvas"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div
              class="flex h-16 shrink-0 items-center justify-between border-b border-fg-muted px-4"
            >
              <span class="text-body-1 font-semibold text-fg">{{ appName }}</span>
              <button
                type="button"
                class="dnl-press rounded-button p-2 text-fg-secondary transition-colors hover:text-fg"
                aria-label="Close menu"
                @click="closeMenu"
              >
                <UiIcon name="x" :stroke-width="2" />
              </button>
            </div>

            <nav class="flex-1 overflow-y-auto">
              <NuxtLink
                v-for="item in browse"
                :key="item.to"
                :to="item.to"
                class="dnl-row dnl-press block border-b border-fg-muted px-4 py-3.5 text-body-2 font-medium text-fg-secondary transition-colors hover:text-fg"
                @click="closeMenu"
                >{{ item.label }}</NuxtLink
              >
            </nav>

            <div class="shrink-0 space-y-2 border-t border-fg-muted p-4">
              <NuxtLink
                to="/login"
                class="dnl-press block rounded-button px-4 py-2.5 text-center text-body-2 font-medium text-fg-secondary transition-colors hover:text-fg"
                @click="closeMenu"
                >Log in</NuxtLink
              >
              <NuxtLink
                to="/register"
                class="dnl-press block rounded-button bg-primary px-4 py-2.5 text-center text-body-2 font-semibold text-on-primary"
                @click="closeMenu"
                >Sign up</NuxtLink
              >
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>

    <main>
      <!-- CLAIM BAND. No hero box: the claim is set on the page itself and
           closed by the heaviest rule the page owns. -->
      <section
        class="relative isolate overflow-hidden"
        :class="heroBackground && 'dnl-hero--art'"
        :style="heroBackground ?? undefined"
      >
        <!-- The operator's artwork sits *under* the page's own ground rather
             than behind white knockout text.
             Two layers, both flat, both the theme's own canvas:
             - `.dnl-hero-scrim` is the whole band at the operator's chosen
               strength, so "image opacity 100%" really does show the image.
             - `.dnl-hero-plate` is the claim's own ground: a fixed 0.92 wash
               under the words and the actions only. It is the legibility floor
               the scrim used to be before the slider could drive it to zero,
               and it is what lets the claim keep ordinary `fg` ink in either
               theme whatever image or overlay the SuperAdmin picked.
             The artwork reveals beside the plate on wide screens and above it
             on phones, so a bright image is a composition, not a contrast bug.
             An earlier pass tried a dark gradient with white `on-scrim` ink;
             that put the same near-black slab in both themes and a ramp on the
             one band the direction says is flat. Nothing here is a gradient. -->
        <div v-if="heroBackground" class="dnl-hero-scrim" aria-hidden="true" />
        <div v-if="heroBackground" class="dnl-hero-plate" aria-hidden="true" />

        <div
          class="relative z-10 mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-14"
          :class="heroBackground ? 'pt-[calc(44vw+2rem)] md:pt-24' : 'pt-14 sm:pt-24'"
        >
          <div class="dnl-hero-claim">
            <h1
              class="max-w-[19ch] font-display text-[2.25rem] font-medium leading-[1.1] tracking-tight text-fg sm:text-6xl"
            >
              {{ hero.title ?? 'Run your open play and tournaments on one record.' }}
            </h1>
            <p class="mt-6 max-w-[62ch] text-body-1 text-fg-secondary sm:text-lg">
              {{
                hero.subtitle ??
                'Sessions, entries, brackets, courts and results in one place instead of a group chat — and every result feeds a rating your players cannot argue with.'
              }}
            </p>
          </div>
        </div>

        <!-- The actions sit on their own rule rather than inside a panel. The
             row is kept inside the claim's column so the note on the right
             never lands on the revealed artwork. -->
        <div class="relative z-10 border-y border-fg-muted">
          <div class="mx-auto max-w-6xl px-4 sm:px-6">
            <div
              class="dnl-hero-claim flex flex-col gap-3 py-5 sm:flex-row sm:flex-wrap sm:items-center"
            >
              <NuxtLink
                to="/register"
                class="dnl-press whitespace-nowrap rounded-button bg-primary px-6 py-3 text-center text-body-1 font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >Create your club</NuxtLink
              >
              <NuxtLink
                to="/events"
                class="dnl-press whitespace-nowrap rounded-button border border-fg-muted bg-canvas px-6 py-3 text-center text-body-1 font-semibold text-fg transition-colors hover:border-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >Find play near you</NuxtLink
              >
              <p class="text-body-2 text-fg-secondary">Browsing is free and needs no account.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- BROWSE INDEX. The old tab strip, resolved into real URLs. -->
      <nav aria-label="Browse" class="border-b-2 border-fg">
        <ul class="mx-auto max-w-6xl px-4 sm:px-6 md:grid md:grid-cols-4">
          <li
            v-for="item in browse"
            :key="item.to"
            class="border-b border-fg-muted last:border-b-0 md:border-b-0 md:border-l md:border-fg-muted md:px-5 md:first:border-l-0 md:first:pl-0"
          >
            <NuxtLink
              :to="item.to"
              class="dnl-row group relative flex flex-col gap-1 py-4 focus-visible:outline-none md:py-5"
            >
              <span
                class="dnl-row-shift text-body-1 font-semibold text-fg transition-colors group-hover:text-primary group-focus-visible:text-primary"
                >{{ item.label }}</span
              >
              <span class="dnl-row-shift text-body-2 text-fg-muted">{{ item.line }}</span>
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <!-- BAND: FOR PLAYERS. Claim left, player record benefits right. -->
      <section class="dnl-reveal mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div class="md:grid md:grid-cols-12 md:gap-10">
          <div class="md:col-span-5">
            <h2
              class="font-display text-heading-1 font-semibold tracking-tight text-fg sm:text-4xl"
            >
              For players
            </h2>
            <p class="mt-5 max-w-[48ch] text-body-1 text-fg-secondary">
              Your rating, your tournament history, and the badges you earn — all in one place,
              across every club you play at.
            </p>
            <NuxtLink
              to="/register"
              class="dnl-step mt-6 inline-flex items-center gap-2 rounded-button text-body-1 font-semibold text-fg underline decoration-fg-muted underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
            >
              Get your rating
              <UiIcon
                class="dnl-step-chevron"
                name="chevron-right"
                size="h-4 w-4"
                :stroke-width="2.2"
              />
            </NuxtLink>
          </div>

          <dl
            class="mt-10 rounded-card border border-border bg-surface p-5 shadow-card sm:p-6 md:col-span-7 md:mt-0"
          >
            <div
              v-for="row in playerRecord"
              :key="row.label"
              class="border-t border-border py-5 first:border-t-0 first:pt-0 sm:grid sm:grid-cols-3 sm:gap-6"
            >
              <dt class="text-body-1 font-semibold text-fg">{{ row.label }}</dt>
              <dd class="mt-1.5 text-body-2 text-fg-secondary sm:col-span-2 sm:mt-0">
                {{ row.line }}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <!-- BAND: FOR CLUBS. Claim left, evidence right. -->
      <section class="dnl-reveal mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div class="md:grid md:grid-cols-12 md:gap-10">
          <div class="md:col-span-5">
            <h2
              class="font-display text-heading-1 font-semibold tracking-tight text-fg sm:text-4xl"
            >
              For clubs
            </h2>
            <p class="mt-5 max-w-[48ch] text-body-1 text-fg-secondary">
              A club here is an operator, not a listing. You run the play, hold the membership, and
              own the record it all produces.
            </p>
            <NuxtLink
              to="/register"
              class="dnl-step mt-6 inline-flex items-center gap-2 rounded-button text-body-1 font-semibold text-fg underline decoration-fg-muted underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
            >
              Create your club
              <UiIcon
                class="dnl-step-chevron"
                name="chevron-right"
                size="h-4 w-4"
                :stroke-width="2.2"
              />
            </NuxtLink>
          </div>

          <dl
            class="mt-10 rounded-card border border-border bg-surface p-5 shadow-card sm:p-6 md:col-span-7 md:mt-0"
          >
            <div
              v-for="row in clubLedger"
              :key="row.label"
              class="border-t border-border py-5 first:border-t-0 first:pt-0 sm:grid sm:grid-cols-3 sm:gap-6"
            >
              <dt class="text-body-1 font-semibold text-fg">{{ row.label }}</dt>
              <dd class="mt-1.5 text-body-2 text-fg-secondary sm:col-span-2 sm:mt-0">
                {{ row.line }}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <!-- BAND: VERIFIED CLUBS. What verification earns. -->
      <section class="dnl-reveal border-y border-fg-muted">
        <div class="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div class="md:grid md:grid-cols-12 md:gap-10">
            <div class="md:col-span-5">
              <h2
                class="font-display text-heading-1 font-semibold tracking-tight text-fg sm:text-4xl"
              >
                Verified clubs
              </h2>
              <p class="mt-5 max-w-[48ch] text-body-1 text-fg-secondary">
                A verified badge means a real organisation behind the events — and results that
                count toward the national ranking.
              </p>
              <NuxtLink
                to="/clubs"
                class="dnl-step mt-6 inline-flex items-center gap-2 rounded-button text-body-1 font-semibold text-fg underline decoration-fg-muted underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
              >
                Browse verified clubs
                <UiIcon
                  class="dnl-step-chevron"
                  name="chevron-right"
                  size="h-4 w-4"
                  :stroke-width="2.2"
                />
              </NuxtLink>
            </div>

            <dl
              class="mt-10 rounded-card border border-border bg-surface p-5 shadow-card sm:p-6 md:col-span-7 md:mt-0"
            >
              <div
                v-for="row in verifiedBenefits"
                :key="row.label"
                class="border-t border-border py-5 first:border-t-0 first:pt-0 sm:grid sm:grid-cols-3 sm:gap-6"
              >
                <dt class="text-body-1 font-semibold text-fg">{{ row.label }}</dt>
                <dd class="mt-1.5 text-body-2 text-fg-secondary sm:col-span-2 sm:mt-0">
                  {{ row.line }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <!-- BAND: THE RECORD. The mechanism, drawn. -->
      <section ref="loopBand" class="dnl-loop dnl-reveal border-y-2 border-fg bg-surface-3 dark:bg-surface">
        <div class="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 class="font-display text-heading-1 font-semibold tracking-tight text-fg sm:text-4xl">
            A rating nobody argues with
          </h2>
          <p class="mt-5 max-w-[62ch] text-body-1 text-fg-secondary">
            No self-reported numbers. A result only counts when the club that ran the game writes it
            down — and it is final the moment they do.
          </p>

          <ol class="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
            <li v-for="(stop, i) in loop" :key="stop.label" class="dnl-stop relative flex flex-col">
              <span class="dnl-seg" aria-hidden="true" />
              <span
                class="dnl-dot relative z-10 block h-3 w-3 rounded-pill border-2 border-fg bg-canvas"
                aria-hidden="true"
              />
              <p class="mt-5 font-display text-heading-3 text-fg">
                <span class="tabular-nums text-fg-muted">{{ i + 1 }}.</span> {{ stop.label }}
              </p>
              <p class="mt-2 max-w-[40ch] text-body-2 text-fg-secondary">{{ stop.line }}</p>
              <p
                class="mt-4 flex items-center gap-2 border-t border-fg-muted pt-3 text-body-2 font-medium tabular-nums sm:mt-auto"
                :class="stop.confirmed ? 'text-primary' : 'text-fg'"
              >
                <UiIcon
                  v-if="stop.confirmed"
                  name="check"
                  size="h-4 w-4"
                  :stroke-width="2.4"
                  aria-hidden="true"
                />
                {{ stop.record ?? ratingRecord }}
              </p>
            </li>
          </ol>
          <p class="mt-8 text-caption text-fg-muted">
            Scores and ratings shown here are an example, not a recorded match.
          </p>
        </div>
      </section>

      <!-- BAND: UPCOMING EVENTS. The real schedule. -->
      <section class="dnl-reveal mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div class="md:grid md:grid-cols-12 md:gap-10">
          <div class="md:col-span-5">
            <h2
              class="font-display text-heading-1 font-semibold tracking-tight text-fg sm:text-4xl"
            >
              Find play near you
            </h2>
            <p class="mt-5 max-w-[48ch] text-body-1 text-fg-secondary">
              Open sessions and tournaments, published by clubs. Browse by date, location, or
              skill level — and reserve your slot before you arrive.
            </p>
            <NuxtLink
              to="/events"
              class="dnl-step mt-6 inline-flex items-center gap-2 rounded-button text-body-1 font-semibold text-fg underline decoration-fg-muted underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
            >
              Browse all events
              <UiIcon
                class="dnl-step-chevron"
                name="chevron-right"
                size="h-4 w-4"
                :stroke-width="2.2"
              />
            </NuxtLink>
          </div>

          <div
            class="mt-10 rounded-card border border-border bg-surface p-5 shadow-card sm:p-6 md:col-span-7 md:mt-0"
          >
            <h3
              class="border-b-2 border-border-strong pb-3 text-caption font-semibold uppercase tracking-widest text-fg-muted"
            >
              Next on the schedule
            </h3>

            <p
              v-if="upcoming.length === 0"
              class="border-b border-border py-6 text-body-2 text-fg-secondary"
            >
              Nothing is scheduled yet. Clubs publish their open play and tournaments here, and
              this is where players find them —
              <NuxtLink
                to="/register"
                class="dnl-press font-semibold text-primary underline underline-offset-4 transition-colors hover:decoration-2"
                >start the first club</NuxtLink
              >.
            </p>

            <ul v-else>
              <li v-for="event in upcoming" :key="event.id">
                <NuxtLink
                  :to="`/events/${event.id}`"
                  class="dnl-row group relative flex items-baseline gap-4 border-b border-border py-4 focus-visible:outline-none"
                >
                  <span class="w-24 shrink-0 tabular-nums">
                    <span class="block text-body-2 font-semibold text-fg">{{
                      formatEventDay(event.start_date)
                    }}</span>
                    <span class="block text-caption text-fg-muted">{{
                      formatEventTime(event.start_date)
                    }}</span>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-body-1 font-medium text-fg transition-colors group-hover:text-primary group-focus-visible:text-primary"
                      >{{ event.name }}</span
                    >
                    <span class="block truncate text-body-2 text-fg-muted">
                      {{ event.venue || event.city || 'Venue to be announced' }}
                      <span class="sm:hidden"
                        >·
                        {{ event.event_type === 'tournament' ? 'Tournament' : 'Open play' }}</span
                      >
                    </span>
                  </span>
                  <span
                    class="hidden shrink-0 text-caption font-semibold uppercase tracking-wide text-fg-muted sm:block"
                    >{{ event.event_type === 'tournament' ? 'Tournament' : 'Open play' }}</span
                  >
                </NuxtLink>
              </li>
            </ul>

            <NuxtLink
              to="/events"
              class="dnl-step mt-5 inline-flex items-center gap-2 rounded-button text-body-2 font-semibold text-fg underline decoration-fg-muted underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-surface"
            >
              All events
              <UiIcon
                class="dnl-step-chevron"
                name="chevron-right"
                size="h-4 w-4"
                :stroke-width="2.2"
              />
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- Sponsors. Above the closing action rather than in the footer: the
           people paying for the band should not be below the fold that nobody
           scrolls to. Hidden entirely when there are none. -->
      <!-- Seated on the ledger's own claim-left / evidence-right row rather than
           floating in open space. The logos are operator-uploaded and are not
           restyled - but a raster tile adrift in the widest, emptiest band was
           the one element on the page not built from rules. -->
      <section v-if="sponsors.length" class="border-t border-fg-muted">
        <div
          class="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:grid md:grid-cols-12 md:items-center md:gap-10"
        >
          <h2
            class="text-caption font-semibold uppercase tracking-widest text-fg-muted md:col-span-5"
          >
            Our sponsors
          </h2>
          <div
            class="mt-6 flex flex-wrap items-center gap-8 border-t border-fg-muted pt-6 sm:gap-12 md:col-span-7 md:mt-0 md:border-t-0 md:pt-0"
          >
            <component
              :is="sponsor.link_url ? 'a' : 'div'"
              v-for="sponsor in sponsors"
              :key="sponsor.id"
              :href="sponsor.link_url || undefined"
              :target="sponsor.link_url ? '_blank' : undefined"
              :rel="sponsor.link_url ? 'noopener noreferrer' : undefined"
              :class="
                sponsor.link_url
                  ? 'dnl-press rounded-badge transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-canvas'
                  : ''
              "
            >
              <!-- The label is the alt text, which is why it is required on the
                   row: a logo with no accessible name is invisible to a screen
                   reader and unreadable when the image fails. -->
              <img
                v-if="sponsor.image_url"
                :src="sponsor.image_url"
                :alt="sponsor.label"
                class="h-10 w-auto max-w-[9rem] object-contain sm:h-12"
                loading="lazy"
              />
              <span v-else class="text-body-2 font-medium text-fg-secondary">{{
                sponsor.label
              }}</span>
            </component>
          </div>
        </div>
      </section>

      <!-- CLOSING BAND. Two paths, one record. -->
      <section class="border-t-2 border-fg">
        <div class="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div class="md:grid md:grid-cols-2 md:gap-16">
            <div class="border-b border-fg-muted pb-10 md:border-b-0 md:border-r md:pb-0 md:pr-16">
              <h2
                class="font-display text-heading-2 font-semibold tracking-tight text-fg sm:text-3xl"
              >
                Run the play
              </h2>
              <p class="mt-4 max-w-[40ch] text-body-1 text-fg-secondary">
                Create your club, publish sessions and tournaments, and let the results build the
                ladder.
              </p>
              <NuxtLink
                to="/register"
                class="dnl-press mt-6 inline-block rounded-button bg-primary px-6 py-3 text-center text-body-1 font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >Create your club</NuxtLink
              >
            </div>
            <div class="pt-10 md:pt-0">
              <h2
                class="font-display text-heading-2 font-semibold tracking-tight text-fg sm:text-3xl"
              >
                Join the record
              </h2>
              <p class="mt-4 max-w-[40ch] text-body-1 text-fg-secondary">
                Find play near you, earn your rating, and build a tournament history you can point
                to.
              </p>
              <NuxtLink
                to="/register"
                class="dnl-press mt-6 inline-block rounded-button border border-fg-muted bg-canvas px-6 py-3 text-center text-body-1 font-semibold text-fg transition-colors hover:border-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >Get your rating</NuxtLink
              >
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="border-t border-fg-muted">
      <div
        class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6"
      >
        <UiBrandMark size="sm" name-class="text-body-2 font-medium" />
        <nav aria-label="Policies" class="flex flex-wrap justify-center gap-4 text-caption text-fg-secondary">
          <a
            href="mailto:support@dinkandladder.app"
            class="rounded-button underline-offset-2 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >Support</a
          >
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
          <NuxtLink
            to="/legal/cookies"
            class="rounded-button underline-offset-2 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >Cookies</NuxtLink
          >
        </nav>
        <p class="text-caption text-fg-muted">© Copyright 2026 DinkAndLadder. All Rights Reserved.</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/*
 * The page's response vocabulary - .dnl-press, .dnl-row, .dnl-row-shift and
 * .dnl-step-chevron - now lives in assets/css/main.css, because the feed needed
 * the same one and two copies of an interaction language is how two surfaces
 * start drifting apart. Only what is genuinely local to this page stays below.
 */

/* Selected text is a surface the page never drew and still ships. The brand
   wash carries the theme's own ink at full contrast in both modes. */
.dnl-landing :deep(::selection) {
  background-color: rgb(var(--dnl-primary-soft));
  color: rgb(var(--dnl-fg));
}

/*
 * Scroll-triggered reveal animations.
 *
 * The finished state is the CSS default: fully visible, no transform. Only JS
 * winds it back when motion is allowed, and the intersection observer releases
 * it as each section enters the viewport. This follows the Recoverable-Motion
 * Rule: a failed hydration or missing observer shows the complete page.
 */
.dnl-reveal {
  /* No initial state here — visible by default */
}

.dnl-reveal[data-reveal='pending'] {
  opacity: 0;
  transform: translateY(60px) scale(0.98);
  filter: blur(4px);
}

.dnl-reveal[data-reveal='visible'] {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0);
  transition:
    opacity 800ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 800ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 600ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Stagger the card panels within each band for a more layered reveal */
.dnl-reveal[data-reveal='visible'] dl,
.dnl-reveal[data-reveal='visible'] > div > div:last-child {
  transition-delay: 200ms;
}

/*
 * Reduced motion keeps every one of these responses and removes only their
 * travel. Someone who asked for less movement still needs to see which row is
 * under their finger, so the rule still appears and the ink still changes -
 * only the sliding stops.
 */
@media (prefers-reduced-motion: reduce) {
  .dnl-sheet-enter-active .dnl-sheet-panel,
  .dnl-sheet-leave-active .dnl-sheet-panel {
    transition: none;
  }

  .dnl-sheet-enter-from .dnl-sheet-panel,
  .dnl-sheet-leave-to .dnl-sheet-panel {
    transform: none;
  }

  /* Reveal animations disabled under reduced motion — sections are visible */
  .dnl-reveal[data-reveal='pending'],
  .dnl-reveal[data-reveal='visible'] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}

/*
 * The ground under an operator-chosen hero image.
 *
 * Two flat washes of the theme's own canvas - never a gradient, never a fixed
 * colour. Because both are the canvas, the claim's ordinary `fg` ink keeps
 * exactly the contrast it has everywhere else on the page, in both themes.
 *
 * `.dnl-hero-scrim` covers the whole band at the operator's strength, so their
 * slider is honoured. `.dnl-hero-plate` is the fixed legibility floor under
 * the claim and the actions: 0.92 is what the band was hardcoded to before the
 * slider existed, so the words read as they always did while the artwork is
 * revealed beside them (wide) or above them (phone). The plate and the claim
 * column agree on one ratio, --dnl-hero-art, so the text can never cross onto
 * the revealed image.
 */
.dnl-hero-scrim {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-color: rgb(var(--dnl-canvas) / var(--dnl-hero-wash, 0.92));
}

.dnl-hero--art {
  /* Share of the band given to the artwork on wide screens, as a ratio. */
  --dnl-hero-art: 0.38;
}

.dnl-hero-plate {
  position: absolute;
  z-index: 0;
  pointer-events: none;
  inset: 0;
  /* Phone: the artwork is a strip above the claim, matching the claim's own
     top padding in the template (44vw + 2rem). */
  top: 44vw;
  background-color: rgb(
    var(--dnl-hero-plate, var(--dnl-canvas)) / var(--dnl-hero-plate-alpha, 0.92)
  );
}

/*
 * The plate's edge dissolves into the artwork rather than cutting it. This is
 * the one gradient on the page, and it is not decoration: it is the seam
 * between the claim's ground and the operator's image, and a hard seam read
 * as a panel. It lives entirely outside the plate - the words still sit on a
 * flat 0.92 wash - so it costs nothing in contrast. Phone: upward into the
 * strip. Wide: rightward into the reveal.
 */
.dnl-hero-plate::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  /* The operator's fade as a share of the viewport width: 0.11 × 400px ≈ 3rem. */
  height: calc(100vw * var(--dnl-hero-fade, 0.11));
  background: linear-gradient(
    to top,
    rgb(var(--dnl-hero-plate, var(--dnl-canvas)) / var(--dnl-hero-plate-alpha, 0.92)),
    rgb(var(--dnl-hero-plate, var(--dnl-canvas)) / 0)
  );
}

@media (min-width: 768px) {
  .dnl-hero-plate {
    top: 0;
    /* The plate ends where the claim column ends. Below the 72rem container
       cap the column is a share of the viewport; above it, a share of the
       centred container plus the margin outside it. */
    right: max(
      calc(100% * var(--dnl-hero-art)),
      calc((100% - 72rem) / 2 + 72rem * var(--dnl-hero-art))
    );
  }

  .dnl-hero-plate::after {
    top: 0;
    bottom: 0;
    left: 100%;
    right: auto;
    height: auto;
    /* As a share of the viewport width (the band is full-bleed, and a % here
       would be of the plate, not the band): 0.11 × 1440px ≈ 10rem. */
    width: calc(100vw * var(--dnl-hero-fade, 0.11));
    background: linear-gradient(
      to right,
      rgb(var(--dnl-hero-plate, var(--dnl-canvas)) / var(--dnl-hero-plate-alpha, 0.92)),
      rgb(var(--dnl-hero-plate, var(--dnl-canvas)) / 0)
    );
  }

  .dnl-hero--art .dnl-hero-claim {
    max-width: calc(100% * (1 - var(--dnl-hero-art)));
    padding-right: 2rem;
  }
}

/*
 * The verification loop's connecting rule.
 *
 * The finished state is the default, so the band is complete with no JS and
 * under `prefers-reduced-motion`. `data-animate` is written by the page only
 * when motion is allowed; that is the single selector that winds the rule back
 * to nothing, and `data-drawn` releases it.
 */
.dnl-seg {
  position: absolute;
  left: 0;
  top: 5px;
  height: 2px;
  /* Reaches the next marker, not just the edge of its own grid column. At a
     plain 100% the rule stopped one gap short of every dot and the stroke read
     as three disconnected dashes - the exact "three separate items" reading
     this moment exists to prevent. 2rem is the `sm:gap-8` between columns. */
  width: calc(100% + 2rem);
  background-color: rgb(var(--dnl-fg-muted));
  transform-origin: left center;
}

/* The rule runs between stops, not past the last one. */
.dnl-stop:last-child .dnl-seg {
  display: none;
}

.dnl-loop[data-animate='true'] .dnl-seg {
  transform: scaleX(0);
  transition: transform 700ms cubic-bezier(0.16, 1, 0.3, 1);
}

.dnl-loop[data-animate='true'][data-drawn='true'] .dnl-seg {
  transform: scaleX(1);
}

/*
 * The stop markers never animate. They are the band's structure, not its
 * motion: fading them in made the whole mechanism vanish whenever the trigger
 * did not fire, which is the one failure a decorative entrance must not be able
 * to cause. Only the rule between them is animated.
 */

/* Stop by stop, so it reads as one stroke travelling the band. */
.dnl-stop:nth-child(1) .dnl-seg {
  transition-delay: 120ms;
}
.dnl-stop:nth-child(2) .dnl-seg {
  transition-delay: 820ms;
}

/*
 * On a phone the stops are a column, so the rule that joins them is vertical
 * and runs down the left edge rather than across.
 */
@media (max-width: 639px) {
  /* The rule gets its own gutter. Run full-width like the horizontal version
     and it crosses every line of the stop's own text. */
  .dnl-stop {
    padding-left: 1.75rem;
  }

  .dnl-dot {
    margin-left: -1.75rem;
  }

  .dnl-seg {
    left: 5px;
    top: 0;
    height: calc(100% + 2.5rem);
    width: 2px;
    transform-origin: top center;
  }

  .dnl-loop[data-animate='true'] .dnl-seg {
    transform: scaleY(0);
  }

  .dnl-loop[data-animate='true'][data-drawn='true'] .dnl-seg {
    transform: scaleY(1);
  }
}
</style>
