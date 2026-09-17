import { expect, test } from '@playwright/test'
import { answerCookieBanner, visit } from '../helpers/audit'

/**
 * The Initial Skill Rating questionnaire, as far as a seeded session can take
 * it. Both dev test accounts already hold a rating, and the assessment can only
 * be taken once (409 ALREADY_RATED), so the submit → celebration step is not
 * driven here; the scoring behind it is covered end-to-end by
 * tests/unit/initial-rating.service.spec.ts. What this protects:
 *
 *   - the questions API serves the whole fixed bank, labels only (no scores
 *     for the client to read off), in a stable order;
 *   - the rate-only flow renders the questionnaire one scenario at a time and
 *     each answer advances it, with Back working.
 */

const QUESTION_COUNT = 20

test.beforeEach(async ({ page }) => {
  await answerCookieBanner(page)
})

test('the questions endpoint serves the fixed bank with labels only', async ({ request }) => {
  const first = await request.get('/api/v1/rating/assessment-questions')
  expect(first.ok()).toBe(true)
  const { data } = (await first.json()) as {
    data: { id: string; category: string; question: string; kind: string; choices: unknown[] }[]
  }

  expect(data).toHaveLength(QUESTION_COUNT)
  for (const q of data) {
    expect(q.id).toMatch(/^[A-Z]+-\d{3}$/)
    expect(q.category).toBeTruthy()
    expect(q.question.length).toBeGreaterThan(10)
    expect(q.choices.length).toBeGreaterThanOrEqual(4)
    // Presentation shape travels with the question rather than being guessed
    // from label length in the client.
    expect(['scale', 'list']).toContain(q.kind)
    // Labels only — a choice that came back as an object would leak its score.
    for (const choice of q.choices) expect(typeof choice).toBe('string')
  }

  const second = await request.get('/api/v1/rating/assessment-questions')
  const again = (await second.json()) as { data: { id: string }[] }
  expect(again.data.map((q) => q.id)).toEqual(data.map((q) => q.id))
})

test('the rate-only flow steps through every scenario', async ({ page }) => {
  await visit(page, '/onboarding?flow=rate-only&redirect=/dashboard')

  await expect(page.getByText(`Question 1 of ${QUESTION_COUNT}`)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/serve/i)
  // Every skill statement offers the same five-stop scale, as one radiogroup
  // rather than five unrelated buttons.
  await expect(page.getByTestId('question-choices')).toHaveAttribute('role', 'radiogroup')
  await expect(page.getByTestId('question-choices').getByRole('radio')).toHaveText([
    'Never',
    'Rarely',
    'Sometimes',
    'Usually',
    'Always'
  ])

  // Answer the first, check Back returns, then walk to the last question
  // without answering it (answering the last one submits, which this
  // already-rated account cannot do).
  const firstChoice = page.getByTestId('question-choices').getByRole('radio').first()
  await firstChoice.click()
  await expect(page.getByText(`Question 2 of ${QUESTION_COUNT}`)).toBeVisible()

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByText(`Question 1 of ${QUESTION_COUNT}`)).toBeVisible()
  // Back restores the answer, not just the question.
  await expect(firstChoice).toHaveAttribute('aria-checked', 'true')
  await firstChoice.click()

  for (let n = 2; n < QUESTION_COUNT; n++) {
    await expect(page.getByText(`Question ${n} of ${QUESTION_COUNT}`)).toBeVisible()
    // The first answer on every scale is "Never".
    await page.getByTestId('question-choices').getByRole('radio').first().click()
  }
  await expect(page.getByText(`Question ${QUESTION_COUNT} of ${QUESTION_COUNT}`)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/even game against/i)
})
