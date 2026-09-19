import { existsSync } from 'node:fs'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { answerCookieBanner } from '../helpers/audit'

/**
 * A live tournament match, seen by the person running it.
 *
 * Runs as a REAL account — whoever logged in to write
 * `.auth/organizer.json` (see the `organizer` project in
 * playwright.config.ts). Nothing here creates, changes or scores anything;
 * it reads what that account can see and asserts the two facts the organiser
 * complained were missing after a browser restart:
 *
 *   1. a match in progress is labelled LIVE, on the scoreboard and on its row;
 *   2. in club mode, that row carries the scoring controls.
 *
 * Skips, saying why, when the session file is absent or the account has no
 * tournament with a live match — an honest "nothing to check" rather than a
 * failure of the page.
 */

const SESSION = '.auth/organizer.json'

interface BracketMatch {
  is_live: boolean
  category_id: string | null
}

interface EventRow {
  id: string
  name: string
  event_type: string
  club_id: string | null
  created_by_player_id: string
}

async function findMyLiveTournament(request: APIRequestContext) {
  const me = await request.get('/api/v1/players/me')
  if (!me.ok()) return { reason: 'the session file is stale — log in again', target: null }
  const meBody = (await me.json()) as { data?: { id: string }; id?: string }
  const myId = meBody.data?.id ?? meBody.id

  const events = await request.get('/api/v1/events?limit=100')
  if (!events.ok()) return { reason: 'could not list events', target: null }
  const { events: list } = (await events.json()) as { events: EventRow[] }

  // The organiser's own tournaments first; any other tournament with a live
  // match is still worth the LIVE label check, just not the scoring one.
  const tournaments = list
    .filter((e) => e.event_type === 'tournament')
    .sort(
      (a, b) => Number(b.created_by_player_id === myId) - Number(a.created_by_player_id === myId)
    )

  for (const event of tournaments) {
    const ts = await request.get(`/api/v1/events/${event.id}/tournaments`)
    if (!ts.ok()) continue
    const { tournaments: rows } = (await ts.json()) as { tournaments: { id: string }[] }
    if (!rows[0]) continue
    const bracket = await request.get(`/api/v1/tournaments/${rows[0].id}/bracket`)
    if (!bracket.ok()) continue
    const { rounds } = (await bracket.json()) as { rounds: { matches: BracketMatch[] }[] }
    const live = rounds.flatMap((r) => r.matches).find((m) => m.is_live)
    if (live) {
      return {
        reason: null,
        target: {
          event,
          categoryId: live.category_id,
          mine: event.created_by_player_id === myId
        }
      }
    }
  }
  return { reason: 'this account can see no tournament with a live match', target: null }
}

/** Club mode for the event's club, the way the account switcher sets it. */
async function enterClubMode(page: Page, clubId: string) {
  await page.context().addCookies([
    { name: 'account_mode', value: 'club', url: 'http://localhost:3000' },
    { name: 'active_club_id', value: clubId, url: 'http://localhost:3000' }
  ])
}

test.describe('live tournament match, as the organiser', () => {
  test.skip(
    !existsSync(SESSION),
    `no ${SESSION} — log in once with: pnpm exec playwright codegen --save-storage=${SESSION} http://localhost:3000/login`
  )

  test('the match in progress is labelled LIVE, and the organiser can score it', async ({
    page,
    request
  }) => {
    const { reason, target } = await findMyLiveTournament(request)
    test.skip(!target, reason ?? undefined)

    await answerCookieBanner(page)
    if (target!.event.club_id) await enterClubMode(page, target!.event.club_id)
    await page.goto(`/events/${target!.event.id}`)

    // 1. LIVE on the scoreboard: the heading names the state and the pill says it.
    const board = page.getByTestId('scoreboard')
    await expect(board).toBeVisible({ timeout: 20_000 })
    await expect(board.locator('xpath=preceding-sibling::h2')).toHaveText('On court now')
    await expect(board.getByText('Live', { exact: true })).toBeVisible()

    // The wrong-mode banner must NOT be showing to an organiser in club mode.
    await expect(page.getByRole('status').filter({ hasText: 'You run this event' })).toHaveCount(0)

    // 2. Into the category, onto the row.
    if (!target!.categoryId) return
    // The board features the most recently started live match, which need
    // not be the one the API walk found first — so the card is the one the
    // button actually opened, read back from the URL it set.
    await page.getByRole('link', { name: 'View category' }).first().click()
    await expect(page).toHaveURL(/category=/)
    const openedId = new URL(page.url()).searchParams.get('category')!
    const card = page.locator(`#category-${openedId}`)
    await expect(card.locator('button[aria-expanded]').first()).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    await card.getByRole('tab', { name: /matches/i }).click()

    // The row that says LIVE. Scoped to the card's own list items; `has`
    // locators must be relative, so this is a text filter rather than one.
    const liveRow = card.locator('li', { hasText: /Live/ })
    await expect(liveRow.first()).toBeVisible({ timeout: 10_000 })

    // The organiser's controls, only for the organiser.
    await liveRow.first().locator('button[aria-expanded]').first().click()
    const addPoint = liveRow.first().getByRole('button', { name: /^Add a point for/ })
    if (target!.mine) {
      await expect(addPoint.first()).toBeVisible()
      await expect(liveRow.first().getByRole('button', { name: 'Save result' })).toBeVisible()
    } else {
      await expect(addPoint).toHaveCount(0)
    }
  })
})
