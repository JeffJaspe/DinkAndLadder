import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryCreateCard from '~/components/tournament/CategoryCreateCard.vue'
import type { TournamentCategoryTemplateDto } from '~/server/domains/event/dto/tournament-category.dto'

/**
 * The rating band a category is built from is used up by a MATCH TYPE, not on
 * its own. Keyed by template id alone, adding "4.5 Singles" removed 4.5 from
 * the picker entirely and "4.5 Doubles" — the other half of the pair a weekend
 * most often runs — could never be created at all.
 */
const templates: TournamentCategoryTemplateDto[] = [
  { id: 'tpl-35', name: '3.5', min_rating: 3.5, max_rating: 3.99, display_order: 0 },
  { id: 'tpl-45', name: '4.5', min_rating: 4.5, max_rating: 4.99, display_order: 1 }
]

function mountCard(props: Record<string, unknown> = {}) {
  return mount(CategoryCreateCard, {
    props: {
      templates,
      usedTemplates: [],
      defaultMatchType: 'singles',
      defaultFormat: 'single_elimination',
      adding: false,
      error: '',
      ...props
    }
  })
}

async function open(wrapper: ReturnType<typeof mountCard>) {
  await wrapper.find('button').trigger('click')
  return wrapper
}

function bandOptions(wrapper: ReturnType<typeof mountCard>) {
  return wrapper
    .find('#category-template')
    .findAll('option')
    .map((o) => o.text())
    .filter((text) => !text.includes('Choose a band'))
}

describe('CategoryCreateCard band availability', () => {
  it('offers every band when the tournament has no categories yet', async () => {
    const wrapper = await open(mountCard())

    expect(bandOptions(wrapper).join(' ')).toContain('3.5')
    expect(bandOptions(wrapper).join(' ')).toContain('4.5')
  })

  it('hides a band already used for the selected match type', async () => {
    const wrapper = await open(
      mountCard({ usedTemplates: [{ template_id: 'tpl-45', match_type: 'singles' }] })
    )

    expect(bandOptions(wrapper).join(' ')).not.toContain('4.5')
  })

  // The whole point: 4.5 Singles must not consume the 4.5 band for doubles.
  it('offers the same band again under the other match type', async () => {
    const wrapper = await open(
      mountCard({ usedTemplates: [{ template_id: 'tpl-45', match_type: 'singles' }] })
    )

    const doubles = wrapper.findAll('input[type="radio"][value="doubles"]')[0]
    await doubles.setValue()

    expect(bandOptions(wrapper).join(' ')).toContain('4.5')
  })

  it('clears a selection that the match-type switch took off the list', async () => {
    const wrapper = await open(
      mountCard({ usedTemplates: [{ template_id: 'tpl-45', match_type: 'doubles' }] })
    )

    const select = wrapper.find('#category-template')
    await select.setValue('tpl-45')
    expect((select.element as HTMLSelectElement).value).toBe('tpl-45')

    await wrapper.findAll('input[type="radio"][value="doubles"]')[0].setValue()

    // Leaving it selected would submit a band the organiser can no longer see.
    expect((select.element as HTMLSelectElement).value).toBe('')
  })

  it('says which match type is exhausted, not that everything is', async () => {
    const wrapper = await open(
      mountCard({
        usedTemplates: [
          { template_id: 'tpl-35', match_type: 'singles' },
          { template_id: 'tpl-45', match_type: 'singles' }
        ]
      })
    )

    expect(wrapper.text()).toContain('already used for singles')
  })
})

describe('CategoryCreateCard format', () => {
  it("starts from the tournament's format and explains it", async () => {
    const wrapper = await open(mountCard({ defaultFormat: 'round_robin' }))

    const select = wrapper.find('#new-category-format')
    expect((select.element as HTMLSelectElement).value).toBe('round_robin')
    expect(wrapper.text()).toContain('Everyone plays everyone')
  })

  it('offers all five formats', async () => {
    const wrapper = await open(mountCard())

    expect(wrapper.find('#new-category-format').findAll('option')).toHaveLength(5)
  })

  it('emits the chosen band, match type and format together', async () => {
    const wrapper = await open(mountCard())

    await wrapper.find('#category-template').setValue('tpl-35')
    await wrapper.find('#new-category-format').setValue('round_robin_double_elimination')
    await wrapper.findAll('input[type="radio"][value="doubles"]')[0].setValue()

    const buttons = wrapper.findAll('button').filter((b) => b.text() === 'Add category')
    await buttons[buttons.length - 1].trigger('click')

    expect(wrapper.emitted('add-template')?.[0][0]).toMatchObject({
      template_id: 'tpl-35',
      match_type: 'doubles',
      format: 'round_robin_double_elimination'
    })
  })

  it('sends the format on a custom category too', async () => {
    const wrapper = await open(mountCard())

    const modeButtons = wrapper.findAll('button').filter((b) => b.text() === 'Custom')
    await modeButtons[0].trigger('click')

    await wrapper.find('#custom-name').setValue('Open')
    await wrapper.find('#new-category-format').setValue('round_robin')

    const addButtons = wrapper.findAll('button').filter((b) => b.text() === 'Add category')
    await addButtons[addButtons.length - 1].trigger('click')

    expect(wrapper.emitted('add-custom')?.[0][0]).toMatchObject({
      name: 'Open',
      format: 'round_robin'
    })
  })
})
