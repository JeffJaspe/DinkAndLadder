<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'
// The registry is a typed union, so a name that is not drawn fails the build
// rather than rendering nothing.
import type { IconName } from '~/utils/icons'

useHead({ title: 'Feed' })

interface LinkedEvent {
  id: string
  name: string
  start_date: string | null
  city: string | null
  venue: string | null
}

interface Activity {
  id: string
  activity_type: string
  actor_player_id: string | null
  actor_display_name?: string
  metadata: Record<string, unknown> | null
  created_at: string
  /** The event this activity is about, when it points at one and it still exists. */
  event?: LinkedEvent | null
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
 */
const { data: eventsData } = useLazyFetch<{ events: EventDto[] }>('/api/v1/events', {
  query: { limit: 20 },
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

function formatActivityText(activity: Activity): string {
  const meta = (activity.metadata ?? {}) as Record<string, string>
  switch (activity.activity_type) {
    case 'match.verified':
      return `played a match (${meta.match_type ?? 'singles'})`
    case 'rating.changed':
      return `rating updated to ${meta.new_rating ?? '?'} (${meta.rating_type ?? 'singles'})`
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
      return 'posted an announcement'
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
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <!-- Narrower than the usual page-shell on purpose. A feed is read top to
         bottom, one item at a time, and a full-width row makes the eye travel
         a long way for a single short sentence. -->
    <div class="mx-auto max-w-2xl">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 class="font-display text-heading-1 font-semibold tracking-tight text-fg">Feed</h1>
          <p class="mt-1 max-w-[52ch] text-body-2 text-fg-muted">
            Your community — partners, team-ups, opponents and your clubs — closest to you first,
            not newest first.
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

      <!-- Coming up. Sits above the log deliberately: the feed is a record of
           the past, so an event that has not happened yet would otherwise never
           surface here at all. One panel of ruled rows, not three floating
           cards - it is a short list, and a list is what it should look like.
           The 2px green left border it used to carry was the loudest mark on
           the page and named nothing that was actually actionable. -->
      <section
        v-if="upcomingEvents.length"
        class="mb-6 rounded-card border border-border bg-surface px-4 shadow-card sm:px-5"
      >
        <h2
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

      <!-- Loading. Ruled lines inside the panel the feed will occupy, rather
           than five floating blocks: a placeholder should be the shape of the
           thing that is arriving. -->
      <div
        v-if="status === 'pending'"
        class="rounded-card border border-border bg-surface px-4 shadow-card sm:px-5"
      >
        <div
          v-for="i in 5"
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

        One panel of ruled rows, not twenty-five stacked cards. Twenty-five
        shadows is a great deal of weight for a page whose content is mostly
        one-line sentences, and when every row is a panel of the same size
        nothing outranks anything - the reader has to spend the same attention
        on "updated their profile" as on someone's own words. A row here costs
        one line unless it brought something with it.
      -->
      <div v-else>
        <ul class="rounded-card border border-border bg-surface px-4 shadow-card sm:px-5">
          <li
            v-for="activity in activities"
            :key="activity.id"
            class="border-t border-border first:border-t-0"
            :class="hasBody(activity) ? 'py-4' : 'py-3'"
          >
            <div class="flex gap-3">
              <!-- The type mark. 16px, one stroke weight, muted: it is there to
                   be skipped past until the reader wants it. -->
              <UiIcon
                :name="getActivityIcon(activity.activity_type)"
                size="h-4 w-4"
                :stroke-width="2"
                class="mt-0.5 shrink-0 text-fg-muted"
                aria-hidden="true"
              />

              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-3">
                  <p class="min-w-0 text-body-2 text-fg-secondary">
                    <!-- The actor's name is identity, not an action, so it sits
                         in ordinary ink at weight 600 and turns green only under
                         the pointer. It used to be green at rest on every row,
                         which spent the page's scarcest colour twenty-five times
                         a screen and left nothing to mark what could actually be
                         opened. -->
                    <NuxtLink
                      v-if="activity.actor_player_id"
                      :to="`/players/${activity.actor_player_id}`"
                      class="dnl-press rounded-badge font-semibold text-fg transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      {{ activity.actor_display_name }}
                    </NuxtLink>
                    <span v-else class="font-semibold text-fg">{{
                      activity.actor_display_name
                    }}</span>
                    {{ formatActivityText(activity) }}
                    <NuxtLink
                      v-if="namedEvent(activity)"
                      :to="`/events/${namedEvent(activity)!.id}`"
                      class="dnl-press rounded-badge font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      >{{ namedEvent(activity)!.name }}</NuxtLink
                    >
                  </p>
                  <time
                    :datetime="activity.created_at"
                    class="shrink-0 text-caption tabular-nums text-fg-muted"
                    >{{ formatTime(activity.created_at) }}</time
                  >
                </div>

                <!-- The shout-out's own words: the one place on this page where
                     a person actually wrote something, so it gets the body ramp
                     and real room. Its rule stays neutral - green here would
                     mark a message as confirmed, which it is not. -->
                <blockquote
                  v-if="shoutoutMessage(activity)"
                  class="mt-2 border-l border-border-strong py-0.5 pl-3 text-body-1 text-fg"
                >
                  {{ shoutoutMessage(activity) }}
                </blockquote>

                <!-- The event a shout-out points at. A ruled row, not a tinted
                     block: a panel inside a panel is one container too many. -->
                <NuxtLink
                  v-if="activity.event && !namedEvent(activity)"
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
              </div>
            </div>
          </li>
        </ul>

        <!-- Scrolling this into view fetches the next page. It is also the
             manual fallback: without IntersectionObserver, or if a page fails,
             the button is still there to press. -->
        <div ref="sentinel" class="pt-4 text-center">
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
</template>
