import { describe, expect, it } from 'vitest'
import type { TournamentFormat } from '~/server/domains/event/dto/tournament.dto'
import {
  formatDescription,
  formatLabel,
  formatOption,
  hasGroupStage,
  hasKnockoutStage,
  isTournamentFormat,
  TOURNAMENT_FORMAT_VALUES,
  TOURNAMENT_FORMATS
} from '~/utils/tournament-formats'

/**
 * The format list is a contract in three places at once: the `TournamentFormat`
 * union, the Liquibase CHECK constraint in 031-tournament-format, and this
 * list. Two of the three cannot be tested from here, so what this file pins is
 * the third — that the list stays exactly the five values the product offers,
 * and that every one of them carries the words a player needs.
 */
describe('tournament formats', () => {
  it('offers exactly the five product formats, in order', () => {
    expect(TOURNAMENT_FORMAT_VALUES).toEqual([
      'round_robin',
      'single_elimination',
      'double_elimination',
      'round_robin_single_elimination',
      'round_robin_double_elimination'
    ])
  })

  it('no longer offers pool_play', () => {
    expect(isTournamentFormat('pool_play')).toBe(false)
  })

  it('gives every format a label and a description', () => {
    for (const option of TOURNAMENT_FORMATS) {
      expect(option.label.length).toBeGreaterThan(0)
      // The description is the whole explanation a player gets at the point of
      // choice, so an empty one is a real defect, not a cosmetic one.
      expect(option.description.length).toBeGreaterThan(0)
    }
  })

  it('describes each format the way the product does', () => {
    expect(formatDescription('round_robin')).toBe('Everyone plays everyone')
    expect(formatDescription('single_elimination')).toBe("One loss and you're out")
    expect(formatDescription('double_elimination')).toBe("Two losses and you're out")
    expect(formatDescription('round_robin_single_elimination')).toBe('Group stage then knockout')
    expect(formatDescription('round_robin_double_elimination')).toBe(
      'Group stage then double-elim playoffs'
    )
  })

  it('names the two staged formats with an arrow, so the order reads', () => {
    expect(formatLabel('round_robin_single_elimination')).toBe('Round Robin → Single Elimination')
    expect(formatLabel('round_robin_double_elimination')).toBe('Round Robin → Double Elimination')
  })

  it('falls back to the stored value rather than rendering nothing', () => {
    // A row written before a rename still has to show the organiser something.
    expect(formatLabel('pool_play' as TournamentFormat)).toBe('pool_play')
    expect(formatOption('pool_play' as TournamentFormat)).toBeNull()
  })

  it('says "Not set" for a null format', () => {
    expect(formatLabel(null)).toBe('Not set')
    expect(formatDescription(null)).toBe('')
  })

  it('knows which formats open with groups', () => {
    expect(hasGroupStage('round_robin_single_elimination')).toBe(true)
    expect(hasGroupStage('round_robin_double_elimination')).toBe(true)
    // A pure round robin is not a GROUP stage — there is no stage after it.
    expect(hasGroupStage('round_robin')).toBe(false)
    expect(hasGroupStage('single_elimination')).toBe(false)
    expect(hasGroupStage(null)).toBe(false)
  })

  it('knows which formats end in a knockout that can crown a champion', () => {
    expect(hasKnockoutStage('single_elimination')).toBe(true)
    expect(hasKnockoutStage('double_elimination')).toBe(true)
    expect(hasKnockoutStage('round_robin_single_elimination')).toBe(true)
    expect(hasKnockoutStage('round_robin_double_elimination')).toBe(true)
    expect(hasKnockoutStage('round_robin')).toBe(false)
  })

  it('validates a value against the list', () => {
    expect(isTournamentFormat('round_robin')).toBe(true)
    expect(isTournamentFormat('swiss')).toBe(false)
    expect(isTournamentFormat(null)).toBe(false)
    expect(isTournamentFormat(42)).toBe(false)
  })
})
