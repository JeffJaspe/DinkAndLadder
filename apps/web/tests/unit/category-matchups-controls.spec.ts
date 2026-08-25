import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryMatchups from '~/components/tournament/CategoryMatchups.vue'
import type { BracketDto } from '~/server/domains/event/dto/bracket.dto'

/**
 * The organiser's controls on the Draw tab, which are the visible half of the
 * bracket lifecycle:
 *
 *     open -> generate -> lock -> complete
 *             (private,   (public,
 *              redrawable) playable)
 *
 * Lock sits beside Generate and comes alive only once there is a draw to
 * freeze — before that it would be a button with nothing to act on.
 */

const stubs = {
  UiIcon: true,
  UiRatingBadge: true,
  BracketMatchCard: true,
  TournamentBracketTree: true,
  TournamentBracketGroupTables: true
}

function bracket(matchCount: number, locked = false): BracketDto {
  return {
    tournament_id: 'tournament-1',
    category_id: 'cat-1',
    locked,
    rounds: matchCount
      ? [
          {
            round: 1,
            matches: Array.from({ length: matchCount }, (_, i) => ({
              id: `bm-${i + 1}`,
              tournament_id: 'tournament-1',
              round: 1,
              position: i + 1,
              match_id: null,
              participant1_registration_id: null,
              participant2_registration_id: null,
              winner_registration_id: null,
              status: 'pending' as const,
              scheduled_at: null,
              category_id: 'cat-1',
              participant1: null,
              participant2: null,
              scores: []
            }))
          }
        ]
      : []
  }
}

function mountDraw(props: Record<string, unknown> = {}) {
  return mount(CategoryMatchups, {
    props: {
      bracket: bracket(0),
      format: 'single_elimination',
      pending: false,
      error: false,
      canManage: true,
      generating: false,
      generateError: '',
      locked: false,
      undoing: false,
      locking: false,
      lifecycleError: '',
      confirmedCount: 4,
      hasResults: false,
      seedPreview: [],
      capacity: 4,
      ...props
    },
    global: { stubs }
  })
}

function button(wrapper: ReturnType<typeof mountDraw>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text))
}

describe('Draw tab controls', () => {
  describe('Lock', () => {
    it('is absent before anything has been drawn', () => {
      // Locking an empty draw would tell players it is final while showing
      // them nothing; the server refuses it too (NO_BRACKET).
      const wrapper = mountDraw({ bracket: bracket(0) })
      expect(button(wrapper, 'Lock bracket')).toBeUndefined()
    })

    it('appears beside Generate once a draw exists', () => {
      const wrapper = mountDraw({ bracket: bracket(2) })

      expect(button(wrapper, 'Generate bracket') ?? button(wrapper, 'Regenerate')).toBeDefined()
      expect(button(wrapper, 'Lock bracket')).toBeDefined()
    })

    it('emits set-locked true when pressed', async () => {
      const wrapper = mountDraw({ bracket: bracket(2) })
      await button(wrapper, 'Lock bracket')!.trigger('click')

      expect(wrapper.emitted('set-locked')?.[0]).toEqual([true])
    })

    it('gives way to a locked marker and an Unlock once frozen', () => {
      const wrapper = mountDraw({ bracket: bracket(2, true), locked: true })

      expect(button(wrapper, 'Lock bracket')).toBeUndefined()
      expect(wrapper.text()).toContain('Draw locked')
      expect(button(wrapper, 'Unlock')).toBeDefined()
    })

    it('withdraws Unlock once a result has been recorded', () => {
      const wrapper = mountDraw({ bracket: bracket(2, true), locked: true, hasResults: true })

      expect(button(wrapper, 'Unlock')).toBeUndefined()
      expect(wrapper.text()).toContain('can no longer be reopened')
    })
  })

  describe('Generate', () => {
    it('is disabled, with the reason, while the category is short', () => {
      const wrapper = mountDraw({ confirmedCount: 2, capacity: 8 })

      expect(button(wrapper, 'Generate bracket')?.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('2 of 8 entries in')
      // Both ways out are named, not just the refusal.
      expect(wrapper.text()).toContain('lower the size in Settings')
    })

    it('is live once the category is full', () => {
      const wrapper = mountDraw({ confirmedCount: 8, capacity: 8 })
      expect(button(wrapper, 'Generate bracket')?.attributes('disabled')).toBeUndefined()
    })

    it('falls back to two entries when the category states no size', () => {
      expect(
        button(mountDraw({ confirmedCount: 2, capacity: null }), 'Generate bracket')?.attributes(
          'disabled'
        )
      ).toBeUndefined()
      expect(
        button(mountDraw({ confirmedCount: 1, capacity: null }), 'Generate bracket')?.attributes(
          'disabled'
        )
      ).toBeDefined()
    })

    it('disappears entirely once the draw is locked', () => {
      const wrapper = mountDraw({ bracket: bracket(2, true), locked: true })
      expect(button(wrapper, 'Generate')).toBeUndefined()
    })
  })

  describe('Undo generate', () => {
    it('is offered only when there is an unlocked, unplayed draw', () => {
      expect(button(mountDraw({ bracket: bracket(0) }), 'Undo generate')).toBeUndefined()
      expect(button(mountDraw({ bracket: bracket(2) }), 'Undo generate')).toBeDefined()
    })

    it('is withdrawn once a result exists', () => {
      const wrapper = mountDraw({ bracket: bracket(2), hasResults: true })
      expect(button(wrapper, 'Undo generate')).toBeUndefined()
    })

    it('is withdrawn once the draw is locked', () => {
      const wrapper = mountDraw({ bracket: bracket(2, true), locked: true })
      expect(button(wrapper, 'Undo generate')).toBeUndefined()
    })
  })

  describe('what a player sees', () => {
    it('is told the draw is not final yet, rather than shown an empty tab', () => {
      const wrapper = mountDraw({ canManage: false, bracket: bracket(0), locked: false })

      expect(wrapper.text()).toContain('still finalising the draw')
      expect(wrapper.text()).toContain('Players tab')
    })

    it('gets no organiser controls at all', () => {
      const wrapper = mountDraw({ canManage: false, bracket: bracket(2) })

      expect(button(wrapper, 'Generate')).toBeUndefined()
      expect(button(wrapper, 'Lock bracket')).toBeUndefined()
      expect(button(wrapper, 'Undo generate')).toBeUndefined()
    })

    it('stops being told once the draw is locked', () => {
      const wrapper = mountDraw({ canManage: false, bracket: bracket(2, true), locked: true })
      expect(wrapper.text()).not.toContain('still finalising')
    })
  })
})
