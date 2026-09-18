import { expect, test, type APIRequestContext } from '@playwright/test'
import { answerCookieBanner } from './helpers/audit'

/**
 * The scoreboard on a public tournament page.
 *
 * Reads from whatever the target database holds rather than building a
 * tournament: a draw with a played or live match takes eight authenticated
 * steps to construct, and the demo seed (database/seeds/demo) already provides
 * several on dev. Skips, with the reason, when nothing suitable exists — an
 * empty database is a valid state for this suite, not a failure of the board.
 */

interface BracketMatch {
  is_live: boolean
  match_id: string | null
  category_id: string | null
}

async function findTournamentWithPlay(request: APIRequestContext) {
  const events = await request.get('/api/v1/events?limit=50')
  if (!events.ok()) return null
  const { events: list } = (await events.json()) as {
    events: { id: string; event_type: string; visibility?: string }[]
  }

  for (const event of list.filter((e) => e.event_type === 'tournament')) {
    const tournaments = await request.get(`/api/v1/events/${event.id}/tournaments`)
    if (!tournaments.ok()) continue
    const { tournaments: ts } = (await tournaments.json()) as { tournaments: { id: string }[] }
    const tournament = ts[0]
    if (!tournament) continue

    const bracket = await request.get(`/api/v1/tournaments/${tournament.id}/bracket`)
    if (!bracket.ok()) continue
    const { rounds } = (await bracket.json()) as { rounds: { matches: BracketMatch[] }[] }
    const matches = rounds.flatMap((r) => r.matches)
    const live = matches.find((m) => m.is_live)
    const played = matches.find((m) => m.match_id)
    if (live || played) {
      return { eventId: event.id, live: !!live, categoryId: (live ?? played)!.category_id }
    }
  }
  return null
}

test.describe('tournament scoreboard', () => {
  test('shows one match, large, with the two-row sheet beneath', async ({ page, request }) => {
    const target = await findTournamentWithPlay(request)
    test.skip(!target, 'no tournament with a played or live match in this database')

    await answerCookieBanner(page)
    await page.goto(`/events/${target!.eventId}`)

    const board = page.getByTestId('scoreboard')
    await expect(board).toBeVisible({ timeout: 20_000 })

    // One board, never a list.
    await expect(page.getByTestId('scoreboard')).toHaveCount(1)

    // The heading names the state the board is in.
    const heading = board.locator('xpath=preceding-sibling::h2')
    await expect(heading).toHaveText(target!.live ? 'On court now' : 'Latest result')

    // The big number is the stat role, not body text.
    const score = board.locator('.text-stat-lg').first()
    await expect(score).toBeVisible()
    const fontSize = await score.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(fontSize).toBeGreaterThanOrEqual(48)

    // The two-row sheet — Players / Score (or G1…) / Result — sits under it.
    await expect(board.getByRole('table')).toBeVisible()
    await expect(board.getByRole('columnheader', { name: /players/i })).toBeVisible()
    await expect(board.getByRole('columnheader', { name: /result/i })).toBeVisible()
  })

  test('View category opens that card, and keeps working after it is shut', async ({
    page,
    request
  }) => {
    const target = await findTournamentWithPlay(request)
    test.skip(!target?.categoryId, 'no categorised match to link from')

    await answerCookieBanner(page)
    await page.goto(`/events/${target!.eventId}`)

    const view = page.getByRole('link', { name: 'View category' }).first()
    await expect(view).toBeVisible({ timeout: 20_000 })

    const card = page.locator(`#category-${target!.categoryId}`)
    const summary = card.locator('button[aria-expanded]').first()

    await view.click()
    await expect(page).toHaveURL(new RegExp(`category=${target!.categoryId}`))
    await expect(summary).toHaveAttribute('aria-expanded', 'true')

    // Shut it, go back to the top, press again: the second press must work.
    await summary.click()
    await expect(summary).toHaveAttribute('aria-expanded', 'false')
    await page.evaluate(() => window.scrollTo(0, 0))
    await view.click()
    await expect(summary).toHaveAttribute('aria-expanded', 'true')
    await expect(card).toBeInViewport()
  })
})
