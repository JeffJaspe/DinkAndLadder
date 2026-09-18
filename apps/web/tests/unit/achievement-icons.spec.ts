import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { ACHIEVEMENT_ICONS, achievementIcon, achievementTier } from '~/utils/achievement-icons'
import { isIconName } from '~/utils/icons'
import BadgeIcon from '~/components/achievement/BadgeIcon.vue'

/**
 * Every badge the definitions table has ever held (011-achievement 0006/0007,
 * 065-achievement-integrity 0001). A badge missing from the map would fall to
 * the generic mark silently, which is the emoji problem in a different coat.
 */
const DEFINED_KEYS = [
  'newcomer',
  'first_match',
  'regular_player',
  'dedicated_player',
  'match_master',
  'first_victory',
  'winner',
  'champion',
  'rated_player',
  'rising_star',
  'skilled_player',
  'elite_player',
  'social_butterfly',
  'community_member',
  'club_founder',
  'tournament_debut',
  'competitor',
  'tournament_winner',
  'tournament_runner_up',
  'tournament_third',
  'multi_champion',
  'open_play_leader'
]

describe('achievement icons', () => {
  it('names a drawn glyph for every badge the database defines', () => {
    for (const key of DEFINED_KEYS) {
      expect(ACHIEVEMENT_ICONS[key], key).toBeDefined()
    }
  })

  it('only points at glyphs the registry actually has', () => {
    for (const [key, icon] of Object.entries(ACHIEVEMENT_ICONS)) {
      expect(isIconName(icon), `${key} → ${icon}`).toBe(true)
    }
  })

  it('falls back to the generic achievement mark for an unknown key', () => {
    expect(achievementIcon('something_new')).toBe('achievements')
    expect(achievementIcon(null)).toBe('achievements')
  })

  it('treats an unknown tier as bronze rather than unstyled', () => {
    expect(achievementTier('mythic')).toEqual(achievementTier('bronze'))
  })
})

describe('AchievementBadgeIcon', () => {
  const stubs = {
    UiIcon: {
      name: 'UiIcon',
      props: ['name', 'size'],
      template: '<svg class="glyph" :data-name="name" />'
    }
  }

  it('draws the mapped glyph on a tier-coloured chip', () => {
    const w = mount(BadgeIcon, {
      props: { achievementKey: 'tournament_winner', tier: 'gold' },
      global: { stubs }
    })
    expect(w.find('.glyph').attributes('data-name')).toBe('trophy')
    expect(w.classes()).toContain('text-rating-gold')
    expect(w.attributes('aria-hidden')).toBe('true')
  })

  it('goes grey when locked and keeps the glyph', () => {
    const w = mount(BadgeIcon, {
      props: { achievementKey: 'elite_player', tier: 'platinum', locked: true },
      global: { stubs }
    })
    expect(w.find('.glyph').attributes('data-name')).toBe('gem')
    expect(w.classes()).toContain('text-fg-muted')
    expect(w.classes()).not.toContain('text-on-accent')
  })

  it('names itself when asked to stand alone', () => {
    const w = mount(BadgeIcon, {
      props: { achievementKey: 'winner', tier: 'silver', label: 'Winner' },
      global: { stubs }
    })
    expect(w.attributes('role')).toBe('img')
    expect(w.attributes('aria-label')).toBe('Winner')
  })
})
