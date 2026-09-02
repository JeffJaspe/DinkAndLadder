import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createEventRepository } from '../../server/domains/event/repositories/event.repository'

/**
 * Records the PostgREST filter calls the repository makes, so the draft
 * visibility rule can be asserted without a database. The builder is
 * chainable and resolves to an empty result when awaited.
 */
function createRecordingClient() {
  const calls: Array<{ method: string; args: unknown[] }> = []

  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'or', 'neq', 'eq', 'order', 'range']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  // Awaiting the builder resolves like a PostgREST response.
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null })

  const client = { from: () => builder } as unknown as SupabaseClient
  return { client, calls }
}

const baseQuery = { limit: 20, offset: 0 }
const PLAYER_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

describe('EventRepository.search — draft visibility', () => {
  it('excludes drafts outright when no player is supplied', async () => {
    const { client, calls } = createRecordingClient()

    await createEventRepository(client).search({ ...baseQuery })

    expect(
      calls.some((c) => c.method === 'neq' && c.args[0] === 'status' && c.args[1] === 'draft')
    ).toBe(true)
    expect(calls.some((c) => c.method === 'or')).toBe(false)
  })

  it("includes the caller's own drafts alongside published events", async () => {
    const { client, calls } = createRecordingClient()

    await createEventRepository(client).search({
      ...baseQuery,
      include_drafts_for_player_id: PLAYER_ID
    })

    const or = calls.find((c) => c.method === 'or')
    expect(or, 'expected an OR filter widening the query to own drafts').toBeDefined()
    expect(or?.args[0]).toBe(`status.neq.draft,created_by_player_id.eq.${PLAYER_ID}`)

    // The blanket DRAFT exclusion must be gone, or the OR can never match a
    // draft. The cancelled exclusion is a separate rule and stays.
    expect(
      calls.some((c) => c.method === 'neq' && c.args[0] === 'status' && c.args[1] === 'draft')
    ).toBe(false)
  })

  it('still restricts to the requested visibility when including drafts', async () => {
    const { client, calls } = createRecordingClient()

    await createEventRepository(client).search({
      ...baseQuery,
      include_drafts_for_player_id: PLAYER_ID
    })

    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'visibility')).toBe(true)
  })

  it('refuses a player id that is not a UUID rather than interpolating it', async () => {
    // The value lands inside a PostgREST filter expression, so a non-UUID must
    // never reach the query string.
    const { client } = createRecordingClient()

    await expect(
      createEventRepository(client).search({
        ...baseQuery,
        include_drafts_for_player_id: 'x,created_by_player_id.neq.null'
      })
    ).rejects.toThrow(/UUID/)
  })
})

/**
 * A cancelled session is not something anybody can turn up to, so it does not
 * belong in a browse list beside the ones that are happening — but it must stay
 * reachable for somebody who asks for it by name.
 */
describe('EventRepository.search — cancelled events', () => {
  it('leaves cancelled events out of an unfiltered listing', async () => {
    const { client, calls } = createRecordingClient()

    await createEventRepository(client).search({ ...baseQuery })

    expect(
      calls.some((c) => c.method === 'neq' && c.args[0] === 'status' && c.args[1] === 'cancelled')
    ).toBe(true)
  })

  it('returns them when they are what was asked for', async () => {
    const { client, calls } = createRecordingClient()

    await createEventRepository(client).search({ ...baseQuery, status: 'cancelled' })

    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'status')).toBe(true)
    expect(
      calls.some((c) => c.method === 'neq' && c.args[0] === 'status' && c.args[1] === 'cancelled')
    ).toBe(false)
  })

  it('includes them when the caller opts in', async () => {
    const { client, calls } = createRecordingClient()

    await createEventRepository(client).search({ ...baseQuery, include_cancelled: true })

    expect(
      calls.some((c) => c.method === 'neq' && c.args[0] === 'status' && c.args[1] === 'cancelled')
    ).toBe(false)
  })
})
