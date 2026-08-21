export interface BadgeShowcaseRecord {
  player_id: string
  selected_badge_id: string | null
  updated_at: string
}

export interface BadgeShowcaseDto {
  playerId: string
  selectedBadgeId: string | null
  updatedAt: string
}

export interface SetBadgeInput {
  badge_id: string | null
}

export interface BadgeDefinition {
  id: string
  name: string
  icon: string
  description: string
  category: 'achievement' | 'milestone' | 'social' | 'special'
}

export const AVAILABLE_BADGES: BadgeDefinition[] = [
  { id: 'tournament_winner', name: 'Tournament Champion', icon: '🏆', description: 'Won first place in a tournament', category: 'achievement' },
  { id: 'tournament_runner_up', name: 'Runner Up', icon: '🥈', description: 'Placed second in a tournament', category: 'achievement' },
  { id: 'tournament_third', name: 'Third Place', icon: '🥉', description: 'Placed third in a tournament', category: 'achievement' },
  { id: 'match_master', name: 'Match Master', icon: '🎾', description: 'Completed 100+ matches', category: 'milestone' },
  { id: 'dedicated_player', name: 'Dedicated Player', icon: '⭐', description: 'Completed 50+ matches', category: 'milestone' },
  { id: 'regular_player', name: 'Regular Player', icon: '🌟', description: 'Completed 10+ matches', category: 'milestone' },
  { id: 'club_founder', name: 'Club Founder', icon: '🏛️', description: 'Created a club', category: 'social' },
  { id: 'social_butterfly', name: 'Social Butterfly', icon: '🦋', description: 'Has 5+ followers', category: 'social' },
  { id: 'rising_star', name: 'Rising Star', icon: '📈', description: 'Reached 3.5+ rating', category: 'milestone' },
  { id: 'elite_player', name: 'Elite Player', icon: '💎', description: 'Reached 4.5+ rating', category: 'milestone' },
]

export function badgeShowcaseRecordToDto(record: BadgeShowcaseRecord): BadgeShowcaseDto {
  return {
    playerId: record.player_id,
    selectedBadgeId: record.selected_badge_id,
    updatedAt: record.updated_at
  }
}

export function getBadgeById(badgeId: string): BadgeDefinition | undefined {
  return AVAILABLE_BADGES.find(b => b.id === badgeId)
}
