/**
 * One name on one line of a score sheet.
 *
 * The score sheet, the spectator boxscore and the entry sheet all take "players
 * per side, one name per line", and all three took plain strings — which is why
 * a name on a score sheet was the one place in the app you could read who beat
 * you and not be able to open their profile.
 *
 * A bare string still works, and deliberately so: some sides are only a name (a
 * partner recorded by hand, an unresolved slot), and the entry sheet on the
 * submit form passes strings ON PURPOSE — a link there would navigate out of a
 * half-filled form when someone meant to read a name.
 */
export type PlayerLine = string | { name: string; playerId?: string | null }

export interface ResolvedPlayerLine {
  name: string
  playerId: string | null
}

/** Normalises a side so a template never has to branch on the shape. */
export function playerLines(entries: readonly PlayerLine[]): ResolvedPlayerLine[] {
  return entries.map((entry) =>
    typeof entry === 'string' ? { name: entry, playerId: null } : { ...entry, playerId: entry.playerId ?? null }
  )
}
