# Public API Specification

## Overview

The Public API allows external applications to integrate with DinkAndLadder. It provides read-only access to public data (players, clubs, rankings, events) and authenticated access for managing user data.

## Authentication

### API Keys
External applications authenticate using API keys:
- Keys are scoped to a player account
- Keys have configurable permissions (read-only, write)
- Keys can be revoked at any time

### Key Format
```
dnl_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
dnl_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Rate Limiting

- **Anonymous**: 60 requests/minute
- **Authenticated**: 300 requests/minute
- **Premium**: 1000 requests/minute (for subscribed users)

Rate limit headers:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 299
X-RateLimit-Reset: 1629900000
```

## Endpoints

### Public (No auth required)

```
GET /api/public/v1/players/{playerId}
GET /api/public/v1/players/{playerId}/stats
GET /api/public/v1/players/{playerId}/ratings
GET /api/public/v1/clubs/{clubId}
GET /api/public/v1/rankings?rating_type=singles&region=NCR
GET /api/public/v1/events?status=published
GET /api/public/v1/events/{eventId}
GET /api/public/v1/regions
GET /api/public/v1/regions/{code}/provinces
```

### Authenticated (API key required)

```
GET /api/public/v1/me
GET /api/public/v1/me/matches
GET /api/public/v1/me/clubs
POST /api/public/v1/matches (submit match)
```

## Database Schema

### API Keys Table
```sql
api_keys (
  id: uuid PK,
  player_id: uuid FK → player_profiles,
  key_hash: varchar(64),  -- SHA-256 hash of the key
  key_prefix: varchar(12), -- First 12 chars for display
  name: varchar(100),
  permissions: varchar(20)[], -- ['read', 'write']
  last_used_at: timestamptz,
  expires_at: timestamptz,
  is_active: boolean,
  created_at: timestamptz
)
```

### Webhook Subscriptions Table
```sql
webhook_subscriptions (
  id: uuid PK,
  player_id: uuid FK → player_profiles,
  url: varchar(500),
  secret: varchar(64),  -- For signature verification
  events: varchar(50)[], -- ['match.verified', 'rating.changed']
  is_active: boolean,
  last_triggered_at: timestamptz,
  failure_count: integer,
  created_at: timestamptz
)
```

## Webhook Events

Supported events:
- `match.verified` — A match involving the user was verified
- `rating.changed` — User's rating changed
- `club.member_joined` — New member joined user's club
- `tournament.registration_opened` — Tournament registration opened

Payload format:
```json
{
  "event": "match.verified",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "match_id": "uuid",
    "status": "verified"
  }
}
```

Signature header:
```
X-DnL-Signature: sha256=xxxxx
```

## API Endpoints for Key Management

```
GET /api/v1/api-keys — List own API keys
POST /api/v1/api-keys — Create new API key
DELETE /api/v1/api-keys/{keyId} — Revoke key
```

## Implementation Order

1. API keys table + RLS
2. Key generation service
3. API key authentication middleware
4. Public API endpoints
5. Webhook subscriptions
6. Webhook delivery service
