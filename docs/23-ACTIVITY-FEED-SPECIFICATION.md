# Activity Feed Specification

## Purpose

Provide players with a personalized feed of activities from players they follow, clubs they belong to, and their own activity history.

## Core Concepts

### Activity Types
Activities are generated from domain events:

**Player Activities**
- `match.verified` — a match was verified
- `rating.changed` — player's rating changed
- `achievement.earned` — player earned an achievement
- `profile.updated` — player updated their profile

**Club Activities**
- `club.event_created` — club created a new event
- `club.member_joined` — new member joined the club
- `club.announcement` — club posted an announcement

**Social Activities**
- `social.started_following` — player started following someone

### Activity Visibility
- Public activities: visible to anyone
- Followers-only: visible to followers and the player
- Club-only: visible to club members
- Private: visible only to the player

## Data Model

### activities
- id (uuid, PK)
- actor_player_id (FK to player_profiles, nullable for system activities)
- actor_club_id (FK to clubs, nullable)
- activity_type (enum)
- reference_type (entity type: 'match', 'rating', 'club', etc.)
- reference_id (uuid)
- visibility ('public' | 'followers' | 'club' | 'private')
- metadata (jsonb — additional context for rendering)
- created_at

### activity_feed_items
Denormalized feed items for efficient querying:
- id (uuid, PK)
- player_id (FK to player_profiles — the feed owner)
- activity_id (FK to activities)
- is_read (boolean)
- created_at

## Feed Generation

Two strategies (can be combined):

### Pull-based (simpler, initial implementation)
Query activities at read time:
1. Get player's following list
2. Get player's club memberships
3. Query activities where:
   - actor is in following list AND visibility in ('public', 'followers')
   - OR actor_club is in memberships AND visibility in ('public', 'club')
   - OR actor is self

### Push-based (scalable, future)
Fan-out activities to followers' feeds at write time:
1. On activity creation, insert into activity_feed_items for each eligible follower
2. Periodic cleanup of old feed items

## API Endpoints

- `GET /api/v1/feed` — get personalized activity feed (paginated)
- `GET /api/v1/feed/unread-count` — get count of unread items
- `POST /api/v1/feed/mark-read` — mark items as read
- `GET /api/v1/players/{playerId}/activities` — get a player's public activities
- `GET /api/v1/clubs/{clubId}/activities` — get a club's activities

## Query Parameters

- `limit` (default 20, max 50)
- `offset` or `cursor` (for pagination)
- `types` (filter by activity types)
- `since` (timestamp, for real-time updates)

## Authorization

- Feed items respect original activity visibility
- Blocked players' activities are hidden
- Private profiles show limited activity to non-followers

## Phase 3 Scope

Initial implementation:
1. Activity model and repository
2. Activity generation from match verification and rating changes
3. Pull-based feed query
4. Basic feed UI
5. Unread tracking

Defer to later:
- Push-based fan-out
- Real-time updates (WebSocket/SSE)
- Activity aggregation ("X and 5 others played matches")
- Rich media previews
- Activity reactions/comments
