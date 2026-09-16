import { describe, expect, it } from 'vitest'
import {
  QUESTION_BANK,
  SKILL_DIMENSIONS,
  type SkillDimension
} from '../../server/domains/rating/data/question-bank'
import {
  INITIAL_CONFIDENCE_BY_RELIABILITY,
  INITIAL_RATING_MAX,
  InitialRatingValidationError,
  calculateProvisionalRating,
  type AssessmentAnswer
} from '../../server/domains/rating/services/initial-rating.service'
import { RATING_MIN } from '../../server/domains/rating/services/rating.service'

/**
 * Every skill statement is answered on the same frequency scale:
 * 0 Never · 1 Rarely · 2 Sometimes · 3 Usually · 4 Always. A profile sets one
 * frequency for the CORE statements (basic competence) and one for the
 * ADVANCED statements, which is what separates the levels.
 */
type Freq = 0 | 1 | 2 | 3 | 4

/** EXP-001: 0 just starting, 1 < 6 months, 2 6mo–2yr, 3 > 2 years. */
type Experience = 0 | 1 | 2 | 3
/** COMP-001: 0 none, 1 club/local events, 2 local medals, 3 open/regional medals, 4 pro. */
type Competition = 0 | 1 | 2 | 3 | 4
/** LVL-001: 0 beginners, 1 ~2.5, 2 ~3.0, 3 ~3.5, 4 ~4.0, 5 ~4.5, 6 5.0+, 7 pro. */
type SelfLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

interface Profile {
  /** Frequency for the core statements. */
  core: Freq
  /** Frequency for the advanced statements. */
  adv: Freq
  /** Per-dimension override (both of its statements). */
  dimensions?: Partial<Record<SkillDimension, Freq>>
  /** Per-question override, wins over the dimension and tier defaults. */
  questions?: Record<string, Freq>
  experience: Experience
  competition: Competition
  selfLevel: SelfLevel
}

function answersFor(profile: Profile): AssessmentAnswer[] {
  return QUESTION_BANK.map((q) => {
    switch (q.category) {
      case 'experience':
        return { questionId: q.id, choiceIndex: profile.experience }
      case 'competition':
        return { questionId: q.id, choiceIndex: profile.competition }
      case 'self_level':
        return { questionId: q.id, choiceIndex: profile.selfLevel }
      default:
        return {
          questionId: q.id,
          choiceIndex:
            profile.questions?.[q.id] ??
            profile.dimensions?.[q.category] ??
            (q.tier === 'core' ? profile.core : profile.adv)
        }
    }
  })
}

const rate = (profile: Profile) => calculateProvisionalRating(answersFor(profile))

describe('calculateProvisionalRating', () => {
  describe('realistic player profiles', () => {
    it('complete novice → ~2.0, low confidence', () => {
      const r = rate({ core: 0, adv: 0, experience: 0, competition: 0, selfLevel: 0 })
      expect(r.rating).toBe(2.0)
      expect(r.reliability).toBe('low')
    })

    it('casual beginner → 2.0–2.5', () => {
      const r = rate({
        core: 1,
        adv: 0,
        experience: 1,
        competition: 0,
        selfLevel: 0
      })
      expect(r.rating).toBeGreaterThanOrEqual(2.0)
      expect(r.rating).toBeLessThanOrEqual(2.5)
      expect(r.reliability).toBe('medium')
    })

    it('strong beginner → 2.5–3.0', () => {
      const r = rate({
        core: 2,
        adv: 0,
        experience: 1,
        competition: 0,
        selfLevel: 1
      })
      expect(r.rating).toBeGreaterThanOrEqual(2.5)
      expect(r.rating).toBeLessThan(3.0)
    })

    it('3.0 advanced beginner → ~3.0', () => {
      const r = rate({ core: 3, adv: 1, experience: 2, competition: 0, selfLevel: 2 })
      expect(r.rating).toBeGreaterThanOrEqual(2.9)
      expect(r.rating).toBeLessThanOrEqual(3.2)
    })

    it('3.5 intermediate → ~3.5', () => {
      const r = rate({
        core: 3,
        adv: 2,
        experience: 2,
        competition: 1,
        selfLevel: 3
      })
      expect(r.rating).toBeGreaterThanOrEqual(3.4)
      expect(r.rating).toBeLessThanOrEqual(3.7)
      expect(r.reliability).toBe('high')
    })

    it('4.0 advanced intermediate → ~4.0', () => {
      const r = rate({ core: 4, adv: 2, experience: 2, competition: 1, selfLevel: 4 })
      expect(r.rating).toBeGreaterThanOrEqual(3.9)
      expect(r.rating).toBeLessThanOrEqual(4.2)
      expect(r.flags).toEqual([])
    })

    it('4.5 advanced → 4.4–4.8', () => {
      const r = rate({
        core: 4,
        adv: 3,
        experience: 3,
        competition: 2,
        selfLevel: 5
      })
      expect(r.rating).toBeGreaterThanOrEqual(4.4)
      expect(r.rating).toBeLessThanOrEqual(4.8)
      expect(r.reliability).toBe('high')
    })

    it('5.0 expert with open-division medals → 5.0–5.4', () => {
      const r = rate({ core: 4, adv: 4, experience: 3, competition: 3, selfLevel: 6 })
      expect(r.rating).toBeGreaterThanOrEqual(5.0)
      expect(r.rating).toBeLessThanOrEqual(5.4)
    })

    it('pro with professional results → 5.5 (the questionnaire ceiling)', () => {
      const r = rate({ core: 4, adv: 4, experience: 3, competition: 4, selfLevel: 7 })
      expect(r.rating).toBe(INITIAL_RATING_MAX)
      expect(r.reliability).toBe('high')
    })
  })

  describe('anti-inflation: contradictory profiles', () => {
    it('excellent serve but poor consistency stays a beginner', () => {
      const r = rate({
        core: 1,
        adv: 0,
        dimensions: { serve_return: 4 },
        experience: 2,
        competition: 0,
        selfLevel: 1
      })
      expect(r.rating).toBeLessThan(3.0)
      expect(r.flags).toContain('uneven_profile')
    })

    it('knowing the third-shot drop scores no better than not knowing how to hit it', () => {
      const base: Profile = { core: 1, adv: 0, experience: 1, competition: 0, selfLevel: 1 }
      const knowsTheWord = rate({ ...base, questions: { 'TS-001': 1 } })
      const executesIt = rate({ ...base, questions: { 'TS-001': 3 } })
      expect(knowsTheWord.rating).toBeLessThanOrEqual(2.5)
      expect(executesIt.rating).toBeGreaterThan(knowsTheWord.rating)
    })

    it('strong strokes with weak strategy/consistency is capped, not averaged', () => {
      const r = rate({
        core: 4,
        adv: 4,
        dimensions: { positioning: 1, strategy: 1, consistency: 1 },
        experience: 2,
        competition: 0,
        selfLevel: 4
      })
      // A plain weighted average would be ~4.1; execution bounds it at 3.0.
      expect(r.technical_rating).toBeCloseTo(4.13, 2)
      expect(r.rating).toBeLessThanOrEqual(3.1)
      expect(r.flags).toContain('execution_capped')
      expect(r.flags).toContain('uneven_profile')
      expect(r.flags).toContain('self_report_above_evidence')
      expect(r.reliability).toBe('low')
    })

    it('a high self-reported level with weak answers is ignored and flagged', () => {
      const honest = rate({ core: 1, adv: 0, experience: 1, competition: 0, selfLevel: 1 })
      const inflated = rate({ core: 1, adv: 0, experience: 1, competition: 0, selfLevel: 6 })
      expect(inflated.rating).toBeLessThanOrEqual(honest.rating)
      expect(inflated.rating).toBeLessThanOrEqual(2.5)
      expect(inflated.flags).toContain('self_report_above_evidence')
      expect(inflated.reliability).toBe('low')
    })

    it('a beginner with one unusually strong skill stays around beginner level', () => {
      const r = rate({
        core: 1,
        adv: 0,
        dimensions: { dinking: 4 },
        experience: 1,
        competition: 0,
        selfLevel: 1
      })
      expect(r.rating).toBeLessThanOrEqual(3.0)
      expect(r.flags).toContain('uneven_profile')
    })

    it('a brand-new player claiming elite execution is bounded by playing history', () => {
      const r = rate({ core: 4, adv: 4, experience: 0, competition: 0, selfLevel: 7 })
      expect(r.rating).toBeLessThanOrEqual(3.0)
      expect(r.flags).toContain('experience_capped')
      expect(r.reliability).toBe('low')
    })

    it('nobody seeds at 5.0+ without organised competition behind it', () => {
      const r = rate({ core: 4, adv: 4, experience: 3, competition: 0, selfLevel: 6 })
      expect(r.rating).toBeLessThanOrEqual(4.5)
      expect(r.flags).toContain('experience_capped')
    })

    it('a modest self-report pulls a strong technical profile down a little', () => {
      const r = rate({ core: 4, adv: 2, experience: 2, competition: 1, selfLevel: 2 })
      expect(r.rating).toBeLessThan(4.0)
      expect(r.rating).toBeGreaterThanOrEqual(3.6)
      expect(r.flags).toContain('self_report_below_evidence')
    })
  })

  describe('model properties', () => {
    it('improving any single answer never lowers the rating', () => {
      const base: Profile = { core: 3, adv: 1, experience: 2, competition: 1, selfLevel: 2 }
      const baseline = rate(base).rating
      for (const q of QUESTION_BANK) {
        if (!(SKILL_DIMENSIONS as readonly string[]).includes(q.category)) continue
        const bumped = rate({ ...base, questions: { [q.id]: 3 } }).rating
        expect(bumped, q.id).toBeGreaterThanOrEqual(baseline)
      }
    })

    it('ratings are clamped to [2.0, 5.5] and rounded to 0.1', () => {
      const profiles: Profile[] = [
        { core: 0, adv: 0, experience: 0, competition: 0, selfLevel: 0 },
        { core: 4, adv: 4, experience: 3, competition: 4, selfLevel: 7 },
        {
          core: 3,
          adv: 1,
          dimensions: { dinking: 4, strategy: 1 },
          experience: 1,
          competition: 2,
          selfLevel: 5
        }
      ]
      for (const p of profiles) {
        const r = rate(p).rating
        expect(r).toBeGreaterThanOrEqual(RATING_MIN)
        expect(r).toBeLessThanOrEqual(INITIAL_RATING_MAX)
        expect(Math.round(r * 10) / 10).toBe(r)
      }
    })

    it('seeds the variance parameter from reliability', () => {
      const high = rate({ core: 4, adv: 2, experience: 2, competition: 1, selfLevel: 4 })
      const low = rate({ core: 0, adv: 0, experience: 0, competition: 0, selfLevel: 0 })
      expect(high.confidence_score).toBe(INITIAL_CONFIDENCE_BY_RELIABILITY.high)
      expect(low.confidence_score).toBe(INITIAL_CONFIDENCE_BY_RELIABILITY.low)
      expect(low.confidence_score).toBeGreaterThan(high.confidence_score)
    })

    it('returns every dimension score and the resolved answers for storage', () => {
      const r = rate({ core: 3, adv: 1, experience: 2, competition: 0, selfLevel: 2 })
      // Core statements answered "Usually" (3.8), advanced ones "Rarely" (2.6).
      expect(r.dimension_scores.serve_return).toBe(3.2)
      // Strategy carries one core and two advanced statements, so its mean is lower.
      expect(r.dimension_scores.strategy).toBe(3.0)
      expect(Object.keys(r.dimension_scores)).toHaveLength(SKILL_DIMENSIONS.length)
      expect(r.answers).toHaveLength(QUESTION_BANK.length)
      expect(r.self_reported_level).toBe(3.0)
    })
  })

  describe('validation', () => {
    const full = answersFor({ core: 3, adv: 1, experience: 2, competition: 0, selfLevel: 2 })

    it('rejects an incomplete questionnaire', () => {
      expect(() => calculateProvisionalRating(full.slice(1))).toThrow(InitialRatingValidationError)
    })

    it('rejects an unknown question', () => {
      const answers = [...full.slice(1), { questionId: 'NOPE-999', choiceIndex: 0 }]
      expect(() => calculateProvisionalRating(answers)).toThrowError(/Unknown question/)
    })

    it('rejects a duplicate question', () => {
      const answers = [...full.slice(1), { ...full[1] }]
      expect(() => calculateProvisionalRating(answers)).toThrowError(/more than once/)
    })

    it('rejects an out-of-range choice', () => {
      const answers = full.map((a, i) => (i === 0 ? { ...a, choiceIndex: 99 } : a))
      expect(() => calculateProvisionalRating(answers)).toThrowError(/Invalid choice/)
    })
  })
})
