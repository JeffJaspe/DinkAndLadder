<script setup lang="ts">
/**
 * The whole session in one scroll: what is on now, and what has been played.
 *
 * This replaces a split that never made sense to anybody but the code. Live
 * courts lived on a "Courts" tab and finished games on a "Matches" tab, so the
 * two halves of the same question - what is happening, and what just happened -
 * were behind different clicks, drawn in different shapes, and a player who
 * wanted to know when they were next had to check both.
 *
 * Every match is its own row, carrying all four names. That is not a style
 * choice: open play has no draw, so partners and opponents are redrawn every
 * round and nothing about a match can be inferred from the one above it. A row
 * that leaned on a heading to say who was playing would be unreadable here in
 * a way it never is in a bracket.
 *
 * Rounds survive only as dividers with a progress count, because "how far
 * through this wave are we" is the one question a waiting player has that a
 * flat list cannot answer.
 *
 * Rows are `MatchCard`, the same component the draw and the score panel use -
 * one result, one rendering, everywhere. The tall card this used to draw is
 * now only for scoring a court, on its own page, where it belongs.
 */
import type { GameRules } from '~/utils/game-rules'
import type { EventCourtDto, LiveGameScore } from '~/server/domains/event/dto/event.dto'
import type { MatchListItemDto } from '~/server/domains/match/dto/match-join-row.dto'
import type { BoxScoreMatch } from '~/components/match/BoxScore.vue'

const props = defineProps<{
  eventId: string
  courts: EventCourtDto[]
  matches: MatchListItemDto[]
  /** The wave the session is on, from the event. */
  currentRound: number
  /**
   * Courts the session runs on, from `events.queue_courts`.
   *
   * Not `courts.length`: court rows are only materialised when an event is
   * started, so an event that was never started has none, and dividing by zero
   * courts gave every match a round of its own - fifteen matches, sixteen
   * rounds, one row each.
   */
  courtCount: number
  canManage: boolean
  busyCourtId: string | null
  loading?: boolean
  /**
   * The session's scoring rules, from the event. See 054.
   *
   * Passed through rather than re-derived on each card: every court in one
   * session is played to the same rule, and two cards disagreeing about when a
   * game is finished is exactly the bug this replaces.
   */
  rules?: GameRules | null
}>()

const emit = defineEmits<{
  score: [courtId: string, scores: LiveGameScore[]]
  submit: [courtId: string]
  start: [courtId: string]
}>()

const playingCourts = computed(() => props.courts.filter((c) => c.status === 'playing'))

/**
 * Courts with nobody on them.
 *
 * Organisers only. A free court is a thing to *do* something about, and to
 * anyone who cannot start a game it is just an empty box between the games
 * they came to watch.
 */
const freeCourts = computed(() =>
  props.canManage ? props.courts.filter((c) => c.status !== 'playing') : []
)

/**
 * Empty map: every match now carries its real `event_round` from 052, so the
 * `?? ...` fallbacks below read the column, which is what they were written
 * for. Kept as a computed rather than inlined so the fallbacks did not have to
 * be rewritten when the guessed rounds were removed.
 */
const displayRounds = computed(() => ({
  roundByMatchId: new Map<string, number>(),
  currentRound: props.currentRound
}))

/** Newest wave first by default: what is on now is what is being asked about. */
const newestFirst = ref(true)

type BoardEntry = BoxScoreMatch & { courtId: string | null }

interface RoundGroupData {
  round: number | null
  done: number
  total: number
  entries: BoardEntry[]
}

function names(side: EventCourtDto['team1']) {
  return side?.players.map((p) => ({ name: p.display_name, playerId: p.id })) ?? [{ name: 'TBC' }]
}

const groups = computed<RoundGroupData[]>(() => {
  const byRound = new Map<number, RoundGroupData>()

  const bucket = (round: number) => {
    const existing = byRound.get(round)
    if (existing) return existing
    const created: RoundGroupData = { round, done: 0, total: 0, entries: [] }
    byRound.set(round, created)
    return created
  }

  const sessionRound = displayRounds.value.currentRound

  for (const court of playingCourts.value) {
    // A court playing with no round stamped on it predates 052; it belongs to
    // whatever wave is running now, which is the only true thing we can say.
    const games = court.live_score ?? []
    bucket(court.round_number ?? sessionRound).entries.push({
      id: `court-${court.id}`,
      courtId: court.id,
      teams: [names(court.team1), names(court.team2)] as BoxScoreMatch['teams'],
      games: games.map((g) => ({ team1_score: g.team1_score, team2_score: g.team2_score })),
      context: court.court_name || `Court ${court.court_number}`,
      // 1-based, and only while there is a game to be on.
      liveGame: games.length || 1,
      complete: false
    })
  }

  const unrounded: BoardEntry[] = []

  for (const match of props.matches) {
    const round = match.event_round ?? displayRounds.value.roundByMatchId.get(match.id) ?? null

    const side = (team: 1 | 2) =>
      match.participants
        .filter((p) => p.team_number === team)
        .map((p) => ({ name: p.display_name ?? 'Unknown player', playerId: p.player_id }))

    // The recorded result, not one re-derived from the games: seriesWinner
    // applies win-by-two, so a house "first to 11" ending 11-10 resolves to
    // nobody and the row reads FINAL with no tick against either name.
    const wonBy = (team: 1 | 2) =>
      match.participants.some((p) => p.team_number === team && p.result_status === 'won')

    const entry: BoardEntry = {
      id: match.id,
      courtId: null,
      teams: [side(1), side(2)] as BoxScoreMatch['teams'],
      games: match.scores.map((s) => ({
        team1_score: s.team1_score,
        team2_score: s.team2_score
      })),
      context: match.match_type === 'singles' ? 'Singles' : 'Doubles',
      winner: wonBy(1) ? 1 : wonBy(2) ? 2 : null,
      liveGame: null,
      complete: match.status === 'verified'
    }

    if (round == null) unrounded.push(entry)
    else bucket(round).entries.push(entry)
  }

  for (const group of byRound.values()) {
    group.total = group.entries.length
    group.done = group.entries.filter((e) => e.liveGame == null).length
  }

  // An empty round renders as a heading with nothing under it, which is how a
  // session that had not started yet showed "Round 16" over blank space.
  const ordered = [...byRound.values()]
    .filter((group) => group.entries.length > 0)
    .sort((a, b) =>
      newestFirst.value ? (b.round ?? 0) - (a.round ?? 0) : (a.round ?? 0) - (b.round ?? 0)
    )

  // Always last, whichever way the rounds are sorted: these are the matches
  // that belong to no wave, not the oldest or the newest ones.
  if (unrounded.length > 0) {
    ordered.push({
      round: null,
      done: unrounded.length,
      total: unrounded.length,
      entries: unrounded
    })
  }

  return ordered
})

const hasAnything = computed(() => groups.value.length > 0 || freeCourts.value.length > 0)

/**
 * Whether the score link should open a tab.
 *
 * Matched to Tailwind's `lg` (1024px), which is the same breakpoint the app
 * shell uses to swap the mobile bottom bar for the desktop sidebar — so "has a
 * desk" means the same thing here as it does everywhere else. Evaluated on the
 * client only; the server-rendered default is the in-place navigation, which
 * is the safe answer if the media query never runs.
 */
const opensInNewTab = ref(false)
onMounted(() => {
  const query = window.matchMedia('(min-width: 1024px)')
  opensInNewTab.value = query.matches
  const sync = (e: MediaQueryListEvent) => {
    opensInNewTab.value = e.matches
  }
  query.addEventListener('change', sync)
  onBeforeUnmount(() => query.removeEventListener('change', sync))
})
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading" class="space-y-2">
      <div v-for="i in 6" :key="i" class="h-14 animate-pulse rounded-card bg-surface" />
    </div>

    <template v-else>
      <!-- Free courts, above the rounds: they are the organiser's next action,
           not part of the record of play. -->
      <section v-if="freeCourts.length" class="space-y-3">
        <h3 class="font-display text-heading-3 text-fg">
          {{ freeCourts.length }} court{{ freeCourts.length === 1 ? '' : 's' }} free
        </h3>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <EventCourtCard
            v-for="court in freeCourts"
            :key="court.id"
            :court="court"
            :can-manage="canManage"
            :rules="rules"
            :busy="busyCourtId === court.id"
            @score="emit('score', court.id, $event)"
            @submit="emit('submit', court.id)"
            @start="emit('start', court.id)"
          />
        </div>
      </section>

      <div v-if="groups.length" class="flex items-center justify-end">
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 rounded-button border border-border-strong px-3 text-body-2 font-semibold text-fg-secondary transition-colors hover:border-primary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          @click="newestFirst = !newestFirst"
        >
          <UiIcon name="filter" size="h-3.5 w-3.5" />
          {{ newestFirst ? 'Newest round first' : 'Oldest round first' }}
        </button>
      </div>

      <EventRoundGroup
        v-for="group in groups"
        :key="group.round ?? 'unrounded'"
        :round="group.round"
        :done="group.done"
        :total="group.total"
      >
        <div v-for="entry in group.entries" :key="entry.id">
          <MatchCard :match="entry" />

          <!-- Scoring happens on its own page: a court is run from the desk
               for twenty minutes at a time, and doing that inside a feed that
               reorders itself underneath you is how a tap lands on the wrong
               court.

               A new tab only from `lg` up. That is the desk's working pattern —
               one tab per court, left open all session — and it is the wrong
               one on a phone, where the browser gives no visible way back and
               the organiser is stranded on a court page. Below `lg` the same
               link navigates in place and the app's own back control returns. -->
          <NuxtLink
            v-if="canManage && entry.courtId"
            :to="`/events/${eventId}/courts/${entry.courtId}/score`"
            :target="opensInNewTab ? '_blank' : undefined"
            :rel="opensInNewTab ? 'noopener' : undefined"
            class="mt-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-button px-3 py-2 text-body-2 font-semibold text-primary transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Score this court
            <UiIcon name="share" size="h-3.5 w-3.5" />
            <span v-if="opensInNewTab" class="sr-only">(opens in a new tab)</span>
          </NuxtLink>
        </div>
      </EventRoundGroup>

      <UiEmptyState
        v-if="!hasAnything"
        title="Nothing on court yet"
        message="Matches appear here the moment the first game starts."
      />
    </template>
  </div>
</template>
