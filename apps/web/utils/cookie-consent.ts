/**
 * Cookie consent — the one list every surface reads from.
 *
 * The banner, the /legal/cookies page and (later) the analytics plugin all
 * take their categories and cookie inventory from here, so the page can never
 * describe a cookie the banner does not gate, and the banner can never offer
 * a choice the page does not explain. See docs/38 §6.
 *
 * Adding a non-essential category is a two-line change here plus a bump of
 * CONSENT_VERSION, which re-shows the banner to everyone who chose before the
 * category existed. Do not bump it for copy edits — the bar should be rare.
 */

export const CONSENT_COOKIE = 'dnl-cookie-consent'

/** Bump only when a new non-essential category is added. */
export const CONSENT_VERSION = 1

export type ConsentChoice = 'essential' | 'all'

export type ConsentCategoryKey = 'essential' | 'analytics'

export interface ConsentCategory {
  key: ConsentCategoryKey
  title: string
  description: string
  /** Essential is locked on; it is listed so the page can show what it covers. */
  locked: boolean
  cookies: readonly ConsentCookie[]
}

export interface ConsentCookie {
  name: string
  purpose: string
  lifetime: string
  /** Who sets it. First-party unless a vendor is named. */
  setBy: string
}

export const CONSENT_CATEGORIES: readonly ConsentCategory[] = [
  {
    key: 'essential',
    title: 'Essential',
    description:
      'Needed for the site to work at all: keeping you signed in, remembering which account you are using, and your light or dark choice. These are set whether or not you accept anything else.',
    locked: true,
    cookies: [
      {
        name: 'sb-*-auth-token',
        purpose: 'Your sign-in session',
        lifetime:
          'Until you close the browser, or until you sign out if you chose "Remember me"; refreshed while you use the site',
        setBy: 'DinkAndLadder (Supabase Auth)'
      },
      {
        name: 'dnl_remember',
        purpose: 'Your "Remember me" choice, and the email to fill in next time',
        lifetime: '400 days, only if you tick "Remember me"',
        setBy: 'DinkAndLadder'
      },
      {
        name: 'account_mode',
        purpose: 'Whether you are using the site as a player or as a club',
        lifetime: 'Persistent',
        setBy: 'DinkAndLadder'
      },
      {
        name: 'active_club_id',
        purpose: 'Which club you are acting for, in club mode',
        lifetime: 'Persistent',
        setBy: 'DinkAndLadder'
      },
      {
        name: 'dnl-theme',
        purpose: 'Light, dark, or follow your device',
        lifetime: '1 year',
        setBy: 'DinkAndLadder'
      },
      {
        name: CONSENT_COOKIE,
        purpose: 'Remembers the choice you made on this banner',
        lifetime: '1 year',
        setBy: 'DinkAndLadder'
      },
      {
        name: '__cf_bm, cf_clearance',
        purpose: 'Bot protection on sign-up and sign-in',
        lifetime: 'Under 1 day',
        setBy: 'Cloudflare'
      }
    ]
  },
  {
    key: 'analytics',
    title: 'Analytics',
    description:
      'Would tell us which pages are used and where people get stuck. Nothing in this category is set today; the option exists so that if analytics is added, it only runs for people who said yes.',
    locked: false,
    cookies: []
  }
]

export interface ConsentRecord {
  v: number
  choice: ConsentChoice
  /** ISO timestamp of the choice. */
  at: string
}

export function isConsentChoice(value: unknown): value is ConsentChoice {
  return value === 'essential' || value === 'all'
}

/**
 * A stored record counts only if it is well-formed and was made against the
 * current version. Anything else — malformed, hand-edited, or from before a
 * new category existed — reads as "not chosen", which re-shows the banner.
 */
export function isCurrentConsent(value: unknown): value is ConsentRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<ConsentRecord>
  return (
    record.v === CONSENT_VERSION && isConsentChoice(record.choice) && typeof record.at === 'string'
  )
}

export function makeConsentRecord(choice: ConsentChoice, now: Date = new Date()): ConsentRecord {
  return { v: CONSENT_VERSION, choice, at: now.toISOString() }
}

/** Whether a non-essential category may run under the stored choice. */
export function isCategoryAllowed(
  category: ConsentCategoryKey,
  record: ConsentRecord | null | undefined
): boolean {
  if (category === 'essential') return true
  return isCurrentConsent(record) && record.choice === 'all'
}
