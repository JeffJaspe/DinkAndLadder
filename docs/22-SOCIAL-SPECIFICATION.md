# Social Relationships Specification

## Purpose

Enable players to build social connections within the platform through friend relationships and blocking capabilities.

## Core Concepts

### Player Relationships
Players can establish one-to-one relationships:
- **Following**: one-way relationship (A follows B, B may or may not follow A)
- **Friends**: mutual following (both players follow each other)
- **Blocked**: one player blocks another (prevents interaction)

### Relationship Status
- `pending` — follow request sent, awaiting acceptance (if privacy requires approval)
- `active` — relationship is established
- `blocked` — one party has blocked the other

## Data Model

### player_relationships
- id (uuid, PK)
- from_player_id (FK to player_profiles)
- to_player_id (FK to player_profiles)
- relationship_type ('follow' | 'block')
- status ('pending' | 'active')
- created_at
- updated_at

Constraints:
- Unique on (from_player_id, to_player_id, relationship_type)
- No self-relationships (from_player_id != to_player_id)

## Authorization

- Players can manage their own relationships
- Following a public profile: immediate active status
- Following a private profile: pending until accepted
- Blocking: immediate, removes any existing follow relationships
- Blocked players cannot:
  - View blocker's profile
  - Send messages
  - View activity
  - Register for same tournament slot

## API Endpoints

### Relationships
- `POST /api/v1/players/{playerId}/follow` — follow a player
- `DELETE /api/v1/players/{playerId}/follow` — unfollow a player
- `POST /api/v1/players/{playerId}/block` — block a player
- `DELETE /api/v1/players/{playerId}/block` — unblock a player
- `GET /api/v1/players/me/following` — list players I follow
- `GET /api/v1/players/me/followers` — list players who follow me
- `GET /api/v1/players/me/blocked` — list blocked players
- `GET /api/v1/players/me/follow-requests` — list pending follow requests (for private profiles)
- `POST /api/v1/players/me/follow-requests/{requestId}/accept` — accept follow request
- `POST /api/v1/players/me/follow-requests/{requestId}/reject` — reject follow request

## Privacy Integration

- Public profiles: follows are immediate
- Private profiles: follows require approval
- Profile visibility affects who can see relationships
- Blocked relationships are never visible to the blocked party

## Notifications

Follow events generate notifications:
- `social.new_follower` — when someone follows you
- `social.follow_request` — when someone requests to follow your private profile
- `social.follow_accepted` — when your follow request is accepted

## Phase 3 Scope

Initial implementation:
1. Follow/unfollow public profiles
2. Block/unblock
3. Following/followers lists
4. Basic notifications

Defer to later:
- Private profile follow requests
- Mutual friends suggestions
- "People you may know" recommendations
- Social graph analytics
