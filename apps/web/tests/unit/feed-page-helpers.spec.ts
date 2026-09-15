import { describe, it, expect } from 'vitest'
import { describeFeedReason, describeFeedDay, groupByFeedDay } from '../../utils/feed'
import { toActivityDto } from '../../server/domains/activity/dto/activity.dto'
import type { ActivityRecord } from '../../server/domains/activity/dto/activity.dto'

describe('describeFeedReason', () => {
  it('names the club when the row came from one the reader belongs to', () => {
    expect(describeFeedReason('club', 'Bay Area Pickleball')).toBe(
      "You're a member of Bay Area Pickleball"
    )
  })

  it('still says why when the club name is missing', () => {
    expect(describeFeedReason('club', null)).toBe("You're a member of this club")
  })

  it('uses the community page vocabulary for the player kinds', () => {
    expect(describeFeedReason('partner')).toBe('Your duo partner')
    expect(describeFeedReason('team_up')).toBe("You've teamed up")
    expect(describeFeedReason('opponent')).toBe("You've played each other")
    expect(describeFeedReason('self')).toBe('Your own activity')
  })

  it('says nothing for an unscoped row', () => {
    expect(describeFeedReason(null)).toBeNull()
    expect(describeFeedReason(undefined)).toBeNull()
  })
})

describe('describeFeedDay', () => {
  // Local noon, so the day never rolls over on a timezone offset.
  const now = new Date(2026, 8, 14, 12, 0, 0)

  it('names today and yesterday', () => {
    expect(describeFeedDay(new Date(2026, 8, 14, 8).toISOString(), now)).toBe('Today')
    expect(describeFeedDay(new Date(2026, 8, 13, 23).toISOString(), now)).toBe('Yesterday')
  })

  it('gives an older day a real date without the year', () => {
    const label = describeFeedDay(new Date(2026, 7, 3, 9).toISOString(), now)
    expect(label).toMatch(/Aug/)
    expect(label).toMatch(/3/)
    expect(label).not.toMatch(/2026/)
  })

  it('adds the year once the day is in another year', () => {
    expect(describeFeedDay(new Date(2025, 11, 30, 9).toISOString(), now)).toMatch(/2025/)
  })
})

describe('groupByFeedDay', () => {
  const now = new Date(2026, 8, 14, 12, 0, 0)
  const at = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).toISOString()

  it('groups consecutive rows that share a day and keeps their order', () => {
    const groups = groupByFeedDay(
      [
        { id: 'a', created_at: at(2026, 8, 14, 10) },
        { id: 'b', created_at: at(2026, 8, 14, 9) },
        { id: 'c', created_at: at(2026, 8, 13, 22) },
        { id: 'd', created_at: at(2026, 7, 3, 9) }
      ],
      now
    )
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', expect.stringMatching(/Aug/)])
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['c'])
  })

  it('does not merge a day that reappears later in the list', () => {
    // The server order is authoritative; the page must not re-sort it.
    const groups = groupByFeedDay(
      [
        { id: 'a', created_at: at(2026, 8, 14, 10) },
        { id: 'b', created_at: at(2026, 8, 13, 9) },
        { id: 'c', created_at: at(2026, 8, 14, 8) }
      ],
      now
    )
    expect(groups).toHaveLength(3)
  })

  it('returns nothing for nothing', () => {
    expect(groupByFeedDay([], now)).toEqual([])
  })
})

describe('toActivityDto feed reason', () => {
  const base: ActivityRecord = {
    id: 'activity-1',
    actor_player_id: 'player-1',
    actor_club_id: null,
    activity_type: 'social.shoutout',
    reference_type: null,
    reference_id: null,
    visibility: 'public',
    metadata: null,
    created_at: '2026-01-01T00:00:00Z'
  }

  it('passes the reason through when the feed function supplied one', () => {
    const dto = toActivityDto({ ...base, feed_reason: 'club', feed_reason_name: 'Bay Area' })
    expect(dto.feed_reason).toBe('club')
    expect(dto.feed_reason_name).toBe('Bay Area')
  })

  it('is explicitly null on rows that did not come through the feed', () => {
    const dto = toActivityDto(base)
    expect(dto.feed_reason).toBeNull()
    expect(dto.feed_reason_name).toBeNull()
  })
})
