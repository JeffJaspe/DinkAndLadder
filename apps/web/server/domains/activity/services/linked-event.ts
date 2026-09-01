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
  reference_type?: string | null
  reference_id?: string | null
  event?: LinkedEvent | null
}

/**
 * Where an activity's event id actually lives.
 *
 * Two conventions, both real. A shout-out carries the id in its metadata
 * (ActivityLogger.logShoutout) because the activity's own reference points at
 * the player. `club.event_created` instead uses the row's reference columns —
 * `reference_type: 'event'`, `reference_id: <event id>` — and puts only the
 * name in metadata. Reading only the first convention is why "created an
 * event: X" was never a link.
 */
function eventIdFor(activity: ActivityWithLinkedEvent): string | null {
  const fromMetadata = (activity.metadata as Record<string, unknown> | null)?.event_id
  if (typeof fromMetadata === 'string') return fromMetadata
  if (activity.reference_type === 'event' && typeof activity.reference_id === 'string') {
    return activity.reference_id
  }
  return null
}

/**
 * Resolve the events activities point at, in one round trip for the whole page.
 *
 * The id rides either in the metadata or in the reference columns (see
 * `eventIdFor`), so this is a lookup rather than a join — and an event that has
 * since been deleted simply resolves to nothing, leaving the activity to stand
 * on its own.
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
    ...new Set(activities.map(eventIdFor).filter((id): id is string => id !== null))
  ]
  if (eventIds.length === 0) return activities

  const { data } = await client
    .from('events')
    .select('id, name, start_date, city, venue')
    .in('id', eventIds)

  const byId = new Map(((data ?? []) as LinkedEvent[]).map((e) => [e.id, e]))

  return activities.map((a) => {
    const id = eventIdFor(a)
    return id === null ? a : { ...a, event: byId.get(id) ?? null }
  })
}
