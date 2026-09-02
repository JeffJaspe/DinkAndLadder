/**
 * Covers the per-type card treatment.
 *
 * What is pinned is the grouping and the wiring to the artwork files, because
 * those are the design decisions: the card has four looks, one per thing a
 * player chooses between — casual play, ranked play, a tournament, a lesson —
 * club-only play wears the artwork of the public play of the same scoring, and
 * an event type this build has never met still renders a card rather than a
 * blank panel.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eventKindLabel, eventTypeStyle } from '../../utils/event-type'
import type { EventType } from '../../server/domains/event/dto/event.dto'

const CASUAL: EventType[] = ['open_casual', 'club_casual']
const RANKED: EventType[] = ['open_ranked', 'club_ranked']
const ALL_TYPES: EventType[] = [...CASUAL, ...RANKED, 'tournament', 'coaching']

const PUBLIC_DIR = join(__dirname, '../../public')

describe('eventTypeStyle', () => {
  it('dresses club-only play as the public play of the same scoring', () => {
    expect(new Set(CASUAL.map((t) => JSON.stringify(eventTypeStyle(t))))).toHaveProperty('size', 1)
    expect(new Set(RANKED.map((t) => JSON.stringify(eventTypeStyle(t))))).toHaveProperty('size', 1)
  })

  /**
   * The distinction the redesign exists to make: whether the session moves the
   * reader's rating is visible before a word of the card is read.
   */
  it('separates ranked play from casual play', () => {
    expect(eventTypeStyle('open_ranked')).not.toEqual(eventTypeStyle('open_casual'))
    expect(eventKindLabel('open_ranked')).not.toBe(eventKindLabel('open_casual'))
  })

  it('gives each of the four kinds its own artwork', () => {
    const art = new Set(
      ['open_casual', 'open_ranked', 'tournament', 'coaching'].map(
        (t) => eventTypeStyle(t).background
      )
    )
    expect(art.size).toBe(4)
  })

  it('keeps a tournament distinct from open play and from coaching', () => {
    const tournament = eventTypeStyle('tournament')
    expect(tournament).not.toEqual(eventTypeStyle('open_ranked'))
    expect(tournament).not.toEqual(eventTypeStyle('coaching'))
    expect(tournament.icon).toBe('trophy')
  })

  it('is stable for a given type', () => {
    expect(eventTypeStyle('tournament')).toEqual(eventTypeStyle('tournament'))
  })

  it('falls back rather than rendering a blank panel for an unknown type', () => {
    expect(eventTypeStyle('some_future_type')).toEqual(eventTypeStyle('open_casual'))
  })

  /**
   * A missing file fails silently in the browser — the card just renders empty
   * — so a renamed or dropped asset has to fail here instead.
   */
  it('points at artwork that is actually shipped', () => {
    for (const type of ALL_TYPES) {
      const { background, ribbon } = eventTypeStyle(type)
      for (const asset of [background, ribbon]) {
        expect(asset.startsWith('/event-art/')).toBe(true)
        expect(existsSync(join(PUBLIC_DIR, asset))).toBe(true)
      }
    }
  })

  it('names only tokens for the hue, never palette literals', () => {
    // docs/33 §3: a literal colour here would not flip with the theme.
    for (const type of ALL_TYPES) {
      const { art, badge } = eventTypeStyle(type)
      expect(`${art} ${badge}`).not.toMatch(
        /#|\brgb\(|\b(?:slate|zinc|amber|indigo|emerald|sky|violet)-\d/
      )
    }
  })
})
