import { apiErrorMessage } from './api-error-message'

/**
 * The way out of a plan limit.
 *
 * `event.service.ts` refuses a second draft or a second live event with
 * `CLUB_DRAFT_LIMIT` / `CLUB_EVENT_LIMIT`. Those errors used to be a dead end:
 * the sentence said what the plan allowed and nothing said where to change
 * it. This maps that error to the sentence plus a link, and nothing else — no
 * modal, no redirect. An interrupted create flow that pops a paywall is the
 * pattern people resent, and docs/36 is explicit that the free tier must be
 * enough to evaluate the platform.
 */
export const LIMIT_ERROR_CODES = ['CLUB_DRAFT_LIMIT', 'CLUB_EVENT_LIMIT'] as const

export interface LimitUpsell {
  message: string
  ctaLabel: string
  to: string
}

export function apiErrorCode(err: unknown): string | null {
  const e = err as { data?: { code?: string }; statusMessage?: string } | null | undefined
  return e?.data?.code ?? e?.statusMessage ?? null
}

export function limitUpsell(err: unknown, clubId: string | null | undefined): LimitUpsell | null {
  const code = apiErrorCode(err)
  if (!code || !(LIMIT_ERROR_CODES as readonly string[]).includes(code)) return null
  if (!clubId) return null
  return {
    message: apiErrorMessage(err, 'Your plan does not allow another event right now.'),
    ctaLabel: 'See plans',
    to: `/club/${clubId}/billing`
  }
}
