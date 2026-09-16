import { describe, expect, it } from 'vitest'
import {
  FREQUENCY_LABELS,
  TIER_SCORES,
  getAssessmentQuestions,
  getTierForRating,
  QUESTION_BANK,
  RATING_TIERS,
  SKILL_DIMENSIONS
} from '../../server/domains/rating/data/question-bank'
import {
  INITIAL_RATING_MAX,
  SKILL_DIMENSION_WEIGHTS
} from '../../server/domains/rating/services/initial-rating.service'
import { RATING_MIN } from '../../server/domains/rating/services/rating.service'

describe('question-bank', () => {
  describe('QUESTION_BANK', () => {
    it('has 15–20 questions', () => {
      expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(15)
      expect(QUESTION_BANK.length).toBeLessThanOrEqual(20)
    })

    it('has unique ids', () => {
      const ids = QUESTION_BANK.map((q) => q.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('covers every skill dimension with at least two questions', () => {
      for (const dimension of SKILL_DIMENSIONS) {
        const count = QUESTION_BANK.filter((q) => q.category === dimension).length
        expect(count, dimension).toBeGreaterThanOrEqual(2)
      }
    })

    it('has exactly one of each calibration question', () => {
      for (const category of ['experience', 'competition', 'self_level'] as const) {
        expect(QUESTION_BANK.filter((q) => q.category === category)).toHaveLength(1)
      }
    })

    it('every skill statement uses the one frequency scale, scored by its tier', () => {
      for (const q of QUESTION_BANK) {
        if (!(SKILL_DIMENSIONS as readonly string[]).includes(q.category)) continue
        expect(q.tier, q.id).toBeTruthy()
        expect(
          q.choices.map((c) => c.label),
          q.id
        ).toEqual([...FREQUENCY_LABELS])
        expect(
          q.choices.map((c) => c.score),
          q.id
        ).toEqual([...TIER_SCORES[q.tier!]])
      }
    })

    it('both tiers climb strictly, starting at the rating floor', () => {
      for (const scores of Object.values(TIER_SCORES)) {
        expect(scores[0]).toBe(RATING_MIN)
        for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1])
      }
      // Basic competence, however reliable, is not elite play; only the
      // advanced statements reach the top of the questionnaire's range.
      expect(TIER_SCORES.core[4]).toBeLessThan(TIER_SCORES.advanced[4])
      expect(TIER_SCORES.advanced[4]).toBe(INITIAL_RATING_MAX)
    })

    it('covers each dimension with a core statement and an advanced one', () => {
      for (const dimension of SKILL_DIMENSIONS) {
        const tiers = QUESTION_BANK.filter((q) => q.category === dimension).map((q) => q.tier)
        expect(tiers, dimension).toContain('core')
        expect(tiers, dimension).toContain('advanced')
      }
    })

    it('every choice scores within the provisional rating range', () => {
      for (const q of QUESTION_BANK) {
        for (const c of q.choices) {
          expect(c.score).toBeGreaterThanOrEqual(RATING_MIN)
          expect(c.score).toBeLessThanOrEqual(INITIAL_RATING_MAX)
        }
      }
    })

    it('never asks a technical question in rating-number terms', () => {
      for (const q of QUESTION_BANK) {
        if (q.category === 'self_level') continue
        const text = [q.question, ...q.choices.map((c) => c.label)].join(' ')
        expect(text, q.id).not.toMatch(/\b[2-5]\.[05]\b/)
        expect(text, q.id).not.toMatch(/DUPR/i)
      }
    })

    it('the competitive-level question spans beginners to pro', () => {
      const q = QUESTION_BANK.find((q) => q.category === 'self_level')!
      expect(q.choices[0].score).toBeLessThan(2.5)
      expect(q.choices[q.choices.length - 1].score).toBe(INITIAL_RATING_MAX)
    })
  })

  describe('SKILL_DIMENSION_WEIGHTS', () => {
    it('sum to 1 across every dimension', () => {
      const total = SKILL_DIMENSIONS.reduce((sum, d) => sum + SKILL_DIMENSION_WEIGHTS[d], 0)
      expect(total).toBeCloseTo(1, 10)
    })
  })

  describe('getAssessmentQuestions', () => {
    it('returns the whole bank, in a fixed order', () => {
      const first = getAssessmentQuestions().map((q) => q.id)
      const second = getAssessmentQuestions().map((q) => q.id)
      expect(first).toEqual(QUESTION_BANK.map((q) => q.id))
      expect(second).toEqual(first)
    })
  })

  describe('getTierForRating', () => {
    it('returns Beginner for rating 2.0', () => {
      expect(getTierForRating(2.0).name).toBe('Beginner')
    })

    it('returns Novice for rating 2.5', () => {
      expect(getTierForRating(2.5).name).toBe('Novice')
    })

    it('returns Intermediate for rating 3.0', () => {
      expect(getTierForRating(3.0).name).toBe('Intermediate')
    })

    it('returns Advanced for rating 3.5', () => {
      expect(getTierForRating(3.5).name).toBe('Advanced')
    })

    it('returns Skilled for rating 4.0', () => {
      expect(getTierForRating(4.0).name).toBe('Skilled')
    })

    it('returns Expert for rating 4.5', () => {
      expect(getTierForRating(4.5).name).toBe('Expert')
    })

    it('returns Pro for rating 5.0', () => {
      expect(getTierForRating(5.0).name).toBe('Pro')
    })

    it('returns Elite for rating 5.5', () => {
      expect(getTierForRating(5.5).name).toBe('Elite')
    })

    it('returns Champion for rating 6.0 and above', () => {
      expect(getTierForRating(6.0).name).toBe('Champion')
      expect(getTierForRating(7.0).name).toBe('Champion')
      expect(getTierForRating(8.0).name).toBe('Champion')
    })

    it('returns Beginner as fallback for invalid ratings', () => {
      expect(getTierForRating(1.5).name).toBe('Beginner')
    })
  })

  describe('RATING_TIERS', () => {
    it('has 9 tiers', () => {
      expect(RATING_TIERS.length).toBe(9)
    })

    it('tiers cover the entire 2.0-8.0 range without gaps', () => {
      const sorted = [...RATING_TIERS].sort((a, b) => a.min - b.min)
      expect(sorted[0].min).toBe(2.0)
      expect(sorted[sorted.length - 1].max).toBe(8.0)

      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].min).toBeCloseTo(sorted[i - 1].max + 0.01, 1)
      }
    })

    it('all tiers have required properties', () => {
      for (const tier of RATING_TIERS) {
        expect(tier.name).toBeTruthy()
        expect(tier.description).toBeTruthy()
        expect(tier.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    })
  })
})
