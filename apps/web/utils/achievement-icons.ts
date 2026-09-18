import type { IconName } from '~/utils/icons'

/**
 * Which drawn glyph each badge wears.
 *
 * `achievement_definitions.icon` holds an emoji per badge (011), and every
 * badge surface printed it in a `<span>`. That gave the gallery a tennis ball
 * for a pickleball match, a circus tent for a tournament debut, and a glyph
 * that renders differently on every platform, ignores the theme, and cannot
 * take its tier's colour. The registry in `utils/icons.ts` is the app's one
 * icon system, and badges belong to it like everything else.
 *
 * Keyed by the achievement KEY — the stable identifier the badge picker and the
 * gallery already carry — so nothing here depends on the emoji column, which
 * stays as data. The glyph says what the badge is FOR; the tier says how far
 * along it is, and colours the chip.
 */
export const ACHIEVEMENT_ICONS: Record<string, IconName> = {
  // Milestones — how much you have played
  newcomer: 'sparkles',
  first_match: 'paddle',
  regular_player: 'matches',
  dedicated_player: 'flame',
  match_master: 'crown',

  // Milestones — how much you have won
  first_victory: 'star',
  winner: 'medal',
  champion: 'trophy',

  // Skill — the rating
  rated_player: 'stats',
  rising_star: 'trending-up',
  skilled_player: 'target',
  elite_player: 'gem',

  // Social
  social_butterfly: 'players',
  community_member: 'clubs',
  club_founder: 'flag',

  // Events
  tournament_debut: 'ticket',
  competitor: 'award',
  tournament_winner: 'trophy',
  tournament_runner_up: 'medal',
  tournament_third: 'medal',
  multi_champion: 'crown',
  open_play_leader: 'rankings'
}

/** The glyph for a badge, or the generic achievement mark for one this map has not met. */
export function achievementIcon(key: string | null | undefined): IconName {
  return (key && ACHIEVEMENT_ICONS[key]) || 'achievements'
}

/**
 * The tier's colouring: chip fill and glyph ink. Platinum uses the accent
 * pair — there is no fifth metal in the rating ramp, and the accent already
 * means "beyond the ordinary tiers" on the rankings podium.
 */
export const ACHIEVEMENT_TIER_STYLES: Record<
  string,
  { chip: string; text: string; label: string }
> = {
  bronze: { chip: 'bg-rating-bronze/15', text: 'text-rating-bronze', label: 'Bronze' },
  silver: { chip: 'bg-rating-silver/15', text: 'text-rating-silver', label: 'Silver' },
  gold: { chip: 'bg-rating-gold/15', text: 'text-rating-gold', label: 'Gold' },
  platinum: { chip: 'bg-accent-soft', text: 'text-on-accent', label: 'Platinum' }
}

export function achievementTier(tier: string | null | undefined) {
  return (tier && ACHIEVEMENT_TIER_STYLES[tier]) || ACHIEVEMENT_TIER_STYLES.bronze
}
