/**
 * Generates a social mixer schedule for an open play session.
 *
 * Two ways to fill a court exist now:
 *
 *   - **Queue** — first come, first served. Whoever has waited longest plays
 *     next, with whoever they turned up with. This is what `event-queue.service`
 *     already does and it is the right answer for a drop-in session.
 *
 *   - **Mixup** — rotate partners *and* opponents across the whole session, so
 *     that as far as possible nobody partners the same person twice and repeats
 *     opponents as little as possible. This is the "everyone plays with
 *     everyone" format club nights actually run.
 *
 * Deliberately a pure function: players + courts + rounds in, a schedule out,
 * with no repository, no clock and no randomness unless a seed is passed. This
 * is the most intricate logic in the phase and the only way to be confident in
 * it is to be able to run it a thousand times in a unit test.
 *
 * The algorithm is greedy rather than optimal. Producing a perfect rotation is a
 * combinatorial design problem (a Whist tournament / social golfer problem) with
 * no general closed form, and an organiser wants a good schedule in
 * milliseconds, not a perfect one eventually. Greedy with a cost function gets
 * within a game or two of optimal for the sizes a club actually plays.
 */

export interface MixupPlayer {
  /** The queue entry, which is what a court is eventually pointed at. */
  queue_id: string
  player_id: string
}

export interface MixupTeam {
  /** One player for singles, two for doubles. */
  players: MixupPlayer[]
}

export interface MixupMatch {
  court_number: number
  team1: MixupTeam
  team2: MixupTeam
}

export interface MixupRound {
  round_number: number
  matches: MixupMatch[]
  /** Players not in a match this round. Rotates, so nobody sits out twice early. */
  sitting_out: MixupPlayer[]
}

export interface MixupSchedule {
  rounds: MixupRound[]
  /** How many times each player is scheduled to play. For the preview. */
  gamesPerPlayer: Record<string, number>
}

export interface MixupOptions {
  players: MixupPlayer[]
  courts: number
  rounds: number
  format: 'singles' | 'doubles'
  /** Fixed seed makes the preview the organiser approves the one they get. */
  seed?: number
}

/**
 * Deterministic PRNG (mulberry32).
 *
 * `Math.random()` would mean the preview an organiser looks at is not the
 * schedule they commit, which makes the preview a lie. A seed also makes every
 * test reproducible.
 */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Stable key for a pair of players, so A|B and B|A count as the same pairing. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Weights, and why they are these numbers.
 *
 * Repeating a *partner* is the thing a mixer exists to avoid, so it costs most.
 * Repeating an *opponent* is much less noticeable — in a session of eight people
 * you will face everyone repeatedly no matter what — so it costs a fraction as
 * much. Sitting out is scored separately and dominates both, because a player
 * who misses two rounds while someone else misses none has had a worse evening
 * than anyone who partnered the same person twice.
 */
const PARTNER_REPEAT_COST = 10
const OPPONENT_REPEAT_COST = 1

/** One greedy pass at the given seed. Wrapped by generateMixupSchedule below. */
function buildSchedule(options: MixupOptions, seed: number): MixupSchedule {
  const { players, courts, rounds, format } = options
  const teamSize = format === 'doubles' ? 2 : 1
  const perMatch = teamSize * 2

  const random = makeRandom(seed)

  const rounds_: MixupRound[] = []
  const partnerCounts = new Map<string, number>()
  const opponentCounts = new Map<string, number>()
  const sitOutCounts = new Map<string, number>()
  const gamesPerPlayer: Record<string, number> = {}

  for (const p of players) {
    sitOutCounts.set(p.player_id, 0)
    gamesPerPlayer[p.player_id] = 0
  }

  if (players.length < perMatch || courts < 1 || rounds < 1) {
    return { rounds: [], gamesPerPlayer }
  }

  const playersPerRound = Math.min(courts * perMatch, players.length - (players.length % perMatch))

  for (let round = 1; round <= rounds; round++) {
    // Who plays this round.
    //
    // MOST sit-outs first: the players taken are `slice(0, playersPerRound)`,
    // so whoever has missed the most rounds has to sort to the *front* to get
    // picked. Sorting ascending — the intuitive reading of "fewest sit-outs
    // first" — benches the same people every single round, which is what the
    // unit tests caught.
    //
    // Shuffled before sorting so that players on an equal count do not always
    // resolve in the same order; Array.sort is stable, so the shuffle survives
    // as the tiebreak.
    const ordered = shuffle(players, random).sort(
      (a, b) => (sitOutCounts.get(b.player_id) ?? 0) - (sitOutCounts.get(a.player_id) ?? 0)
    )

    const playing = ordered.slice(0, playersPerRound)
    const sitting = ordered.slice(playersPerRound)

    for (const p of sitting) {
      sitOutCounts.set(p.player_id, (sitOutCounts.get(p.player_id) ?? 0) + 1)
    }

    const matches: MixupMatch[] = []
    const pool = [...playing]

    let court = 1
    while (pool.length >= perMatch && court <= courts) {
      const match = pickMatch(pool, teamSize, court)
      matches.push(match)
      court++
    }

    for (const match of matches) {
      recordMatch(match)
    }

    rounds_.push({ round_number: round, matches, sitting_out: sitting })
  }

  return { rounds: rounds_, gamesPerPlayer }

  /**
   * Builds one match out of the pool, removing the players it uses.
   *
   * Greedy: take the first available player as an anchor, then choose each
   * remaining slot by whichever candidate adds the least cost. Anchoring on the
   * first player rather than searching all combinations is what keeps this
   * linear enough to run on every "Generate" click.
   */
  function pickMatch(pool: MixupPlayer[], size: number, courtNumber: number): MixupMatch {
    const take = (index: number) => pool.splice(index, 1)[0]

    const team1: MixupPlayer[] = [take(0)]
    while (team1.length < size) {
      team1.push(take(bestIndex(pool, (candidate) => partnerCost(team1, candidate))))
    }

    const team2: MixupPlayer[] = [take(bestIndex(pool, (c) => opponentCost(team1, c)))]
    while (team2.length < size) {
      team2.push(
        take(
          bestIndex(
            pool,
            (candidate) => partnerCost(team2, candidate) + opponentCost(team1, candidate)
          )
        )
      )
    }

    return {
      court_number: courtNumber,
      team1: { players: team1 },
      team2: { players: team2 }
    }
  }

  function bestIndex(pool: MixupPlayer[], cost: (p: MixupPlayer) => number): number {
    let best = 0
    let bestCost = Infinity
    for (let i = 0; i < pool.length; i++) {
      const c = cost(pool[i])
      if (c < bestCost) {
        bestCost = c
        best = i
      }
    }
    return best
  }

  function partnerCost(team: MixupPlayer[], candidate: MixupPlayer): number {
    let cost = 0
    for (const member of team) {
      cost +=
        (partnerCounts.get(pairKey(member.player_id, candidate.player_id)) ?? 0) *
        PARTNER_REPEAT_COST
    }
    return cost
  }

  function opponentCost(team: MixupPlayer[], candidate: MixupPlayer): number {
    let cost = 0
    for (const member of team) {
      cost +=
        (opponentCounts.get(pairKey(member.player_id, candidate.player_id)) ?? 0) *
        OPPONENT_REPEAT_COST
    }
    return cost
  }

  function recordMatch(match: MixupMatch) {
    const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)

    for (const team of [match.team1, match.team2]) {
      for (let i = 0; i < team.players.length; i++) {
        gamesPerPlayer[team.players[i].player_id] += 1
        for (let j = i + 1; j < team.players.length; j++) {
          bump(partnerCounts, pairKey(team.players[i].player_id, team.players[j].player_id))
        }
      }
    }

    for (const a of match.team1.players) {
      for (const b of match.team2.players) {
        bump(opponentCounts, pairKey(a.player_id, b.player_id))
      }
    }
  }
}

/**
 * How bad a schedule is. Lower is better; 0 is a perfect rotation.
 *
 * Only *repeats* are counted - the first time two people partner costs nothing,
 * because that is the schedule doing its job. Weighted the same way the greedy
 * step is, so the restart wrapper and the inner loop agree about what "good"
 * means rather than optimising for different things.
 */
function scheduleCost(schedule: MixupSchedule): number {
  const partners = new Map<string, number>()
  const opponents = new Map<string, number>()

  for (const round of schedule.rounds) {
    for (const match of round.matches) {
      for (const team of [match.team1, match.team2]) {
        for (let i = 0; i < team.players.length; i++) {
          for (let j = i + 1; j < team.players.length; j++) {
            const key = pairKey(team.players[i].player_id, team.players[j].player_id)
            partners.set(key, (partners.get(key) ?? 0) + 1)
          }
        }
      }
      for (const a of match.team1.players) {
        for (const b of match.team2.players) {
          const key = pairKey(a.player_id, b.player_id)
          opponents.set(key, (opponents.get(key) ?? 0) + 1)
        }
      }
    }
  }

  let cost = 0
  for (const count of partners.values()) cost += (count - 1) * PARTNER_REPEAT_COST
  for (const count of opponents.values()) cost += (count - 1) * OPPONENT_REPEAT_COST

  // An uneven number of games is worse than any pairing repeat: a player who
  // got two fewer games has had a worse evening than one who partnered the same
  // person twice.
  const games = Object.values(schedule.gamesPerPlayer)
  if (games.length > 0) {
    cost += (Math.max(...games) - Math.min(...games)) * PARTNER_REPEAT_COST * 5
  }

  return cost
}

/**
 * How many greedy attempts to make before keeping the best.
 *
 * A single greedy pass gets close but reliably misses the perfect rotation on
 * the canonical case (8 players, 2 courts, 7 rounds - every player partners each
 * of the other seven exactly once), because one early arbitrary choice can rule
 * it out. Restarting from a different shuffle costs microseconds and finds it.
 *
 * 24 is well past the point where more attempts stop helping at club sizes, and
 * the whole thing still runs in a few milliseconds on a "Generate" click.
 */
const RESTARTS = 24

/**
 * The public entry point: best of several greedy attempts.
 *
 * Deterministic despite the restarts - the seeds are derived from the caller's
 * seed, so the same input always yields the same schedule and the preview an
 * organiser approves is the one they commit.
 */
export function generateMixupSchedule(options: MixupOptions): MixupSchedule {
  const baseSeed = options.seed ?? 1

  let best = buildSchedule(options, baseSeed)
  let bestCost = scheduleCost(best)

  for (let attempt = 1; attempt < RESTARTS && bestCost > 0; attempt++) {
    // Spread the derived seeds well apart: consecutive integers give mulberry32
    // similar early output, so nearby seeds would produce near-identical
    // shuffles and waste the restart.
    const candidate = buildSchedule(options, baseSeed + attempt * 0x9e3779b1)
    const cost = scheduleCost(candidate)
    if (cost < bestCost) {
      best = candidate
      bestCost = cost
    }
  }

  return best
}
