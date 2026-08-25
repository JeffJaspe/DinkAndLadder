/**
 * Event start/end times are wall-clock `time` values (`HH:MM` or `HH:MM:SS`),
 * not timestamps — see 028-event-time.changelog.xml for why. That means they
 * must never go through `new Date()`, which would attach today's date and the
 * viewer's timezone to a value that has neither.
 *
 * Both helpers return an empty string when there is nothing to show, so a
 * caller can render `v-if` on the result and every event created before the
 * migration keeps displaying its date alone.
 */

/** `18:00` -> `6:00 PM`. */
export function formatEventTime(time: string | null | undefined): string {
  if (!time) return ''
  const [rawHours, rawMinutes] = time.split(':')
  const hours = Number(rawHours)
  const minutes = Number(rawMinutes)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return ''

  const suffix = hours < 12 ? 'AM' : 'PM'
  // 0 and 12 both display as 12 on a 12-hour clock.
  const displayHour = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`
}

/** `18:00`,`21:00` -> `6:00 PM – 9:00 PM`; an end alone is not a range. */
export function formatEventTimeRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const startLabel = formatEventTime(start)
  if (!startLabel) return ''
  const endLabel = formatEventTime(end)
  return endLabel ? `${startLabel} – ${endLabel}` : startLabel
}
