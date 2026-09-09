/**
 * Avatar initials were written inline as `name.charAt(0).toUpperCase()` in
 * sixteen places, which takes whatever character happens to be first. The
 * seeded database prefixes every demo record with "[DEMO] ", so every list row,
 * card and profile header in the app was drawing a bracket where a person's
 * initial belongs. These cases are why the logic is shared and why it strips.
 */

import { describe, expect, it } from 'vitest'
import { initialsFor } from '../../utils/initials'

describe('initialsFor', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsFor('Juan Dela Cruz')).toBe('JD')
    expect(initialsFor('Ana')).toBe('A')
  })

  it('returns a single letter when asked for one', () => {
    expect(initialsFor('Juan Dela Cruz', 1)).toBe('J')
  })

  it('skips a leading bracket rather than rendering it as the identity', () => {
    expect(initialsFor('[DEMO] Ana Cruz')).toBe('DA')
    expect(initialsFor('[DEMO] Ana Cruz', 1)).toBe('D')
  })

  it('drops a word that is only punctuation', () => {
    expect(initialsFor('— Makati Dinkers')).toBe('MD')
    expect(initialsFor('"Pins & Paddles"')).toBe('PP')
  })

  it('keeps a digit that genuinely starts a name', () => {
    expect(initialsFor('3rd Shot Club')).toBe('3S')
  })

  it('collapses runs of whitespace', () => {
    expect(initialsFor('  Ana   Cruz  ')).toBe('AC')
  })

  it('falls back to a question mark when there is nothing to take', () => {
    expect(initialsFor(null)).toBe('?')
    expect(initialsFor(undefined)).toBe('?')
    expect(initialsFor('')).toBe('?')
    expect(initialsFor('   ')).toBe('?')
    expect(initialsFor('!!!')).toBe('?')
  })

  it('uppercases a lowercase name', () => {
    expect(initialsFor('ana cruz')).toBe('AC')
  })
})
