<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import type { FeedReason } from '~/server/domains/activity/dto/activity.dto'
// The registry is a typed union, so a name that is not drawn fails the build
// rather than rendering nothing.
import type { IconName } from '~/utils/icons'
import { describeFeedReason, groupByFeedDay } from '~/utils/feed'
import { formatRating, formatRatingDelta } from '~/utils/rating-tiers'

useHead({ title: 'Feed' })

const user = useSupabaseUser()
// The rail's community link is a player-mode door; in club mode the page it
// opens is off the map (and redirects straight back here).
const { isClubMode } = useAccountMode()

interface LinkedEvent {
  id: string
  name: string
  start_date: string | null
  city: string | null
  venue: string | null
  status: string
}

interface Activity {
  id: string
  activity_type: string
  actor_player_id: string | null
  actor_display_name?: string
  actor_club_id?: string | null
  /** Named by the endpoint for club-authored rows. */
  actor_club_name?: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  /** The event this activity is about, when it points at one and it still exists. */
  event?: LinkedEvent | null
  /** Why the row is in this reader's feed. See FeedReason. */
  feed_reason?: FeedReason | null
  feed_reason_name?: string | null
}

/**
 * A page at a time, appended as the reader reaches the end.
 *
 * The feed used to request the endpoint's default and render whatever came
 * back, so it was one fixed page that could never grow — scrolling to the
 * bottom simply ended. 25 is the page size; the endpoint caps at 50.
 */
const PAGE_SIZE = 25

interface FeedPage {
  activities: Activity[]
  /** Only sent on an empty first page. See the two empty states below. */
  community_size?: number | null
}

const { data, status, error, refresh } = await useFetch<FeedPage>('/api/v1/feed', {
  query: { limit: PAGE_SIZE, offset: 0 }
})

/**
 * Two ways to have an empty feed, and they need different words.
 *
 * The feed is scoped to the player's community (049-feed-community-scope), so
 * an empty page means either "nobody you play with has done anything yet" or
 * "you do not have anybody yet". `community_size` counts the player themselves,
 * so 1 is the second case — telling someone with no partners to wait for their
 * partners to post would be a dead end.
 */
const hasNoCommunity = computed(() => (data.value?.community_size ?? 2) <= 1)

/** Pages 2..n. Kept separate from `data` so `refresh()` still means "reload the top". */
const olderActivities = ref<Activity[]>([])
const loadingMore = ref(false)
const reachedEnd = ref(false)

const activities = computed(() => [...(data.value?.activities ?? []), ...olderActivities.value])

/**
 * The log, one section per calendar day.
 *
 * The server orders by day first and nearest-actor second (060), so the day is
 * the real structure of the page and gets a rule and a heading of its own.
 * It is also what answers "why is this old post here": it sits under a
 * heading that says exactly when it was.
 */
const dayGroups = computed(() => groupByFeedDay(activities.value))

// A short page means the server has nothing further; asking again would be a
// request that can only come back empty.
watch(data, (value) => {
  olderActivities.value = []
  reachedEnd.value = (value?.activities?.length ?? 0) < PAGE_SIZE
})

async function loadMore() {
  if (loadingMore.value || reachedEnd.value) return
  loadingMore.value = true
  try {
    const response = await $fetch<{ activities: Activity[] }>('/api/v1/feed', {
      query: { limit: PAGE_SIZE, offset: activities.value.length }
    })
    const batch = response.activities ?? []
    olderActivities.value = [...olderActivities.value, ...batch]
    if (batch.length < PAGE_SIZE) reachedEnd.value = true
  } catch {
    // Leave the button in place: a failed page is worth retrying, and losing
    // the feed already on screen to an error state would be worse.
  } finally {
    loadingMore.value = false
  }
}

/**
 * Fires when the sentinel below the list scrolls into view. IntersectionObserver
 * rather than a scroll handler so nothing runs on every frame of a scroll.
 */
const sentinel = ref<HTMLElement | null>(null)

onMounted(() => {
  if (!sentinel.value || typeof IntersectionObserver === 'undefined') return
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore()
    },
    // Start fetching slightly before the sentinel is actually visible, so the
    // next page is usually there by the time the reader arrives.
    { rootMargin: '400px' }
  )
  observer.observe(sentinel.value)
  onBeforeUnmount(() => observer.disconnect())
})

/**
 * The feed is a log of things that already happened, so an event published a
 * month ago but starting next week sinks out of sight — "coming soon" was
 * effectively invisible. This reads the events list directly rather than
 * inventing synthetic activity rows for something that has not occurred yet.
 *
 * `status=published` and a deeper page on purpose: the endpoint lists furthest
 * start date first, so an unfiltered `limit=20` was the twenty events furthest
 * in the future and the nearest weekend could fall off the end of it.
 */
const { data: eventsData } = useLazyFetch<{ events: EventDto[] }>('/api/v1/events', {
  query: { limit: 50, status: 'published' },
  default: () => ({ events: [] as EventDto[] })
})

/**
 * At most one per club, so three slots show three clubs.
 *
 * Sorting by date alone made this list three copies of the same evening: a club
 * running a social, a ladder and a ranked night on one night filled every slot,
 * and the reader learned about one club instead of three. The nearest date per
 * club wins, and a club with nothing else coming up simply is not here.
 */
const upcomingEvents = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  const seenClubs = new Set<string>()
  const picked: EventDto[] = []

  for (const event of (eventsData.value?.events ?? [])
    .filter((e) => e.status === 'published' && e.start_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    if (seenClubs.has(event.club_id)) continue
    seenClubs.add(event.club_id)
    picked.push(event)
    if (picked.length === 3) break
  }

  return picked
})

function formatEventDate(startDate: string | null): string {
  if (!startDate) return ''
  return new Date(startDate).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * The row's type mark, from the app's own stroked icon registry.
 *
 * This was twelve emoji - 🎯📈👤📣🏆🏸📅📢✏️🎪 - and they were most of why the
 * feed was tiring to read. Each glyph arrives with its own palette and its own
 * weight, so a screen of them is a dozen competing colours in a product whose
 * whole identity is one restrained green, and none of them can follow the
 * reader into dark mode or inherit a muted ink. These are drawn paths at one
 * stroke weight in `currentColor`, which lets the column recede into a rhythm
 * the eye can skip rather than a row of stickers it has to decode.
 */
const ACTIVITY_ICONS: Record<string, IconName> = {
  'match.verified': 'paddle',
  'rating.changed': 'stats',
  'social.started_following': 'players',
  'social.shoutout': 'chat',
  'achievement.earned': 'achievements',
  'achievement.unlocked': 'achievements',
  'club.member_joined': 'clubs',
  'club.joined': 'clubs',
  'club.event_created': 'calendar',
  'club.announcement': 'bell',
  'profile.updated': 'edit',
  'tournament.registered': 'trophy'
}

function getActivityIcon(type: string): IconName {
  return ACTIVITY_ICONS[type] ?? 'info'
}

/**
 * Whether a row has anything of its own to say.
 *
 * The feed was twenty-five identical panels in which nothing outranked
 * anything, which is exactly what makes a log exhausting: the reader has to
 * give every row the same attention because the page gives every row the same
 * weight. A shout-out carries a person's own words and an event carries
 * something to open; "updated their profile" carries neither and should cost
 * one line. So the hierarchy comes from the content that is actually there,
 * not from decoration applied on top of it.
 */
function hasBody(activity: Activity): boolean {
  return Boolean(shoutoutMessage(activity)) || Boolean(activity.event)
}

/**
 * A shout-out is the one activity whose body is the point — it is the player's
 * own words, not a system description of something they did. It gets pulled out
 * of the sentence and given its own block below, so the others can stay as a
 * one-line "X did Y".
 */
function shoutoutMessage(activity: Activity): string | null {
  if (activity.activity_type !== 'social.shoutout') return null
  const message = (activity.metadata as Record<string, string> | null)?.message
  return message || null
}

function eventNameSuffix(meta: Record<string, string>): string {
  return meta.event_name ? `: ${meta.event_name}` : ''
}

/**
 * The event whose name belongs inside the sentence, as a link.
 *
 * Only for `club.event_created`, where the event *is* the sentence. A shout-out
 * also resolves an event, but it keeps its own card below the message — its
 * sentence is "posted a shout-out", which the event name does not belong in.
 */
function namedEvent(activity: Activity): LinkedEvent | null {
  return activity.activity_type === 'club.event_created' ? (activity.event ?? null) : null
}

/**
 * A cancelled event is still a true entry in the log — the club did create it —
 * but it is no longer something to open, so the row says so instead of
 * offering a link to a session nobody can join. Left as history rather than
 * hidden: quietly dropping rows is how a feed starts feeling unreliable.
 */
function isCancelled(event: LinkedEvent | null | undefined): boolean {
  return event?.status === 'cancelled'
}

/**
 * The rating sentence, in the app's own three-decimal format with the move.
 *
 * The engine writes the raw float into the metadata, so the row used to read
 * "rating updated to 3.367655538028936" - sixteen digits for a number the
 * rest of the product prints as 3.368. The delta is what the reader actually
 * wants from this row; the new figure is context.
 */
function ratingChangeText(meta: Record<string, unknown>): string {
  const next = typeof meta.new_rating === 'number' ? meta.new_rating : Number(meta.new_rating)
  const prev = typeof meta.old_rating === 'number' ? meta.old_rating : Number(meta.old_rating)
  const type = typeof meta.rating_type === 'string' ? meta.rating_type : 'singles'
  if (Number.isNaN(next)) return `rating updated (${type})`
  const delta = Number.isNaN(prev) ? null : next - prev
  const move = delta === null ? '' : ` (${formatRatingDelta(delta)})`
  return `${type} rating now ${formatRating(next)}${move}`
}

function formatActivityText(activity: Activity): string {
  const meta = (activity.metadata ?? {}) as Record<string, string>
  switch (activity.activity_type) {
    case 'match.verified':
      return `played a match (${meta.match_type ?? 'singles'})`
    case 'rating.changed':
      return ratingChangeText(activity.metadata ?? {})
    case 'social.started_following':
      return `started teaming up with ${meta.target_display_name ?? 'someone'}`
    case 'social.shoutout':
      return 'posted a shout-out'
    case 'achievement.earned':
    case 'achievement.unlocked':
      return `unlocked achievement: ${meta.achievement_name ?? 'New Achievement'}`
    case 'club.member_joined':
    case 'club.joined':
      return `joined club ${meta.club_name ?? ''}`
    case 'club.event_created':
      // The name is deliberately left off when the event resolved: the template
      // renders it as a link instead, so it is not said twice.
      return activity.event ? 'created an event: ' : `created an event${eventNameSuffix(meta)}`
    case 'club.announcement':
      return meta.title ? `posted an announcement: ${meta.title}` : 'posted an announcement'
    case 'profile.updated':
      return 'updated their profile'
    case 'tournament.registered':
      return `registered for ${meta.tournament_name ?? 'a tournament'}`
    default:
      return activity.activity_type.replace('.', ' ')
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  // Past a day, the day heading above the row already says when; the row only
  // needs the clock time.
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * The reason line under a row, or nothing for an unscoped (signed-out) feed.
 *
 * On a club-authored row the club is named on the same line, so "You're a
 * member of Bay Area Pickleball" would say the name twice; there the reason
 * shortens to "you're a member" and the club link carries the name.
 */
function reasonFor(activity: Activity): string | null {
  if (activity.actor_club_name && activity.feed_reason === 'club') return "you're a member"
  return describeFeedReason(activity.feed_reason, activity.feed_reason_name)
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <!-- The page-shell column, shared with the rest of the app. Below `lg` the
         feed is one column read top to bottom; from `lg` it becomes the log at
         a reading width plus a rail for what is coming up and who is in the
         feed, so the log is read at body size instead of squeezed to a strip
         in the middle of a wide screen. -->
    <div class="mx-auto max-w-6xl">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 class="font-display text-heading-1 font-semibold tracking-tight text-fg">Feed</h1>
          <p class="mt-1 max-w-[52ch] text-body-2 text-fg-muted">
            <template v-if="user">
              Your partners, team-ups, opponents and your clubs — by day, nearest to you first.
            </template>
            <template v-else> Public activity, newest first. </template>
          </p>
        </div>
        <button
          class="dnl-press shrink-0 rounded-button p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          aria-label="Refresh feed"
          @click="refresh()"
        >
          <UiIcon name="refresh" />
        </button>
      </div>

      <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8">
        <!-- The rail. On a phone it stacks above the log — an event that has
             not happened yet would otherwise never surface on a page that is
             a record of the past. From `lg` it moves to the right, in DOM
             order after the log so the log is what a screen reader meets
             first, and stays put while the log scrolls. -->
        <aside class="lg:sticky lg:top-6 lg:order-2 lg:self-start">
          <!-- Coming up. One panel of ruled rows, not three floating cards -
               it is a short list, and a list is what it should look like. -->
          <section
            v-if="upcomingEvents.length"
            class="mb-6 rounded-card border border-border bg-surface px-4 shadow-card sm:px-5"
            aria-labelledby="feed-coming-up"
          >
            <h2
              id="feed-coming-up"
              class="border-b-2 border-border-strong py-3 text-caption font-semibold uppercase tracking-widest text-fg-muted"
            >
              Coming up
            </h2>
            <ul>
              <li v-for="upcoming in upcomingEvents" :key="upcoming.id">
                <NuxtLink
                  :to="`/events/${upcoming.id}`"
                  class="dnl-row group flex items-baseline gap-4 border-t border-border py-3.5 first:border-t-0 focus-visible:outline-none"
                >
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-body-2 font-medium text-fg transition-colors group-hover:text-primary group-focus-visible:text-primary"
                      >{{ upcoming.name }}</span
                    >
                    <span
                      v-if="upcoming.venue || upcoming.city"
                      class="block truncate text-caption text-fg-muted"
                    >
                      {{ [upcoming.venue, upcoming.city].filter(Boolean).join(', ') }}
                    </span>
                  </span>
                  <span class="shrink-0 text-caption font-medium tabular-nums text-fg-secondary">
                    {{ formatEventDate(upcoming.start_date) }}
                  </span>
                </NuxtLink>
              </li>
            </ul>
          </section>

          <!-- Who is in this feed. The rule that admits a row is printed under
               each row; this is the rule in full, once, with the way to change
               it. Only from `lg`: on a phone the header line already says it
               and the rows repeat it, and a third telling would push the log
               below the fold. -->
          <section
            v-if="user"
            class="hidden rounded-card border border-border bg-surface px-5 shadow-card lg:block"
            aria-labelledby="feed-why"
          >
            <h2
              id="feed-why"
              class="border-b-2 border-border-strong py-3 text-caption font-semibold uppercase tracking-widest text-fg-muted"
            >
              Why you see these
            </h2>
            <p class="py-3.5 text-body-2 leading-relaxed text-fg-secondary">
              Only your people: duo partners, team-ups, anyone you've played a verified match with,
              and posts from clubs you belong to. Each day, the nearest to you come first.
            </p>
            <NuxtLink
              v-if="!isClubMode"
              to="/community"
              class="dnl-row dnl-step group flex items-center gap-2 border-t border-border py-3.5 text-body-2 font-medium text-fg transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
            >
              <span class="flex-1">Manage your community</span>
              <UiIcon
                name="chevron-right"
                size="h-4 w-4"
                :stroke-width="2.2"
                class="dnl-step-chevron shrink-0 text-fg-muted"
                aria-hidden="true"
              />
            </NuxtLink>
          </section>
        </aside>

        <div class="min-w-0 lg:order-1">
          <!-- Loading. Ruled lines inside the panel the feed will occupy, rather
               than five floating blocks: a placeholder should be the shape of the
               thing that is arriving. -->
          <div
            v-if="status === 'pending'"
            class="rounded-card border border-border bg-surface px-4 shadow-card sm:px-5"
          >
            <div
              v-for="i in 6"
              :key="i"
              class="flex items-center gap-3 border-t border-border py-4 first:border-t-0"
            >
              <div class="h-4 w-4 shrink-0 animate-pulse rounded-badge bg-surface-2" />
              <div class="h-3 w-full max-w-sm animate-pulse rounded-badge bg-surface-2" />
              <div class="ml-auto h-3 w-8 shrink-0 animate-pulse rounded-badge bg-surface-2" />
            </div>
          </div>

          <UiErrorState
            v-else-if="error"
            title="Could not load the feed"
            message="Something went wrong fetching activity."
            @retry="refresh()"
          />

          <!-- No community yet: the feed cannot fill until there is someone in it,
               so the way out is finding people, not waiting. -->
          <UiEmptyState
            v-else-if="activities.length === 0 && hasNoCommunity"
            title="Your feed is waiting on your people"
            message="This feed shows your duo partners, your team-ups, everyone you have played a match against, and your own clubs. Add a partner, team up with someone, or play a match and their activity lands here."
            action-label="Find players"
            action-to="/players"
          />

          <!-- Community exists, but has been quiet. -->
          <UiEmptyState
            v-else-if="activities.length === 0"
            title="Nothing from your community yet"
            message="When the players you team up with record matches, join clubs or post shout-outs, it shows up here."
            action-label="Find an event"
            action-to="/events"
          />

          <!--
            The log.

            One panel per day of ruled rows, not twenty-five stacked cards.
            Twenty-five shadows is a great deal of weight for a page whose
            content is mostly one-line sentences, and when every row is a panel
            of the same size nothing outranks anything - the reader has to spend
            the same attention on "updated their profile" as on someone's own
            words. A row here costs one sentence and one reason line unless it
            brought something with it.
          -->
          <div v-else>
            <section
              v-for="group in dayGroups"
              :key="group.key"
              class="mb-6 rounded-card border border-border bg-surface px-4 shadow-card sm:px-5 lg:px-6"
              :aria-label="group.label"
            >
              <h2
                class="border-b-2 border-border-strong py-3 text-caption font-semibold uppercase tracking-widest text-fg-muted"
              >
                {{ group.label }}
              </h2>
              <ul>
                <li
                  v-for="activity in group.items"
                  :key="activity.id"
                  class="border-t border-border first:border-t-0"
                  :class="hasBody(activity) ? 'py-4 lg:py-5' : 'py-3 lg:py-4'"
                >
                  <div class="flex gap-3 lg:gap-4">
                    <!-- The type mark. One stroke weight, muted: it is there to
                         be skipped past until the reader wants it. -->
                    <UiIcon
                      :name="getActivityIcon(activity.activity_type)"
                      size="h-4 w-4 lg:h-5 lg:w-5"
                      :stroke-width="2"
                      class="mt-0.5 shrink-0 text-fg-muted lg:mt-[3px]"
                      aria-hidden="true"
                    />

                    <div class="min-w-0 flex-1">
                      <div class="flex items-baseline justify-between gap-3">
                        <p class="min-w-0 text-body-2 text-fg-secondary lg:text-body-1">
                          <!-- The actor's name is identity, not an action, so it sits
                               in ordinary ink at weight 600 and turns green only under
                               the pointer. It used to be green at rest on every row,
                               which spent the page's scarcest colour twenty-five times
                               a screen and left nothing to mark what could actually be
                               opened. -->
                          <!-- The actor's name is identity, not an action, so it sits
                               in ordinary ink at weight 600 and turns green only under
                               the pointer. It used to be green at rest on every row,
                               which spent the page's scarcest colour twenty-five times
                               a screen and left nothing to mark what could actually be
                               opened.

                               NO AVATAR HERE, and it was tried. An inline face
                               before the name breaks the sentence: the smallest
                               avatar is 24px, the line box is ~21px, so the rest
                               of the line rides high against the name and the
                               first line grows taller than the ones under it.
                               The row's leading gutter is the obvious home, but
                               that slot is the activity-type mark, which is how
                               this feed is skimmed. Giving the actor a face here
                               means redesigning the row — avatar in the gutter
                               with the type as a badge on it — not swapping a
                               component. -->
                          <UiPlayerLink
                            :player-id="activity.actor_player_id"
                            :name="activity.actor_display_name"
                            class="dnl-press font-semibold text-fg transition-colors hover:text-primary focus-visible:ring-offset-surface"
                          />
                          {{ formatActivityText(activity) }}
                          <template v-if="namedEvent(activity)">
                            <!-- A cancelled event is named, not linked: there is
                                 nothing on the other side of the link to join. -->
                            <template v-if="isCancelled(namedEvent(activity))">
                              <span class="text-fg-muted line-through decoration-fg-muted/60">{{
                                namedEvent(activity)!.name
                              }}</span>
                              <span class="whitespace-nowrap text-caption text-danger">
                                (cancelled)</span
                              >
                            </template>
                            <NuxtLink
                              v-else
                              :to="`/events/${namedEvent(activity)!.id}`"
                              class="dnl-press rounded-badge font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                              >{{ namedEvent(activity)!.name }}</NuxtLink
                            >
                          </template>
                        </p>
                        <time
                          :datetime="activity.created_at"
                          class="shrink-0 text-caption tabular-nums text-fg-muted"
                          >{{ formatTime(activity.created_at) }}</time
                        >
                      </div>

                      <!-- The club, when a club is behind the row, then why the
                           row is here. One line in muted ink: the sentence above
                           names the person, this names the club they did it for,
                           so the reader is never left inferring either. -->
                      <p
                        v-if="activity.actor_club_name || reasonFor(activity)"
                        class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-caption text-fg-muted"
                      >
                        <NuxtLink
                          v-if="activity.actor_club_name && activity.actor_club_id"
                          :to="`/clubs/${activity.actor_club_id}`"
                          class="dnl-press inline-flex items-center gap-1 rounded-badge font-medium text-fg-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                        >
                          <UiIcon
                            name="clubs"
                            size="h-3.5 w-3.5"
                            :stroke-width="2"
                            aria-hidden="true"
                          />
                          {{ activity.actor_club_name }}
                        </NuxtLink>
                        <span
                          v-if="activity.actor_club_name && reasonFor(activity)"
                          aria-hidden="true"
                          >·</span
                        >
                        <span v-if="reasonFor(activity)">{{ reasonFor(activity) }}</span>
                      </p>

                      <!-- The shout-out's own words: the one place on this page where
                           a person actually wrote something, so it gets the body ramp
                           and real room. Its rule stays neutral - green here would
                           mark a message as confirmed, which it is not. -->
                      <blockquote
                        v-if="shoutoutMessage(activity)"
                        class="mt-2 border-l border-border-strong py-0.5 pl-3 text-body-1 text-fg lg:mt-2.5 lg:pl-4"
                      >
                        {{ shoutoutMessage(activity) }}
                      </blockquote>

                      <!-- The event a shout-out points at. A ruled row, not a tinted
                           block: a panel inside a panel is one container too many.
                           A cancelled one keeps the row but loses the link. -->
                      <template v-if="activity.event && !namedEvent(activity)">
                        <div
                          v-if="isCancelled(activity.event)"
                          class="mt-2.5 flex items-center gap-2.5 border-t border-border pt-2.5"
                        >
                          <UiIcon
                            name="calendar"
                            size="h-4 w-4"
                            :stroke-width="2"
                            class="shrink-0 text-fg-muted"
                            aria-hidden="true"
                          />
                          <span class="min-w-0 flex-1">
                            <span
                              class="block truncate text-body-2 font-medium text-fg-muted line-through decoration-fg-muted/60"
                            >
                              {{ activity.event.name }}
                            </span>
                            <span class="block truncate text-caption tabular-nums text-fg-muted">
                              {{
                                [formatEventDate(activity.event.start_date), activity.event.city]
                                  .filter(Boolean)
                                  .join(' · ')
                              }}
                            </span>
                          </span>
                          <UiStatusPill status="cancelled" size="sm" />
                        </div>
                        <NuxtLink
                          v-else
                          :to="`/events/${activity.event.id}`"
                          class="dnl-row dnl-step group mt-2.5 flex items-center gap-2.5 border-t border-border pt-2.5 focus-visible:outline-none"
                        >
                          <UiIcon
                            name="calendar"
                            size="h-4 w-4"
                            :stroke-width="2"
                            class="shrink-0 text-fg-muted"
                            aria-hidden="true"
                          />
                          <span class="min-w-0 flex-1">
                            <span
                              class="block truncate text-body-2 font-medium text-fg transition-colors group-hover:text-primary group-focus-visible:text-primary"
                            >
                              {{ activity.event.name }}
                            </span>
                            <span class="block truncate text-caption tabular-nums text-fg-muted">
                              {{
                                [formatEventDate(activity.event.start_date), activity.event.city]
                                  .filter(Boolean)
                                  .join(' · ')
                              }}
                            </span>
                          </span>
                          <UiIcon
                            name="chevron-right"
                            size="h-4 w-4"
                            :stroke-width="2.2"
                            class="dnl-step-chevron shrink-0 text-fg-muted"
                            aria-hidden="true"
                          />
                        </NuxtLink>
                      </template>
                    </div>
                  </div>
                </li>
              </ul>
            </section>

            <!-- Scrolling this into view fetches the next page. It is also the
                 manual fallback: without IntersectionObserver, or if a page fails,
                 the button is still there to press. -->
            <div ref="sentinel" class="text-center">
              <p v-if="loadingMore" class="py-3 text-caption text-fg-muted">Loading more…</p>
              <button
                v-else-if="!reachedEnd"
                type="button"
                class="dnl-press rounded-button border border-border-strong px-5 py-2 text-body-2 font-medium text-fg-secondary transition-colors hover:border-primary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                @click="loadMore"
              >
                Load more
              </button>
              <p v-else-if="activities.length" class="py-3 text-caption text-fg-muted">
                You're all caught up.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
