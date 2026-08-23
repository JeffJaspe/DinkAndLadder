/**
 * Covers the mode flags in composables/useAccountMode.ts.
 *
 * These are two one-line computeds, but they are the gate every organiser
 * control in the events and tournaments UI now hangs off — "may I change this?"
 * resolves to ownership AND club mode. Getting them wrong exposes event
 * management to player mode, which is the exact thing they exist to prevent, so
 * they are worth pinning down.
 *
 * `useCookie` is a Nuxt auto-import at runtime; it is stubbed with a ref-backed
 * fake so the test covers the mode logic rather than Nuxt's cookie plumbing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, type Ref } from 'vue'

const cookies = new Map<string, Ref<unknown>>()

vi.stubGlobal('computed', computed)
vi.stubGlobal('useCookie', (key: string, options?: { default?: () => unknown }) => {
  if (!cookies.has(key)) cookies.set(key, ref(options?.default?.()))
  return cookies.get(key)!
})

const { useAccountMode } = await import('../../composables/useAccountMode')

describe('useAccountMode', () => {
  beforeEach(() => {
    cookies.clear()
  })

  it('defaults to player mode, so a new visitor never lands in club mode', () => {
    const { accountMode, isPlayerMode, isClubMode } = useAccountMode()

    expect(accountMode.value).toBe('player')
    expect(isPlayerMode.value).toBe(true)
    expect(isClubMode.value).toBe(false)
  })

  it('reports club mode only after switching to a club', () => {
    const { isClubMode, isPlayerMode, activeClubId, switchToClub } = useAccountMode()

    switchToClub('club-1')

    expect(isClubMode.value).toBe(true)
    expect(isPlayerMode.value).toBe(false)
    expect(activeClubId.value).toBe('club-1')
  })

  it('clears the active club when switching back to player', () => {
    // A stale activeClubId would let club-scoped links keep resolving after the
    // user has gone back to being a player.
    const { activeClubId, isClubMode, switchToClub, switchToPlayer } = useAccountMode()

    switchToClub('club-1')
    switchToPlayer()

    expect(isClubMode.value).toBe(false)
    expect(activeClubId.value).toBeNull()
  })

  it('keeps the two flags mutually exclusive through repeated switches', () => {
    const { isClubMode, isPlayerMode, switchToClub, switchToPlayer } = useAccountMode()

    for (const clubId of ['club-1', 'club-2']) {
      switchToClub(clubId)
      expect(isClubMode.value).toBe(true)
      expect(isPlayerMode.value).toBe(false)

      switchToPlayer()
      expect(isClubMode.value).toBe(false)
      expect(isPlayerMode.value).toBe(true)
    }
  })

  it('tracks the cookie, so a mode set elsewhere in the app is observed', () => {
    // Both flags are derived, not snapshots: the layout, the events list and
    // the event page each call useAccountMode() separately and must agree.
    const a = useAccountMode()
    const b = useAccountMode()

    a.switchToClub('club-1')

    expect(b.isClubMode.value).toBe(true)
    expect(b.activeClubId.value).toBe('club-1')
  })
})
