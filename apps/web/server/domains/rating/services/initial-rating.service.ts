import {
  QUESTION_BANK,
  SKILL_DIMENSIONS,
  type AssessmentQuestion,
  type SkillDimension
} from '../data/question-bank'
import { RATING_MIN } from './rating.service'

/**
 * Initial Skill Rating (provisional rating) model — pure, deterministic, no I/O.
 *
 * Turns a full set of questionnaire answers into a provisional starting rating
 * plus a reliability grade. This is the seed the match engine
 * (rating.service.ts) then moves with real results; it is deliberately NOT a
 * claim of an official rating from any external body.
 *
 * Shape of the calculation (see docs/18-ADR-INDEX.md, ADR-001 "Initial rating"):
 *
 *   1. dimension score   = mean of that dimension's answers (already on the
 *                          rating scale — see question-bank.ts)
 *   2. technical rating  = Σ weight[d] · dimension[d]
 *   3. execution cap     = mean(consistency, strategy) + 0.5
 *                          Clean shots without repeatable, well-chosen play do
 *                          not make a high-level player; consistency and
 *                          decision-making bound what the stroke answers can
 *                          claim.
 *   4. evidence caps     = playing history cap, competitive-experience cap
 *                          (a player with a handful of sessions cannot seed
 *                          above 3.0; nobody seeds at 5.0+ without organised
 *                          competition behind it)
 *   5. competition bonus = small lift for demonstrated high-level results, only
 *                          when the technical profile already sits at 4.75+
 *   6. self-level blend  = the "who can you compete with" answer is a SECONDARY
 *                          signal: a small blend when it agrees, ignored when it
 *                          claims more than the technical answers support,
 *                          weighted a little more when it claims less.
 *   7. clamp to [2.0, 5.5] and round to 0.1 — a questionnaire cannot honestly
 *                          distinguish 3.27 from 3.31.
 *
 * INITIAL_RATING_ALGORITHM_VERSION is stamped on every stored assessment so the
 * answers can be re-scored if the model changes; bump it, never edit in place.
 */
export const INITIAL_RATING_ALGORITHM_VERSION = 2

/** Ceiling for a questionnaire-derived rating. 5.5 is the "Pro" anchor; anything
 * above it must be earned through match results. */
export const INITIAL_RATING_MAX = 5.5

export const INITIAL_RATING_STEP = 0.1

export const SKILL_DIMENSION_WEIGHTS: Record<SkillDimension, number> = {
  serve_return: 0.1,
  groundstrokes: 0.1,
  dinking: 0.15,
  third_shot: 0.15,
  net_game: 0.15,
  positioning: 0.1,
  strategy: 0.15,
  consistency: 0.1
}

/** How far above the execution constraint (mean of consistency + strategy) the
 * stroke answers are allowed to pull the rating. */
export const EXECUTION_CAP_MARGIN = 0.5

/** Dimension spread at which a profile is flagged as uneven. */
export const UNEVEN_PROFILE_SPREAD = 1.5

/** Technical rating a player must already show before competitive results add
 * anything on top. */
export const COMPETITION_BONUS_FLOOR = 4.75

/** Self-reported competitive level: agreement window and blend weights. */
export const SELF_LEVEL_AGREEMENT_WINDOW = 0.5
export const SELF_LEVEL_WEIGHT_AGREES = 0.15
export const SELF_LEVEL_WEIGHT_BELOW = 0.25

export type AssessmentReliability = 'high' | 'medium' | 'low'

/**
 * Seed for player_ratings.confidence_score, by reliability. confidence_score is
 * the match engine's rating-VARIANCE parameter (higher = less certain — see
 * decayConfidence in rating.service.ts). A low-reliability questionnaire is a
 * genuinely higher-variance estimate, so it is seeded slightly wider and absorbs
 * a little more of a doubles team's rating delta than a well-evidenced partner
 * until match results tighten it. 1.0 is the pre-existing default and remains
 * the medium value, so the engine's behaviour for a typical player is unchanged.
 */
export const INITIAL_CONFIDENCE_BY_RELIABILITY: Record<AssessmentReliability, number> = {
  high: 0.85,
  medium: 1.0,
  low: 1.2
}

export type ProvisionalRatingFlag =
  /** Dimension scores spread ≥ UNEVEN_PROFILE_SPREAD apart. */
  | 'uneven_profile'
  /** Stroke answers were held down by consistency/strategy. */
  | 'execution_capped'
  /** Playing-history or competition answers bounded the rating. */
  | 'experience_capped'
  /** Self-reported competitive level exceeds what the technical answers support. */
  | 'self_report_above_evidence'
  /** Self-reported competitive level is well below the technical answers. */
  | 'self_report_below_evidence'

export interface AssessmentAnswer {
  questionId: string
  choiceIndex: number
}

export interface ProvisionalRatingResult {
  /** The provisional rating to seed player_ratings with (2.0–5.5, 0.1 steps). */
  rating: number
  /** Weighted technical score before any cap or calibration, 0.01 precision. */
  technical_rating: number
  dimension_scores: Record<SkillDimension, number>
  self_reported_level: number
  reliability: AssessmentReliability
  /** Variance seed for player_ratings.confidence_score. */
  confidence_score: number
  flags: ProvisionalRatingFlag[]
  /** Resolved answers, for storage — what was chosen and what it scored. */
  answers: Array<{ question_id: string; choice_index: number; score: number }>
}

export class InitialRatingValidationError extends Error {
  constructor(
    public readonly code: 'INVALID_INPUT' | 'INVALID_QUESTION' | 'INVALID_CHOICE',
    message: string
  ) {
    super(message)
  }
}

const QUESTION_BY_ID = new Map(QUESTION_BANK.map((q) => [q.id, q]))

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function round(value: number, step: number): number {
  return Math.round(value / step) * step
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100
}

interface ResolvedAnswer {
  question: AssessmentQuestion
  choiceIndex: number
  score: number
}

/** Validates that every question in the bank is answered exactly once with a
 * valid choice. Throws InitialRatingValidationError otherwise. */
function resolveAnswers(answers: AssessmentAnswer[]): ResolvedAnswer[] {
  if (!Array.isArray(answers) || answers.length !== QUESTION_BANK.length) {
    throw new InitialRatingValidationError(
      'INVALID_INPUT',
      `All ${QUESTION_BANK.length} questions must be answered.`
    )
  }

  const seen = new Set<string>()
  const resolved: ResolvedAnswer[] = []
  for (const answer of answers) {
    const question = QUESTION_BY_ID.get(answer?.questionId)
    if (!question) {
      throw new InitialRatingValidationError(
        'INVALID_QUESTION',
        `Unknown question: ${answer?.questionId}`
      )
    }
    if (seen.has(question.id)) {
      throw new InitialRatingValidationError(
        'INVALID_INPUT',
        `Question answered more than once: ${question.id}`
      )
    }
    const choice =
      Number.isInteger(answer.choiceIndex) && answer.choiceIndex >= 0
        ? question.choices[answer.choiceIndex]
        : undefined
    if (!choice) {
      throw new InitialRatingValidationError(
        'INVALID_CHOICE',
        `Invalid choice for question: ${question.id}`
      )
    }
    seen.add(question.id)
    resolved.push({ question, choiceIndex: answer.choiceIndex, score: choice.score })
  }
  return resolved
}

function scoreOf(resolved: ResolvedAnswer[], category: AssessmentQuestion['category']): number {
  const scores = resolved.filter((r) => r.question.category === category).map((r) => r.score)
  return mean(scores)
}

/** Extra lift for demonstrated competitive results, keyed on the COMP-001 choice
 * index. Only applied once the technical profile is already at COMPETITION_BONUS_FLOOR. */
function competitionBonus(choiceIndex: number): number {
  switch (choiceIndex) {
    case 3:
      return 0.25 // medals in advanced/open divisions or regional/national events
    case 4:
      return 0.5 // professional / prize-money events
    default:
      return 0
  }
}

function gradeReliability(input: {
  spread: number
  experienceChoice: number
  competitionChoice: number
  selfDiff: number
  experienceCapped: boolean
}): AssessmentReliability {
  // Brand-new players are low-confidence by definition: there is nothing to be
  // consistent about yet.
  if (input.experienceChoice === 0) return 'low'

  let points = 0
  // Multiple skill areas agree.
  if (input.spread < 1.0) points += 2
  else if (input.spread < 1.75) points += 1
  // Playing history.
  points += input.experienceChoice >= 2 ? 2 : 1
  // Self-reported level vs technical evidence.
  const absDiff = Math.abs(input.selfDiff)
  if (absDiff <= SELF_LEVEL_AGREEMENT_WINDOW) points += 1
  else if (absDiff > 1.0) points -= 1
  // Any organised competition.
  if (input.competitionChoice > 0) points += 1
  // The answers claimed more than the playing history could support.
  if (input.experienceCapped) points -= 1

  if (points >= 5) return 'high'
  if (points >= 3) return 'medium'
  return 'low'
}

export function calculateProvisionalRating(answers: AssessmentAnswer[]): ProvisionalRatingResult {
  const resolved = resolveAnswers(answers)
  const flags: ProvisionalRatingFlag[] = []

  // 1–2. Dimension scores and the weighted technical rating.
  const dimensionScores = {} as Record<SkillDimension, number>
  let technical = 0
  for (const dimension of SKILL_DIMENSIONS) {
    const score = scoreOf(resolved, dimension)
    dimensionScores[dimension] = roundTo2(score)
    technical += SKILL_DIMENSION_WEIGHTS[dimension] * score
  }

  const dimensionValues = Object.values(dimensionScores)
  const spread = Math.max(...dimensionValues) - Math.min(...dimensionValues)
  if (spread >= UNEVEN_PROFILE_SPREAD) flags.push('uneven_profile')

  // 3. Execution constraint.
  const executionCap =
    mean([dimensionScores.consistency, dimensionScores.strategy]) + EXECUTION_CAP_MARGIN
  let rating = Math.min(technical, executionCap)
  if (technical - rating >= 0.25) flags.push('execution_capped')

  // 4. Evidence caps.
  const experience = resolved.find((r) => r.question.category === 'experience')!
  const competition = resolved.find((r) => r.question.category === 'competition')!
  const evidenceCap = Math.min(experience.score, competition.score)
  if (rating - evidenceCap >= 0.25) flags.push('experience_capped')
  rating = Math.min(rating, evidenceCap)

  // 5. Competition bonus — results only count on top of an already-elite profile.
  if (technical >= COMPETITION_BONUS_FLOOR) {
    rating = Math.min(rating + competitionBonus(competition.choiceIndex), evidenceCap)
  }

  // 6. Self-reported level as a secondary calibration signal.
  const selfLevel = resolved.find((r) => r.question.category === 'self_level')!
  const selfDiff = selfLevel.score - rating
  if (Math.abs(selfDiff) <= SELF_LEVEL_AGREEMENT_WINDOW) {
    rating = (1 - SELF_LEVEL_WEIGHT_AGREES) * rating + SELF_LEVEL_WEIGHT_AGREES * selfLevel.score
  } else if (selfDiff > 0) {
    // Never inflate on say-so; flag it and let matches settle the difference.
    flags.push('self_report_above_evidence')
  } else {
    rating = (1 - SELF_LEVEL_WEIGHT_BELOW) * rating + SELF_LEVEL_WEIGHT_BELOW * selfLevel.score
    flags.push('self_report_below_evidence')
  }

  // 7. Clamp and round. The caps are re-applied so the self-level blend can
  // never lift the result past what execution or playing history support.
  rating = Math.min(rating, executionCap, evidenceCap)
  rating = Math.min(Math.max(rating, RATING_MIN), INITIAL_RATING_MAX)
  rating = roundTo2(round(rating, INITIAL_RATING_STEP))

  const reliability = gradeReliability({
    spread,
    experienceChoice: experience.choiceIndex,
    competitionChoice: competition.choiceIndex,
    selfDiff,
    experienceCapped: flags.includes('experience_capped')
  })

  return {
    rating,
    technical_rating: roundTo2(technical),
    dimension_scores: dimensionScores,
    self_reported_level: selfLevel.score,
    reliability,
    confidence_score: INITIAL_CONFIDENCE_BY_RELIABILITY[reliability],
    flags,
    answers: resolved.map((r) => ({
      question_id: r.question.id,
      choice_index: r.choiceIndex,
      score: r.score
    }))
  }
}
