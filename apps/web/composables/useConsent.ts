/**
 * Cookie-consent choice, stored the same way as the theme: a cookie, not
 * localStorage, so SSR knows on the first render whether to draw the banner
 * and the page does not flash a bar that then disappears (or the reverse).
 *
 * The cookie holds a JSON record with the consent version it was made
 * against. A record from an older version reads as no choice — see
 * utils/cookie-consent.ts for why.
 *
 * The live value is a `useState` seeded from the cookie rather than the
 * `useCookie` ref itself. Two `useCookie` refs for the same name — the banner
 * in the layout and the buttons on /legal/cookies — are separate refs that
 * Nuxt only reconciles through browser cookie-change events, and in practice
 * the banner did not learn about a choice made on the page. One shared state
 * makes every reader see the write on the same tick; the cookie is the
 * persistence, not the source of truth for the render.
 */

import {
  CONSENT_COOKIE,
  isCategoryAllowed,
  isCurrentConsent,
  makeConsentRecord,
  type ConsentCategoryKey,
  type ConsentChoice,
  type ConsentRecord
} from '~/utils/cookie-consent'

export function useConsent() {
  const stored = useCookie<ConsentRecord | null>(CONSENT_COOKIE, {
    default: () => null,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/'
  })

  const record = useState<ConsentRecord | null>('dnl:cookie-consent', () =>
    isCurrentConsent(stored.value) ? stored.value : null
  )

  const hasChosen = computed(() => record.value !== null)
  const choice = computed<ConsentChoice | null>(() => record.value?.choice ?? null)

  function write(next: ConsentRecord | null) {
    stored.value = next
    record.value = next
  }

  function accept(next: ConsentChoice) {
    write(makeConsentRecord(next))
  }

  /** Clears the choice so the banner asks again. Used by the cookies page. */
  function reset() {
    write(null)
  }

  function allows(category: ConsentCategoryKey): boolean {
    return isCategoryAllowed(category, record.value)
  }

  return { record, hasChosen, choice, accept, reset, allows }
}
