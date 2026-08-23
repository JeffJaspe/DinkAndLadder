import { serverSupabaseServiceRole } from '#supabase/server'

interface ClubListItem {
  id: string
  name: string
  description: string | null
  city: string | null
  province: string | null
  verification_status: 'pending' | 'verified' | 'rejected'
  is_verified: boolean
  is_private: boolean
  member_count: number
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 20, 100)
  const offset = Number(query.offset) || 0

  const client = serverSupabaseServiceRole(event)

  const { data: clubs, error } = await client
    .from('clubs')
    .select('id, name, description, city, province, verification_status, visibility')
    .order('verification_status', { ascending: false })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) throw error

  interface ClubRow {
    id: string
    name: string
    description: string | null
    city: string | null
    province: string | null
    verification_status: ClubListItem['verification_status']
    visibility: string | null
  }
  const clubRows = (clubs ?? []) as unknown as ClubRow[]

  // Get member counts
  const clubIds = clubRows.map((c) => c.id)
  const { data: memberCounts } = await client
    .from('club_memberships')
    .select('club_id')
    .in('club_id', clubIds)
    .in('status', ['active', 'owner'])

  const countByClub = new Map<string, number>()
  for (const m of memberCounts ?? []) {
    countByClub.set(m.club_id, (countByClub.get(m.club_id) ?? 0) + 1)
  }

  const items: ClubListItem[] = clubRows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    city: c.city,
    province: c.province,
    verification_status: c.verification_status,
    is_verified: c.verification_status === 'verified',
    is_private: c.visibility === 'private',
    member_count: countByClub.get(c.id) ?? 0
  }))

  return { data: items }
})
