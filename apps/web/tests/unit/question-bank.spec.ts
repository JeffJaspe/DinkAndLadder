import { describe, expect, it } from 'vitest'
import {
  calculateInitialRating,
  getTierForRating,
  selectRandomQuestions,
  QUESTION_BANK,
  RATING_TIERS
} from '../../server/domains/rating/data/question-bank'

describe('question-bank', () => {
  describe('QUESTION_BANK', () => {
    it('has questions in all required categories', () => {
      const categories = new Set(QUESTION_BANK.map((q) => q.category))
      expect(categories.has('experience')).toBe(true)
      expect(categories.has('skill')).toBe(true)
      expect(categories.has('strategy')).toBe(true)
      expect(categories.has('competition')).toBe(true)
      expect(categories.has('self-assessment')).toBe(true)
    })

    it('has at least 5 experience questions', () => {
      const exp = QUESTION_BANK.filter((q) => q.category === 'experience')
      expect(exp.length).toBeGreaterThanOrEqual(5)
    })

    it('has at least 10 skill questions', () => {
      const skill = QUESTION_BANK.filter((q) => q.category === 'skill')
      expect(skill.length).toBeGreaterThanOrEqual(10)
    })

    it('has at least 5 strategy questions', () => {
      const strat = QUESTION_BANK.filter((q) => q.category === 'strategy')
      expect(strat.length).toBeGreaterThanOrEqual(5)
    })

    it('has at least 5 competition questions', () => {
      const comp = QUESTION_BANK.filter((q) => q.category === 'competition')
      expect(comp.length).toBeGreaterThanOrEqual(5)
    })

    it('has at least 5 self-assessment questions', () => {
      const self = QUESTION_BANK.filter((q) => q.category === 'self-assessment')
      expect(self.length).toBeGreaterThanOrEqual(5)
    })

    it('all questions have at least 2 choices', () => {
      for (const q of QUESTION_BANK) {
        expect(q.choices.length).toBeGreaterThanOrEqual(2)
      }
    })

    it('all choices have valid point values between 1 and 6', () => {
      for (const q of QUESTION_BANK) {
        for (const c of q.choices) {
          expect(c.points).toBeGreaterThanOrEqual(1)
          expect(c.points).toBeLessThanOrEqual(6)
        }
      }
    })
  })

  describe('selectRandomQuestions', () => {
    it('returns exactly 7 questions', () => {
      const selected = selectRandomQuestions()
      expect(selected.length).toBe(7)
    })

    it('includes 1 experience question', () => {
      const selected = selectRandomQuestions()
      const exp = selected.filter((q) => q.category === 'experience')
      expect(exp.length).toBe(1)
    })

    it('includes 3 skill questions', () => {
      const selected = selectRandomQuestions()
      const skill = selected.filter((q) => q.category === 'skill')
      expect(skill.length).toBe(3)
    })

    it('includes 1 strategy question', () => {
      const selected = selectRandomQuestions()
      const strat = selected.filter((q) => q.category === 'strategy')
      expect(strat.length).toBe(1)
    })

    it('includes 1 competition question', () => {
      const selected = selectRandomQuestions()
      const comp = selected.filter((q) => q.category === 'competition')
      expect(comp.length).toBe(1)
    })

    it('includes 1 self-assessment question', () => {
      const selected = selectRandomQuestions()
      const self = selected.filter((q) => q.category === 'self-assessment')
      expect(self.length).toBe(1)
    })

    it('returns different questions on repeated calls (randomization check)', () => {
      const selections: string[][] = []
      for (let i = 0; i < 10; i++) {
        const selected = selectRandomQuestions()
        selections.push(selected.map((q) => q.id).sort())
      }
      const uniqueSets = new Set(selections.map((s) => s.join(',')))
      expect(uniqueSets.size).toBeGreaterThan(1)
    })
  })

  describe('calculateInitialRating', () => {
    it('returns 2.5 for empty answers', () => {
      expect(calculateInitialRating({})).toBe(2.5)
    })

    it('returns 2.0 for all minimum scores (1 point each)', () => {
      const answers: Record<string, number> = {}
      for (let i = 0; i < 7; i++) {
        answers[`Q${i}`] = 1
      }
      expect(calculateInitialRating(answers)).toBe(2.0)
    })

    it('returns 6.0 for all maximum scores (6 points each)', () => {
      const answers: Record<string, number> = {}
      for (let i = 0; i < 7; i++) {
        answers[`Q${i}`] = 6
      }
      expect(calculateInitialRating(answers)).toBe(6.0)
    })

    it('returns approximately 4.0 for average scores (3.5 points each)', () => {
      const answers: Record<string, number> = {}
      for (let i = 0; i < 7; i++) {
        answers[`Q${i}`] = 3.5
      }
      const rating = calculateInitialRating(answers)
      expect(rating).toBeCloseTo(4.0, 1)
    })

    it('returns a value between 2.0 and 6.0', () => {
      const answers: Record<string, number> = {}
      for (let i = 0; i < 7; i++) {
        answers[`Q${i}`] = Math.floor(Math.random() * 6) + 1
      }
      const rating = calculateInitialRating(answers)
      expect(rating).toBeGreaterThanOrEqual(2.0)
      expect(rating).toBeLessThanOrEqual(6.0)
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
