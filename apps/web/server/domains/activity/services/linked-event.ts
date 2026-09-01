import type { SupabaseClient } from '@supabase/supabase-js'

/** The little bit of an event a shout-out needs to render a link to it. */
export interface LinkedEvent {
  id: string
  name: string
  start_date: string
  city: string | null
  venue: string | null
}

export interface ActivityWithLinkedEvent {
  metadata?: Record<string, unknown> | null
  event?: LinkedEvent | null
}

/**
 * Resolve the events shout-outs point at, in one round trip for the whole page.
 *
 * The id rides in the activity metadata (see ActivityLogger.logShoutout), so
 * this is a lookup rather than a join — and an event that has since been
 * deleted simply resolves to nothing, leaving the message to stand on its own.
 *
 * This lived as a private function inside the feed endpoint, which is why the
 * link only ever worked there: a shout-out shown on a player's profile came
 * back with no `event` at all, so the profile could not render the link even
 * though the data existed one query away. Living in the domain, both callers
 * get the same enrichment.
 */
export async function attachLinkedEvents<T extends ActivityWithLinkedEvent>(
  client: SupabaseClient,
  activities: T[]
): Promise<T[]> {
  const eventIds = [
    ...new Set(
      activities
        .map((a) => (a.metadata as Record<string, unknown> | null)?.event_id)
        .filter((id): id is string => typeof id === 'string')
    )
  ]
  if (eventIds.length === 0) return activities

  const { data } = await client
    .from('events')
    .select('id, name, start_date, city, venue')
    .in('id', eventIds)

  const byId = new Map(((data ?? []) as LinkedEvent[]).map((e) => [e.id, e]))

  return activities.map((a) => {
    const id = (a.metadata as Record<string, unknown> | null)?.event_id
    return typeof id === 'string' ? { ...a, event: byId.get(id) ?? null } : a
  })
}
