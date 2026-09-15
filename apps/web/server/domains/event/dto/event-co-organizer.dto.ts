/**
 * Co-organisers: people the event's creator lets run the event with them.
 * See database/liquibase/061-event-co-organizers for the rules.
 */
export interface EventCoOrganizerRecord {
  id: string
  event_id: string
  player_id: string
  added_by_player_id: string
  created_at: string
}

export interface EventCoOrganizerDto {
  player_id: string
  display_name: string
  avatar_url: string | null
  added_at: string
}

/** One of the creator's friends, as the picker lists them. */
export interface FriendDto {
  player_id: string
  display_name: string
  avatar_url: string | null
  /** Why they are a friend. A person can be both; the first that applies wins. */
  via: 'partner' | 'team_up'
}
