import type { SupabaseClient } from '@supabase/supabase-js'
import { createTournamentPlacementRepository } from '../repositories/tournament-placement.repository'

/**
 * A title, as the profile shows it.
 *
 * `href` is resolved here rather than in the page because where a draw lives is
 * a server-side fact about the data — a title whose tournament has no event row
 * has nowhere to go, and the page should not have to guess a URL that 404s.
 */
export interface ChampionshipDto {
  placement: 1 | 2
  tournament_id: string
  category_id: string | null
  /** "Summer Slam — 3.5 Mixed Doubles", or just the event when there is no category. */
  label: string
  /** The draw's own name, for the hover title. */
  event_name: string | null
  category_name: string | null
  decided_at: string | null
  /** Deep link to the draw, or null when the tournament has no event to link to. */
  href: string | null
}

export interface ChampionshipService {
  /** Titles won by this player, most recent first. First place only. */
  championshipsFor(playerId: string): Promise<ChampionshipDto[]>
}

export function createChampionshipService(client: SupabaseClient): ChampionshipService {
  return {
    async championshipsFor(playerId) {
      // A doubles entry is one registration shared by two players, and either
      // of them can be the `partner_player_id` rather than the `player_id`. Both
      // sides hold the title, so both columns are matched.
      const { data, error } = await client
        .from('tournament_registrations')
        .select('id, tournament_id')
        .or(`player_id.eq.${playerId},partner_player_id.eq.${playerId}`)
        .neq('status', 'cancelled')

      if (error) throw error

      const registrations = (data ?? []) as { id: string; tournament_id: string }[]
      if (registrations.length === 0) return []

      const placements =
        await createTournamentPlacementRepository(client).findByRegistrations(registrations)

      return placements
        .filter((p) => p.placement === 1)
        .map((p) => ({
          placement: p.placement,
          tournament_id: p.tournament_id,
          category_id: p.category_id,
          label: [p.event_name ?? p.tournament_name ?? 'Tournament', p.category_name]
            .filter(Boolean)
            .join(' — '),
          event_name: p.event_name ?? p.tournament_name,
          category_name: p.category_name,
          decided_at: p.decided_at,
          // The event page splits the draw per category and anchors each one,
          // so the category travels as a query param it reads on load.
          href: p.event_id
            ? `/events/${p.event_id}${p.category_id ? `?category=${p.category_id}` : ''}`
            : null
        }))
    }
  }
}
