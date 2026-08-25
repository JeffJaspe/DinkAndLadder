import { describe, expect, it } from 'vitest'
import { formatEventTime, formatEventTimeRange } from '~/utils/event-time'

describe('formatEventTime', () => {
  it('formats an evening time on a 12-hour clock', () => {
    expect(formatEventTime('18:00')).toBe('6:00 PM')
  })

  it('formats a morning time', () => {
    expect(formatEventTime('05:30')).toBe('5:30 AM')
  })

  // Both ends of the clock read as 12, and getting either wrong is the classic
  // off-by-twelve: 00:15 is quarter past midnight, 12:15 is quarter past noon.
  it('renders midnight and noon as 12', () => {
    expect(formatEventTime('00:15')).toBe('12:15 AM')
    expect(formatEventTime('12:15')).toBe('12:15 PM')
  })

  it('accepts the HH:MM:SS form Postgres returns', () => {
    expect(formatEventTime('21:00:00')).toBe('9:00 PM')
  })

  // Every event created before 028-event-time has null times; the caller
  // renders the date alone on an empty string.
  it('returns an empty string for a missing or unparseable time', () => {
    expect(formatEventTime(null)).toBe('')
    expect(formatEventTime(undefined)).toBe('')
    expect(formatEventTime('')).toBe('')
    expect(formatEventTime('later')).toBe('')
  })
})

describe('formatEventTimeRange', () => {
  it('joins both ends when both are set', () => {
    expect(formatEventTimeRange('18:00', '21:00')).toBe('6:00 PM – 9:00 PM')
  })

  it('shows the start alone when there is no end', () => {
    expect(formatEventTimeRange('18:00', null)).toBe('6:00 PM')
  })

  // An end with no start is not a range and not a start — there is nothing
  // honest to render, so nothing is.
  it('renders nothing when only the end is set', () => {
    expect(formatEventTimeRange(null, '21:00')).toBe('')
  })
})
