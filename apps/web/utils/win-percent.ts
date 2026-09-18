/**
 * A record's win percentage, 0–100 to one decimal.
 *
 * From the row's own figure when the server computed it (the record ladder's
 * view rounds it the same way), else from wins and losses — event standings
 * and category standings carry only the counts. Null when nothing was played:
 * "0.0%" would read as a run of losses.
 */
export function winPercent(row: {
  wins?: number | null
  losses?: number | null
  win_pct?: number | null
}): number | null {
  if (row.win_pct != null) return row.win_pct
  const wins = row.wins ?? 0
  const played = wins + (row.losses ?? 0)
  return played ? Math.round((wins / played) * 1000) / 10 : null
}

export function formatWinPercent(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}%`
}
