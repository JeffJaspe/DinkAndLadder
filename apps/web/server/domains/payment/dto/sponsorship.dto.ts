export type SponsorshipTargetType = 'player' | 'club' | 'tournament'
export type SponsorshipStatus = 'pending' | 'completed' | 'failed' | 'refunded'

export interface SponsorshipRecord {
  id: string
  sponsor_player_id: string
  target_type: SponsorshipTargetType
  target_id: string
  amount_cents: number
  currency: string
  message: string | null
  is_anonymous: boolean
  stripe_payment_intent_id: string | null
  status: SponsorshipStatus
  created_at: string
  updated_at: string
}

export interface SponsorshipDto {
  id: string
  sponsor_player_id: string
  sponsor_display_name?: string
  target_type: SponsorshipTargetType
  target_id: string
  amount_cents: number
  currency: string
  message: string | null
  is_anonymous: boolean
  status: SponsorshipStatus
  created_at: string
}

export function toSponsorshipDto(
  record: SponsorshipRecord,
  sponsorDisplayName?: string
): SponsorshipDto {
  return {
    id: record.id,
    sponsor_player_id: record.sponsor_player_id,
    sponsor_display_name: record.is_anonymous ? undefined : sponsorDisplayName,
    target_type: record.target_type,
    target_id: record.target_id,
    amount_cents: record.amount_cents,
    currency: record.currency,
    message: record.message,
    is_anonymous: record.is_anonymous,
    status: record.status,
    created_at: record.created_at
  }
}

export interface CreateSponsorshipInput {
  target_type: SponsorshipTargetType
  target_id: string
  amount_cents: number
  message?: string
  is_anonymous?: boolean
}
