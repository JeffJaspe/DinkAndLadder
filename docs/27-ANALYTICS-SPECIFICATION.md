# Analytics Domain Specification

## Overview

The Analytics domain provides aggregated statistics and historical trends for players, clubs, and the platform. Analytics data powers dashboards, player insights, and club reporting.

## Design Principles

1. **Read-heavy**: Analytics are computed from existing data, not separate write operations
2. **Cacheable**: Use materialized views or periodic aggregation for expensive queries
3. **Scoped**: Players see own stats, club admins see club stats, platform stats are public

## Player Analytics

### Stats Available

```typescript
interface PlayerStats {
  player_id: string
  
  // Match statistics
  total_matches: number
  singles_matches: number
  doubles_matches: number
  wins: number
  losses: number
  win_rate: number // 0-100
  
  // Rating
  current_singles_rating: number | null
  current_doubles_rating: number | null
  highest_singles_rating: number | null
  highest_doubles_rating: number | null
  rating_trend: 'rising' | 'falling' | 'stable'
  
  // Activity
  matches_this_month: number
  clubs_count: number
  tournaments_participated: number
  
  // Social
  followers_count: number
  following_count: number
  achievements_count: number
  achievement_points: number
}
```

### Rating History

```typescript
interface RatingHistoryPoint {
  date: string // ISO date
  rating_value: number
  rating_type: 'singles' | 'doubles'
  match_id: string | null
}
```

## Club Analytics

### Stats Available (Admin only)

```typescript
interface ClubStats {
  club_id: string
  
  // Membership
  total_members: number
  active_members: number // played match in last 30 days
  new_members_this_month: number
  
  // Activity
  matches_this_month: number
  tournaments_hosted: number
  events_hosted: number
  
  // Growth
  member_growth_rate: number // percent change last 30 days
  
  // Engagement
  announcements_this_month: number
  avg_rating: number | null
}
```

## API Endpoints

### Player Analytics
- `GET /api/v1/players/{playerId}/stats` — player statistics (public for public profiles)
- `GET /api/v1/players/{playerId}/rating-history?type=singles|doubles&days=90` — rating over time
- `GET /api/v1/players/me/insights` — personalized insights (own stats + comparisons)

### Club Analytics
- `GET /api/v1/clubs/{clubId}/stats` — club statistics (admin only)
- `GET /api/v1/clubs/{clubId}/activity` — recent club activity feed

### Platform Analytics
- `GET /api/v1/analytics/leaderboard-stats` — platform-wide stats (public)

## Implementation Notes

1. **No separate tables initially**: Compute from existing match, rating, membership data
2. **Add caching later**: Redis or materialized views when performance requires
3. **Respect privacy**: Only show stats for public profiles
4. **Rating history**: Already exists in `rating_transactions` table

## Out of Scope (Phase 5)

- Real-time analytics
- Export to CSV/PDF
- Custom date range queries (use fixed periods: 7d, 30d, 90d, all-time)
- Club comparison features
