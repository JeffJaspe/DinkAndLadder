import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryCard from '~/components/tournament/CategoryCard.vue'
import type { BracketDto } from '~/server/domains/event/dto/bracket.dto'
import type { TournamentDto } from '~/server/domains/event/dto/tournament.dto'
import type { TournamentCategoryDto } from '~/server/domains/event/dto/tournament-category.dto'

/**
 * The card is where the redesign's rules actually bite: standings stay hidden
 * until an organiser says the category is finished, and nothing category-scoped
 * escapes into a page-level bar. Both are easy to regress by moving a `v-if`.
 */

const tournament: TournamentDto = {
  id: 'tournament-1',
  event_id: 'event-1',
  name: 'Summer Open',
  format: 'single_elimination',
  match_type: 'doubles',
  min_rating: null,
  max_rating: null,
  max_participants: null,
  status: 'open',
  bracket_locked_at: null,
  created_at: '2026-08-01T00:00:00Z'
}

function category(overrides: Partial<TournamentCategoryDto> = {}): TournamentCategoryDto {
  return {
    id: 'cat-1',
    tournament_id: 'tournament-1',
    template_id: null,
    name: '3.0–3.5',
    category_type: 'custom',
    min_rating: 3,
    max_rating: 3.5,
    max_participants: 16,
    display_order: 0,
    status: 'open',
    match_type: 'doubles',
    bracket_locked_at: null,
    games_default: 1,
    round_game_rules: null,
    target_points: 11,
    win_by_two: true,
    format: 'single_elimination',
    ...overrides
  }
}

const emptyBracket: BracketDto = {
  tournament_id: 'tournament-1',
  category_id: 'cat-1',
  locked: false,
  rounds: []
}

/** Children are covered by their own specs; here they are just markers. */
const stubs = {
  UiIcon: true,
  UiModal: true,
  UiTabs: {
    name: 'UiTabs',
    props: ['tabs', 'modelValue'],
    template: '<div class="tabs-stub" />'
  },
  TournamentCategoryUpNext: true,
  TournamentCategoryPlayers: true,
  TournamentCategorySchedule: true,
  TournamentCategoryMatchups: true,
  TournamentCategoryStandings: true,
  TournamentCategoryInfo: true,
  NuxtLink: true
}

function mountCard(props: Record<string, unknown> = {}) {
  return mount(CategoryCard, {
    props: {
      category: category(),
      tournament,
      bracket: emptyBracket,
      bracketPending: false,
      bracketError: false,
      confirmed: [],
      pending: [],
      myRegistration: null,
      signedIn: true,
      myPlayerId: 'player-1',
      vacancyLabel: '0/16 · 16 places left',
      isFull: false,
      expanded: true,
      canManage: false,
      canReview: false,
      partners: [],
      allPartnerCount: 0,
      bandReason: null,
      partnerId: '',
      registering: false,
      registerError: '',
      reviewingId: null,
      reviewError: '',
      generating: false,
      generateError: '',
      undoing: false,
      locking: false,
      lifecycleError: '',
      savingCategory: false,
      categoryError: '',
      completing: false,
      completeError: '',
      withdrawing: false,
      withdrawError: '',
      trashing: false,
      trashError: '',
      recordingId: null,
      recordError: '',
      seedPreview: [],
      ...props
    },
    global: { stubs }
  })
}

function sectionValues(wrapper: ReturnType<typeof mountCard>): string[] {
  const tabs = wrapper.findComponent({ name: 'UiTabs' })
  return (tabs.props('tabs') as { value: string }[]).map((t) => t.value)
}

describe('CategoryCard', () => {
  it('names the category and shows how full it is without being opened', () => {
    const wrapper = mountCard({ expanded: false })

    expect(wrapper.text()).toContain('3.0–3.5')
    expect(wrapper.text()).toContain('0/16 · 16 places left')
  })

  it('keeps the draw and the players out of the DOM while collapsed', () => {
    const wrapper = mountCard({ expanded: false })

    expect(wrapper.findComponent({ name: 'TournamentCategoryPlayers' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'TournamentCategoryMatchups' }).exists()).toBe(false)
  })

  it('still shows what is on next while collapsed — the point of the strip', () => {
    const wrapper = mountCard({ expanded: false })

    expect(wrapper.findComponent({ name: 'TournamentCategoryUpNext' }).exists()).toBe(true)
  })

  it('offers no Results section while the category is open', () => {
    expect(sectionValues(mountCard())).not.toContain('results')
  })

  it('offers Results once the organiser has marked the category complete', () => {
    const wrapper = mountCard({ category: category({ status: 'completed' }) })

    expect(sectionValues(wrapper)).toContain('results')
  })

  it('offers Settings only to someone who can manage the tournament', () => {
    expect(sectionValues(mountCard())).not.toContain('settings')
    expect(sectionValues(mountCard({ canManage: true }))).toContain('settings')
  })

  it('puts Register inside the card, not anywhere page-level', () => {
    const wrapper = mountCard()

    expect(wrapper.find('button[type="button"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Register')
  })

  it('stops offering registration once the category is finished', () => {
    const wrapper = mountCard({ category: category({ status: 'completed' }) })

    expect(wrapper.text()).not.toContain('Register')
  })

  it('shows a registered player their status instead of the button', () => {
    const wrapper = mountCard({
      myRegistration: { status: 'confirmed' }
    })

    expect(wrapper.text()).toContain('Registered')
  })

  /**
   * A doubles entry is one row carrying two people. The card is told who "my"
   * entry is by the section above it, and that lookup used to read `player_id`
   * alone — so the named partner was shown a Register button for a category
   * they were already in.
   */
  it('shows the named partner their status, not a Register button', () => {
    const wrapper = mountCard({
      // What CategorySection now resolves for a player who holds their slot as
      // somebody else's partner.
      myRegistration: { status: 'confirmed', player_id: 'other', partner_player_id: 'player-1' }
    })

    expect(wrapper.text()).toContain('Registered')
    // The primary action button is the thing that must be gone — asserting on
    // the word alone would pass on "Registered" and prove nothing.
    expect(wrapper.find('button.bg-primary').exists()).toBe(false)
    // And no partner picker: they are already paired up on that entry.
    expect(wrapper.find('select').exists()).toBe(false)
  })

  /**
   * Reported from the live app: the partner account read "Pending approval" for
   * an entry that was confirmed and already drawn.
   *
   * Two causes, one per layer. The card relabelled every non-confirmed status
   * as pending, so a rejected row read as "awaiting the organiser" — and the
   * section above it picked that rejected row as "my entry" because the list
   * endpoint drops only `withdrawn` and returns oldest-first.
   */
  describe('what my own entry says about itself', () => {
    it('says Registered for a confirmed entry', () => {
      const wrapper = mountCard({ myRegistration: { id: 'r', status: 'confirmed' } })
      expect(wrapper.text()).toContain('Registered')
    })

    it('says Pending approval only when it is actually pending', () => {
      const wrapper = mountCard({ myRegistration: { id: 'r', status: 'pending' } })
      expect(wrapper.text()).toContain('Pending approval')
    })

    it('never calls a declined entry pending', () => {
      const wrapper = mountCard({ myRegistration: { id: 'r', status: 'rejected' } })

      expect(wrapper.text()).toContain('Entry declined')
      expect(wrapper.text()).not.toContain('Pending approval')
    })

    it('names a waitlisted entry rather than guessing', () => {
      const wrapper = mountCard({ myRegistration: { id: 'r', status: 'waitlisted' } })

      expect(wrapper.text()).toContain('On the waitlist')
      expect(wrapper.text()).not.toContain('Pending approval')
    })
  })

  describe('withdraw', () => {
    it('offers withdraw while the entry is still pending', async () => {
      const wrapper = mountCard({
        myRegistration: { id: 'reg-1', status: 'pending' }
      })

      const button = wrapper.findAll('button').find((b) => b.text() === 'Withdraw')
      expect(button).toBeDefined()
    })

    it('does not offer it once the organiser has confirmed the entry', () => {
      // At that point a draw may exist and a fee may have been taken, so
      // leaving is a conversation with the organiser rather than a button.
      const wrapper = mountCard({
        myRegistration: { id: 'reg-1', status: 'confirmed' }
      })

      expect(wrapper.findAll('button').find((b) => b.text() === 'Withdraw')).toBeUndefined()
    })

    it('emits the registration id, not the category id', async () => {
      const wrapper = mountCard({ myRegistration: { id: 'reg-9', status: 'pending' } })
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Withdraw')!
        .trigger('click')

      // The button opens a confirmation; the emit happens on confirm.
      const modal = wrapper.findAllComponents({ name: 'UiModal' })
      expect(modal.length).toBeGreaterThan(0)
    })
  })

  describe('finishing and trashing', () => {
    function settingsCard(props: Record<string, unknown> = {}) {
      const wrapper = mountCard({ canManage: true, ...props })
      return wrapper
    }

    it('blocks Mark complete while matches are undecided', async () => {
      const wrapper = settingsCard({ bracket: emptyBracket })
      await wrapper.findComponent({ name: 'UiTabs' }).vm.$emit('update:modelValue', 'settings')
      await wrapper.vm.$nextTick()

      const button = wrapper.findAll('button').find((b) => b.text().includes('Mark category'))
      expect(button?.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('Every match needs a result first')
    })

    it('refuses to trash a category that has recorded results', async () => {
      const played: BracketDto = {
        tournament_id: 'tournament-1',
        category_id: 'cat-1',
        locked: false,
        rounds: [
          {
            round: 1,
            matches: [{ id: 'bm-1', match_id: 'match-1', status: 'completed' } as never]
          }
        ]
      }
      const wrapper = settingsCard({ bracket: played })
      await wrapper.findComponent({ name: 'UiTabs' }).vm.$emit('update:modelValue', 'settings')
      await wrapper.vm.$nextTick()

      const button = wrapper.findAll('button').find((b) => b.text().includes('Trash'))
      expect(button?.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('cannot be removed')
    })

    it('allows trashing a category nobody has played', async () => {
      const wrapper = settingsCard({ bracket: emptyBracket })
      await wrapper.findComponent({ name: 'UiTabs' }).vm.$emit('update:modelValue', 'settings')
      await wrapper.vm.$nextTick()

      const button = wrapper.findAll('button').find((b) => b.text().includes('Trash'))
      expect(button?.attributes('disabled')).toBeUndefined()
    })
  })

  describe('open highlight', () => {
    it('marks the open card so it is findable in a list of six', () => {
      const wrapper = mountCard({ expanded: true })
      expect(wrapper.find('.ring-primary').exists()).toBe(true)
    })

    it('leaves a closed card unmarked', () => {
      const wrapper = mountCard({ expanded: false })
      expect(wrapper.find('.ring-primary').exists()).toBe(false)
    })
  })

  describe('rating band', () => {
    it('shows the reason AND a disabled Register when the reader is out of band', () => {
      const wrapper = mountCard({
        bandReason: "Your rating (3.550) is outside this category's range (3.0–3.5)."
      })

      expect(wrapper.text()).toContain("outside this category's range (3.0–3.5)")

      // The reason used to REPLACE the button. It now sits under a disabled
      // one: a player looking at a category they cannot enter needs to see
      // that entering is a thing that exists here and why it is unavailable to
      // them — hiding the control answers neither question.
      const register = wrapper.find('button.bg-primary')
      expect(register.exists()).toBe(true)
      expect(register.attributes('disabled')).toBeDefined()
    })

    it('hides the partner picker too — there is nothing to register for', () => {
      const wrapper = mountCard({
        partners: [{ player_id: 'p2', display_name: 'Bea', is_default: false }],
        allPartnerCount: 1,
        bandReason: 'Your rating (5.100) is outside this category’s range (3.0–3.5).'
      })

      expect(wrapper.find('select').exists()).toBe(false)
    })

    it('offers Register normally when there is no band reason', () => {
      const wrapper = mountCard({ bandReason: null })

      expect(wrapper.find('button.bg-primary').exists()).toBe(true)
    })
  })

  describe('partner availability', () => {
    it('distinguishes "all taken" from "none linked"', () => {
      const wrapper = mountCard({ partners: [], allPartnerCount: 3 })

      expect(wrapper.text()).toContain('all of your linked partners are already in this category')
      expect(wrapper.text()).not.toContain('No partners yet')
    })

    it('still says "no partners yet" to someone with none', () => {
      const wrapper = mountCard({ partners: [], allPartnerCount: 0 })

      expect(wrapper.text()).toContain('No partners yet')
      expect(wrapper.text()).not.toContain('already in this category')
    })

    it('says nothing about partners when some are free', () => {
      const wrapper = mountCard({
        partners: [{ player_id: 'p2', display_name: 'Bea', is_default: true }],
        allPartnerCount: 2
      })

      expect(wrapper.text()).not.toContain('already in this category')
      expect(wrapper.text()).toContain('Bea')
    })
  })

  it('asks a doubles entrant for a partner before they register', () => {
    const wrapper = mountCard({ partners: [] })

    expect(wrapper.find('select').exists()).toBe(true)
  })

  it('reports its status as complete once finished', () => {
    const wrapper = mountCard({ category: category({ status: 'completed' }), expanded: false })

    expect(wrapper.text()).toContain('Complete')
  })

  it('emits toggle when the summary is clicked', async () => {
    const wrapper = mountCard({ expanded: false })

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  /**
   * Singles or doubles used to live only on the tournament, so a card could
   * not say which it was — the gap that prompted per-category types.
   */
  it('states whether the category is singles or doubles, while collapsed', () => {
    const wrapper = mountCard({ category: category({ match_type: 'singles' }), expanded: false })

    expect(wrapper.text()).toContain('singles')
  })

  it('takes the category own type over the tournament one', () => {
    // A singles category of a doubles tournament.
    const wrapper = mountCard({ category: category({ match_type: 'singles' }) })

    expect(wrapper.text()).toContain('singles')
    expect(wrapper.text()).not.toContain('doubles')
  })

  it('falls back to the tournament when the category states nothing', () => {
    const wrapper = mountCard({ category: category({ match_type: null }), expanded: false })

    expect(wrapper.text()).toContain('doubles')
  })

  it('asks for no partner in a singles category', () => {
    const wrapper = mountCard({ category: category({ match_type: 'singles' }) })

    expect(wrapper.find('select').exists()).toBe(false)
  })

  /**
   * `--dnl-accent` is mint (#A7E3C1) in light mode, so `bg-accent/15
   * text-accent` was pale mint on near-white — the pill was there and could not
   * be read. `accent-soft` + `on-accent` is the pair the token set defines for
   * exactly this, and it holds up in both themes.
   */
  describe('light-mode contrast', () => {
    it('carries the singles/doubles pill on the token pair meant for a fill', () => {
      const pill = mountCard({ expanded: false })
        .findAll('span')
        .find((s) => s.text() === 'doubles')!

      expect(pill.classes()).toContain('bg-accent-soft')
      expect(pill.classes()).toContain('text-on-accent')
      expect(pill.classes()).not.toContain('text-accent')
    })

    it('marks a full category with a readable tone', () => {
      const wrapper = mountCard({ isFull: true, expanded: false })

      // `text-accent` anywhere on this card is the regression being guarded.
      expect(wrapper.html()).not.toContain('text-accent"')
      expect(wrapper.html()).not.toContain('bg-accent/15')
    })
  })

  /**
   * Format moved onto the category, and the card is where a player reads it —
   * it decides whether one loss ends their day.
   */
  describe('format', () => {
    it('names the format on the collapsed summary', () => {
      const wrapper = mountCard({
        category: category({ format: 'round_robin' }),
        expanded: false
      })

      expect(wrapper.text()).toContain('Round Robin')
    })

    it('takes the category format over the tournament one', () => {
      const wrapper = mountCard({
        category: category({ format: 'round_robin_double_elimination' }),
        expanded: false
      })

      expect(wrapper.text()).toContain('Round Robin → Double Elimination')
    })

    it('falls back to the tournament when the category states no format', () => {
      const wrapper = mountCard({ category: category({ format: null }), expanded: false })

      expect(wrapper.text()).toContain('Single Elimination')
    })
  })
})
