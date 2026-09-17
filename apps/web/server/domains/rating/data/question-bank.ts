/**
 * Initial Skill Rating questionnaire — question content.
 *
 * Every skill question is a short statement about what happens in the player's
 * own games, answered on the SAME five-point frequency scale every time:
 *
 *     Never · Rarely · Sometimes · Usually · Always
 *
 * That uniformity is the point. Twenty questions is a lot to read if each one
 * carries five paragraphs of prose to compare; with one fixed scale the player
 * reads the statement, picks a frequency, and moves on. It also measures the
 * thing that matters — how *repeatably* they do it — rather than asking them to
 * match themselves to a description.
 *
 * Design rules the content follows (see ADR-001 in docs/18-ADR-INDEX.md):
 *
 * - Statements describe execution in a real game, never knowledge of a term.
 *   "I land a soft third shot in the kitchen" is askable; "I know what a
 *   third-shot drop is" is not, because agreeing costs nothing.
 * - Each dimension is covered by one CORE statement (basic competence, tops out
 *   around 4.5) and one ADVANCED statement (deliberate, high-level execution,
 *   tops out at 5.5). A beginner answers "Usually" to the core one and "Never"
 *   to the advanced one, which is what separates the levels — no single
 *   question has to carry the whole range.
 * - Scores sit directly on the platform rating scale, so a dimension's score is
 *   the mean of its two answers and the model in
 *   `services/initial-rating.service.ts` needs no re-normalisation.
 * - Technical questions never mention numeric levels or "DUPR". The one that
 *   does (LVL-001) is a secondary calibration signal and pairs every number
 *   with a plain-language description.
 *
 * The set is FIXED (no random subset). The earlier bank served 7 of 31 questions
 * at random, so two players with identical skills could land half a point
 * apart purely from the draw. A fixed set is reproducible, comparable across
 * players, and lets the stored answers be re-scored if the model changes.
 */

export type SkillDimension =
  | 'serve_return'
  | 'groundstrokes'
  | 'dinking'
  | 'third_shot'
  | 'net_game'
  | 'positioning'
  | 'strategy'
  | 'consistency'

/** Non-technical inputs used only to calibrate / bound the technical estimate. */
export type CalibrationCategory = 'experience' | 'competition' | 'self_level'

export type QuestionCategory = SkillDimension | CalibrationCategory

export const SKILL_DIMENSIONS: readonly SkillDimension[] = [
  'serve_return',
  'groundstrokes',
  'dinking',
  'third_shot',
  'net_game',
  'positioning',
  'strategy',
  'consistency'
] as const

/** The one answer scale every skill statement uses. */
export const FREQUENCY_LABELS = ['Never', 'Rarely', 'Sometimes', 'Usually', 'Always'] as const

/**
 * What each frequency is worth, per statement tier — the rating a player who
 * answers that way is showing evidence for.
 *
 * A core skill done always is a solid club player (4.5), not an elite one; an
 * advanced skill done always is (5.5). "Sometimes" is deliberately much closer
 * to the bottom than the top of each row: occasional success is weak evidence,
 * which is the whole anti-inflation premise.
 */
export const TIER_SCORES = {
  core: [2.0, 2.4, 3.0, 3.8, 4.5],
  advanced: [2.0, 2.6, 3.4, 4.5, 5.5]
} as const

export type StatementTier = keyof typeof TIER_SCORES

export interface QuestionChoice {
  label: string
  /** Rating-scale value (2.0–5.5) this answer is evidence for. For calibration
   * questions the meaning is category-specific — see initial-rating.service.ts. */
  score: number
}

/**
 * How the client should present the choices.
 *
 * Declared here rather than inferred in the UI. The page used to guess from
 * label length (`every(label.length <= 12)`) — a character count standing in
 * for a width budget. At five columns in a 512px container each label gets
 * 76px of content box, and "Sometimes" needs 59px in Inter 500/14 but only
 * once the webfont has swapped in, so the layout the page chose was correct
 * or clipped depending on font timing. The question knows which shape it is.
 */
export type QuestionKind =
  /** One ordered frequency scale, presented as a single 5-stop control. */
  | 'scale'
  /** Distinct, sentence-length options, presented as a stacked list. */
  | 'list'

export interface AssessmentQuestion {
  id: string
  category: QuestionCategory
  question: string
  kind: QuestionKind
  /** Set on skill statements; absent on the three calibration questions. */
  tier?: StatementTier
  choices: QuestionChoice[]
}

function statement(
  id: string,
  category: SkillDimension,
  tier: StatementTier,
  text: string
): AssessmentQuestion {
  return {
    id,
    category,
    tier,
    kind: 'scale',
    question: text,
    choices: FREQUENCY_LABELS.map((label, i) => ({ label, score: TIER_SCORES[tier][i] }))
  }
}

export const QUESTION_BANK: AssessmentQuestion[] = [
  // ── Serve / Return ───────────────────────────────────────────────────────
  statement('SR-001', 'serve_return', 'core', 'My serve lands in and reaches deep in the box.'),
  statement(
    'SR-002',
    'serve_return',
    'advanced',
    'I return serve deep to a spot I picked, and get to the kitchen line behind it.'
  ),

  // ── Groundstrokes ────────────────────────────────────────────────────────
  statement(
    'GS-001',
    'groundstrokes',
    'core',
    'From the back of the court I can keep a forehand or backhand in play without rushing it.'
  ),
  statement(
    'GS-002',
    'groundstrokes',
    'advanced',
    'My backhand is as reliable as my forehand — I hit it to a target with pace instead of just getting it back.'
  ),

  // ── Dinking ──────────────────────────────────────────────────────────────
  statement(
    'DK-001',
    'dinking',
    'core',
    'When both teams are at the kitchen, I can keep dinking without popping the ball up.'
  ),
  statement(
    'DK-002',
    'dinking',
    'advanced',
    'In a dink rally I move my opponent around on purpose to force a ball I can attack.'
  ),

  // ── Third shot: drops and drives ─────────────────────────────────────────
  statement(
    'TS-001',
    'third_shot',
    'core',
    'After serving, my third shot lands softly in the kitchen or drives past them — not into the net or long.'
  ),
  statement(
    'TS-002',
    'third_shot',
    'advanced',
    'I choose between a drop and a drive based on the return I get, and execute the one I chose.'
  ),

  // ── Net game: volleys, blocks, resets ────────────────────────────────────
  statement(
    'NG-001',
    'net_game',
    'core',
    'At the kitchen line I can volley a ball back under control instead of missing or popping it up.'
  ),
  statement(
    'NG-002',
    'net_game',
    'advanced',
    'When a hard ball comes at me in the middle of the court, I block it softly into the kitchen and keep moving forward.'
  ),

  // ── Court positioning / partner movement ─────────────────────────────────
  statement(
    'PS-001',
    'positioning',
    'core',
    'After my team serves or returns, I get up to the kitchen line and stop there.'
  ),
  statement(
    'PS-002',
    'positioning',
    'advanced',
    'I move with my partner as a pair — when they get pulled wide, I slide across and cover the middle.'
  ),

  // ── Strategy / decision making ───────────────────────────────────────────
  statement(
    'ST-001',
    'strategy',
    'core',
    'I can tell which balls are safe to attack and which ones I should keep soft.'
  ),
  statement(
    'ST-002',
    'strategy',
    'advanced',
    'I spot an opponent’s weakness during a game and my team plays to it for the rest of the match.'
  ),
  statement(
    'ST-003',
    'strategy',
    'advanced',
    'At 9–9 in a close game I still pick the smart shot instead of forcing it or playing scared.'
  ),

  // ── Consistency / unforced errors ────────────────────────────────────────
  statement(
    'CS-001',
    'consistency',
    'core',
    'A whole game goes by without me giving away points on easy mistakes.'
  ),
  statement(
    'CS-002',
    'consistency',
    'advanced',
    'Against people at my level, points last long enough that someone has to earn them — they do not end in a shot or two.'
  ),

  // ── Calibration (not part of the weighted technical score) ───────────────
  // score = the highest provisional rating this much playing history supports.
  {
    id: 'EXP-001',
    category: 'experience',
    kind: 'list',
    question: 'How long have you been playing pickleball?',
    choices: [
      { label: 'Just started — a few sessions', score: 3.0 },
      { label: 'Under 6 months', score: 3.5 },
      { label: '6 months to 2 years', score: 4.5 },
      { label: 'Over 2 years', score: 5.5 }
    ]
  },
  // score = the highest provisional rating this much competitive evidence supports.
  {
    id: 'COMP-001',
    category: 'competition',
    kind: 'list',
    question: 'Have you played organised competition — leagues or tournaments?',
    choices: [
      { label: 'No, only casual games', score: 4.5 },
      { label: 'Yes, club or local events', score: 5.0 },
      { label: 'Yes, and I have medalled locally', score: 5.0 },
      { label: 'Medals in open divisions or regional events', score: 5.5 },
      { label: 'Professional or prize-money events', score: 5.5 }
    ]
  },
  // score = the level the player says they can compete with. Secondary signal only.
  {
    id: 'LVL-001',
    category: 'self_level',
    kind: 'list',
    question: 'Who could you play an even game against today?',
    choices: [
      { label: 'Other beginners still learning to rally', score: 2.25 },
      { label: 'Players who serve, return and keep short rallies going (2.5)', score: 2.5 },
      { label: 'Players who rally reliably and are learning to dink (3.0)', score: 3.0 },
      { label: 'Players with reliable dinks, drops and positioning (3.5)', score: 3.5 },
      { label: 'Players who reset and attack consistently (4.0)', score: 4.0 },
      { label: 'Strong tournament players with few errors (4.5)', score: 4.5 },
      { label: 'Elite players who rarely miss (5.0+)', score: 5.0 },
      { label: 'Professional level', score: 5.5 }
    ]
  }
]

/** The full questionnaire, in the order it is presented. */
export function getAssessmentQuestions(): AssessmentQuestion[] {
  return QUESTION_BANK
}

export interface RatingTier {
  min: number
  max: number
  name: string
  description: string
}

/**
 * The named bands the provisional rating falls into.
 *
 * Deliberately no `color`: each tier used to carry a literal hex, which was a
 * second nine-step colour ladder that no token backed and that stayed the same
 * value in dark mode. Nothing rendered it — every surface draws from
 * `tierForRating` instead — so it shipped through the API as a trap rather
 * than a contract. Tier colour belongs to the token system, not to this table.
 */
export const RATING_TIERS: RatingTier[] = [
  {
    min: 2.0,
    max: 2.49,
    name: 'Beginner',
    description: 'Just starting your pickleball journey'
  },
  {
    min: 2.5,
    max: 2.99,
    name: 'Novice',
    description: 'Learning the fundamentals'
  },
  {
    min: 3.0,
    max: 3.49,
    name: 'Intermediate',
    description: 'Developing consistent play'
  },
  {
    min: 3.5,
    max: 3.99,
    name: 'Advanced',
    description: 'Strong recreational player'
  },
  {
    min: 4.0,
    max: 4.49,
    name: 'Skilled',
    description: 'Competitive club player'
  },
  { min: 4.5, max: 4.99, name: 'Expert', description: 'Tournament-ready player' },
  { min: 5.0, max: 5.49, name: 'Pro', description: 'Elite competitive player' },
  { min: 5.5, max: 5.99, name: 'Elite', description: 'Top-tier competitor' },
  { min: 6.0, max: 8.0, name: 'Champion', description: 'Professional level' }
]

export function getTierForRating(rating: number): RatingTier {
  for (const tier of RATING_TIERS) {
    if (rating >= tier.min && rating <= tier.max) {
      return tier
    }
  }
  return RATING_TIERS[0]
}
