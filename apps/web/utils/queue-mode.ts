import type { QueueMode } from '~/server/domains/event/dto/event.dto'

/**
 * How each queue mode is named and described to people.
 *
 * The stored enum values are unchanged — renaming a column value would mean a
 * migration and a backfill to express something only ever seen on screen. In
 * particular `random` is labelled **Mix & Match**: "random" described how the
 * scheduler was implemented, not what it does for a player, which is rotate
 * partners and opponents so that as far as possible nobody plays with or
 * against the same person twice.
 */
const LABELS: Record<QueueMode, { label: string; description: string }> = {
  first_come: {
    label: 'First come',
    description: 'Pairs play in the order they joined the queue.'
  },
  rating_based: {
    label: 'Rating based',
    description: 'Players of a similar rating are matched together.'
  },
  random: {
    label: 'Mix & Match',
    description: 'No repeated partners or opponents — join on your own, the rotation pairs you.'
  }
}

export function queueModeLabel(mode: QueueMode | string | null | undefined): string {
  if (!mode) return 'Unknown'
  return LABELS[mode as QueueMode]?.label ?? mode.replace(/_/g, ' ')
}

export function queueModeDescription(mode: QueueMode | string | null | undefined): string {
  if (!mode) return ''
  return LABELS[mode as QueueMode]?.description ?? ''
}

/** Mix & Match forms the pairs itself, so entrants join solo. */
export function queuePairsAutomatically(mode: QueueMode | string | null | undefined): boolean {
  return mode === 'random'
}
