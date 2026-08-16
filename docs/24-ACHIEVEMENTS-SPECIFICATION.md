# Achievements Specification

## Purpose

Gamify the player experience by awarding achievements for milestones, encouraging engagement and progression.

## Core Concepts

### Achievement Categories
- **Milestones**: cumulative progress (matches played, wins, clubs joined)
- **Skill**: rating-based (reached 4.0, improved by 0.5)
- **Social**: community engagement (followers, clubs created)
- **Events**: tournament participation (first tournament, tournament win)
- **Streaks**: consecutive activity (weekly match streak)

### Achievement Tiers
Each achievement can have multiple tiers:
- Bronze (entry level)
- Silver (intermediate)
- Gold (advanced)
- Platinum (elite)

### Achievement Status
- `locked` — not yet earned
- `unlocked` — earned, timestamp recorded
- `claimed` — player has viewed/acknowledged (for UI purposes)

## Data Model

### achievement_definitions
Static definition of all achievements:
- id (uuid, PK)
- key (unique string identifier, e.g., 'matches_played_10')
- category (enum)
- tier (enum)
- name (display name)
- description (how to earn)
- icon (icon identifier or emoji)
- criteria (jsonb — machine-readable unlock criteria)
- points (numeric — for leaderboards/gamification)
- is_active (boolean — can be disabled)
- created_at

### player_achievements
Player's earned achievements:
- id (uuid, PK)
- player_id (FK to player_profiles)
- achievement_id (FK to achievement_definitions)
- unlocked_at (timestamptz)
- claimed_at (timestamptz, nullable)
- progress (jsonb, nullable — for partial progress tracking)
- created_at

Constraint: unique on (player_id, achievement_id)

## Achievement Criteria Examples

```json
// Matches played milestone
{
  "type": "count",
  "entity": "matches",
  "filter": { "status": "verified" },
  "threshold": 10
}

// Rating reached
{
  "type": "threshold",
  "entity": "rating",
  "rating_type": "singles",
  "threshold": 4.0
}

// Win streak
{
  "type": "streak",
  "entity": "matches",
  "filter": { "result": "won" },
  "threshold": 5
}
```

## Achievement Evaluation

### Trigger Points
Achievements are evaluated when relevant events occur:
- `match.verified` — check match count, win count, streak achievements
- `rating.changed` — check rating milestones
- `club.joined` — check club count achievements
- `social.followed` — check follower milestones

### Evaluation Strategy
1. On trigger event, identify candidate achievements
2. Query player's current progress
3. Compare against criteria
4. Unlock if criteria met
5. Generate notification

## API Endpoints

- `GET /api/v1/achievements` — list all achievement definitions
- `GET /api/v1/players/me/achievements` — get own achievements (locked and unlocked)
- `GET /api/v1/players/{playerId}/achievements` — get player's public achievements
- `POST /api/v1/players/me/achievements/{achievementId}/claim` — mark as claimed
- `GET /api/v1/achievements/leaderboard` — top players by achievement points

## Notifications

- `achievement.unlocked` — when player earns a new achievement

## Initial Achievements (Phase 3)

### Match Milestones
- First Match (1 verified match)
- Regular Player (10 matches)
- Dedicated Player (50 matches)
- Match Master (100 matches)

### Win Milestones
- First Victory (1 win)
- Winner (10 wins)
- Champion (50 wins)

### Rating Milestones
- Rated Player (received first rating)
- Rising Star (reached 3.5)
- Skilled Player (reached 4.0)
- Elite Player (reached 4.5)

### Social Milestones
- Social Butterfly (5 followers)
- Community Member (joined first club)
- Club Founder (created a club)

### Event Milestones
- Tournament Debut (first tournament registration)
- Competitor (5 tournaments)

## Phase 3 Scope

Initial implementation:
1. Achievement definitions table with seed data
2. Player achievements tracking
3. Evaluation service for match/rating triggers
4. Achievement listing UI
5. Unlock notifications

Defer to later:
- Streak tracking (requires historical analysis)
- Achievement leaderboard
- Rare/seasonal achievements
- Achievement sharing
