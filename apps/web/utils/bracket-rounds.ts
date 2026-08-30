/**
 * The bracket generator encodes a match's phase in its round number rather than
 * in a column (see `bracket.service.ts`): knockout rounds count from 1, pools
 * start at 10, playoffs at 50, the losers bracket at 100, and the grand final
 * is 200. Rendering the raw number produced labels like "Round 51" and
 * "Round 200".
 *
 * This lived inside `pages/tournaments/[tournamentId].vue`. It moved out when
 * the page split into per-category views, because the Matchups view and the
 * Queue view both need it and neither should own it.
 */

import type {
  BracketDto,
  BracketMatchDto,
  BracketParticipantDto
} from '~/server/domains/event/dto/bracket.dto'

/**
 * How many of each pool go through to the playoff.
 *
 * PRODUCT DECISION, not a derived fact — see the ADR. It lives here rather than
 * in the generator because the pool tables have to draw the qualifying line in
 * the same place the seeding applies it.
 */
export const QUALIFIERS_PER_POOL = 2

export const POOL_ROUND_OFFSET = 10
export const PLAYOFF_ROUND_OFFSET = 50
export const LOSERS_ROUND_OFFSET = 100
export const GRAND_FINAL_ROUND = 200

/**
 * The decider, played only when the losers-bracket entrant wins the grand
 * final.
 *
 * In a strict double elimination the player coming up the losers bracket has
 * lost once and the winners finalist has not. If the losers player wins the
 * grand final both have one loss, so the title cannot be awarded on that game
 * alone. Without this round the format quietly eliminated someone on a single
 * defeat, which is the one thing double elimination exists to prevent.
 */
export const GRAND_FINAL_RESET_ROUND = 201

export function isPoolRound(round: number): boolean {
  return round >= POOL_ROUND_OFFSET && round < PLAYOFF_ROUND_OFFSET
}

export function isPlayoffRound(round: number): boolean {
  return round >= PLAYOFF_ROUND_OFFSET && round < LOSERS_ROUND_OFFSET
}

export function isLosersRound(round: number): boolean {
  return round >= LOSERS_ROUND_OFFSET && round < GRAND_FINAL_ROUND
}

export function isGrandFinalReset(round: number): boolean {
  return round === GRAND_FINAL_RESET_ROUND
}

export function roundLabel(round: number): string {
  if (round === GRAND_FINAL_RESET_ROUND) return 'Grand Final (decider)'
  if (round === GRAND_FINAL_ROUND) return 'Grand Final'
  if (isLosersRound(round)) return `Losers Round ${round - LOSERS_ROUND_OFFSET}`
  if (isPlayoffRound(round)) return `Playoff Round ${round - PLAYOFF_ROUND_OFFSET}`
  if (isPoolRound(round)) {
    // Pool A, Pool B, … reads better than a number for parallel groups.
    return `Pool ${String.fromCharCode(65 + (round - POOL_ROUND_OFFSET))}`
  }
  return `Round ${round}`
}

/**
 * The phase a round belongs to, in the order the phases are played. Matchups
 * renders them in this order, so a pool-play draw reads Pools → Playoffs and a
 * double elimination reads Winners → Losers → Grand Final without the view
 * having to know which format produced it.
 */
export type BracketPhase = 'pools' | 'winners' | 'playoffs' | 'losers' | 'grand_final'

export const PHASE_ORDER: BracketPhase[] = ['pools', 'winners', 'playoffs', 'losers', 'grand_final']

export const PHASE_LABELS: Record<BracketPhase, string> = {
  pools: 'Pools',
  winners: 'Winners Bracket',
  playoffs: 'Playoffs',
  losers: 'Losers Bracket',
  grand_final: 'Grand Final'
}

export function phaseOf(round: number): BracketPhase {
  if (round === GRAND_FINAL_ROUND || round === GRAND_FINAL_RESET_ROUND) return 'grand_final'
  if (isLosersRound(round)) return 'losers'
  if (isPlayoffRound(round)) return 'playoffs'
  if (isPoolRound(round)) return 'pools'
  return 'winners'
}

/**
 * The match that decides the category — a grand final where one exists, and
 * otherwise the last match of the deciding knockout.
 *
 * Pools are never the final: they feed one. The losers bracket is never the
 * final either, whatever its round number: it exists to send someone back to
 * the winners side, and it sorts above every other offset only because the
 * generator needed somewhere to put it.
 */
export function finalMatchOf(bracket: BracketDto | null): BracketMatchDto | null {
  const rounds = bracket?.rounds ?? []

  // The decider outranks the grand final when it has actually been played:
  // it only exists because the grand final failed to settle the title.
  const reset = rounds.find((round) => round.round === GRAND_FINAL_RESET_ROUND)
  const resetMatch = reset?.matches[0]
  if (resetMatch?.winner_registration_id) return resetMatch

  const grandFinal = rounds.find((round) => round.round === GRAND_FINAL_ROUND)
  if (grandFinal?.matches.length) return grandFinal.matches[0]

  const deciding = rounds
    .filter(
      (round) =>
        !isPoolRound(round.round) &&
        !isLosersRound(round.round) &&
        round.round !== GRAND_FINAL_RESET_ROUND
    )
    .sort((a, b) => b.round - a.round)[0]
  if (!deciding?.matches.length) return null

  return [...deciding.matches].sort((a, b) => a.position - b.position)[0]
}

/**
 * Who won the whole thing, or null while it is still being played.
 *
 * Reads the final's winner rather than "whoever has the most wins": a knockout
 * champion is the person who won the last match, and in a draw with byes those
 * two answers differ.
 */
export function championOf(bracket: BracketDto | null): BracketParticipantDto | null {
  const final = finalMatchOf(bracket)
  if (!final?.winner_registration_id) return null

  if (final.winner_registration_id === final.participant1_registration_id) return final.participant1
  if (final.winner_registration_id === final.participant2_registration_id) return final.participant2
  return null
}

/**
 * Where each round's matches sit on a shared grid, so connector lines land.
 *
 * The tree used to distribute matches with `justify-around` and assume that put
 * the two feeders of a slot at exactly 25% and 75% of their pair, and the slot
 * they feed at 50%. Four things broke that assumption in practice:
 *
 *  1. a `gap` between the flex children shifts every centre by `gap/4`;
 *  2. cards are not equal height — a bye carries an extra line, and a card with
 *     set scores is taller than one without — and `space-around` centres by
 *     FREE space, so unequal children move the fractions;
 *  3. the losers bracket does not halve (an 8-draw emits 2, 2, 1, 1), so
 *     pairing matches two-at-a-time drew joiners into rounds that had two
 *     slots, not one;
 *  4. an odd match count left a lone node whose stub drew into empty space.
 *
 * Every one of those is the same mistake: inferring position from layout. The
 * fix is to state it. Each column becomes a grid over the same number of leaf
 * rows, and a match in round *i* spans `2^i` of them — so its centre is exact
 * regardless of card height, gaps, or parity, and the whole thing needs no
 * measurement and no SVG.
 *
 * Returns the row count for the grid and, per round, the span each match takes.
 * `connected: false` for a set of rounds that do not halve, which is the signal
 * to render them as plain columns rather than drawing lines that would lie.
 */
export interface BracketGrid {
  /** Total grid rows every column shares. */
  rows: number
  /** Row span of one match in each round, indexed as the rounds were given. */
  spans: number[]
  /**
   * Whether these rounds form a real single-elimination tree — each round
   * exactly half the previous. Only then do connector lines mean anything.
   */
  connected: boolean
}

export function bracketGridRows(matchCounts: readonly number[]): BracketGrid {
  if (!matchCounts.length) return { rows: 0, spans: [], connected: false }

  const first = matchCounts[0]
  // Leaf rows are driven by the widest round, so every column covers the same
  // vertical band whatever its own match count.
  const rows = Math.max(...matchCounts) * 2

  const connected =
    matchCounts.length === 1 ||
    (matchCounts.every((count, i) => i === 0 || count === Math.max(1, matchCounts[i - 1] / 2)) &&
      Number.isInteger(Math.log2(first)))

  const spans = matchCounts.map((count) => (count > 0 ? rows / count : rows))

  return { rows, spans, connected }
}
