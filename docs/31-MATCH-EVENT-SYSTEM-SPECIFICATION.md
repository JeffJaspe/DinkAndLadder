# Match & Event System Specification

## Overview

All matches must be linked to an event. Events are the container for all play activity — open play, club sessions, and tournaments.

---

## 1. Core Principle

```
Event (created by court/club/organizer)
  └── Registered Players (checked in)
        └── Matches (only between registered players)
```

**No standalone matches** — Every match belongs to an event.

---

## 2. Event Types

| Event Type | Created By | Who Can Register | Who Inputs Score | Rating Impact |
|------------|------------|------------------|------------------|---------------|
| **Open Casual** | Court/Club | Anyone | Registered players | No |
| **Open Ranked** | Court/Club | Anyone | Registered players | Yes |
| **Club Casual** | Club | Members only | Registered members | No |
| **Club Ranked** | Club | Members only | Registered members | Yes |
| **Tournament** | Organizer | Via registration | Organizer only | Yes |

---

## 3. Event Visibility

### Visibility Settings

| Setting | Who Can See Event | Who Can See Matches/Rankings |
|---------|-------------------|------------------------------|
| **Public** | Everyone | Everyone |
| **Registered Only** | Everyone (can see event exists) | Only registered players |
| **Private** | Only invited/members | Only registered players |

### Access Rules

```
Can view event details?
  → Public event: YES (everyone)
  → Private event: Only if registered OR club member

Can view event matches list?
  → Public event: YES (everyone)
  → Non-public event: Only if registered to that event

Can view event rankings/leaderboard?
  → Public event: YES (everyone)
  → Non-public event: Only if registered to that event

Can submit match?
  → Must be registered to the event
  → Must be active status (not withdrawn)
```

---

## 4. Event Lifecycle

```
DRAFT → PUBLISHED → ACTIVE → COMPLETED
                 ↓
              CANCELLED
```

| Status | Description |
|--------|-------------|
| **Draft** | Being set up, not visible to players |
| **Published** | Open for registration |
| **Active** | Event is happening, matches can be recorded |
| **Completed** | Event ended, no more matches |
| **Cancelled** | Event cancelled |

---

## 5. Player Registration Flow

### Registration States

```
REGISTERED → CHECKED_IN → (plays matches) → COMPLETED
     ↓
  WITHDRAWN
```

### Rules

1. **Must register first** — Cannot submit matches without registration
2. **Newcomers register on arrival** — Then immediately eligible to play
3. **Withdrawal** — Can withdraw, but past matches remain
4. **Re-registration** — Can re-register after withdrawal (if capacity allows)

---

## 6. Match Submission Flow

### Non-Tournament Events (Player Agreement)

```
┌─────────────────────────────────────────────────────────┐
│ 1. Player A (registered) creates match                  │
│    - Selects opponent from registered players only      │
│    - Enters score                                       │
│    - Status: PENDING_AGREEMENT                          │
├─────────────────────────────────────────────────────────┤
│ 2. Player B receives notification                       │
│    - Sees match details & proposed score                │
│    - Options: AGREE / DISPUTE / EDIT & PROPOSE          │
├─────────────────────────────────────────────────────────┤
│ 3a. AGREE → Status: VERIFIED                            │
│     - Rating calculated (if ranked event)               │
├─────────────────────────────────────────────────────────┤
│ 3b. DISPUTE → Status: DISPUTED                          │
│     - No rating impact                                  │
│     - Organizer/club staff can review                   │
├─────────────────────────────────────────────────────────┤
│ 3c. EDIT & PROPOSE → Counter-proposal                   │
│     - Player A must agree to new score                  │
│     - Max 2 rounds, then auto-dispute                   │
└─────────────────────────────────────────────────────────┘
```

### Tournament Events (Organizer Authority)

```
┌─────────────────────────────────────────────────────────┐
│ 1. Organizer selects bracket match                      │
│    - Players already assigned from bracket              │
│    - Enters score                                       │
│    - Status: VERIFIED (organizer authority)             │
├─────────────────────────────────────────────────────────┤
│ 2. Winner auto-advances in bracket                      │
├─────────────────────────────────────────────────────────┤
│ 3. Rating calculated immediately                        │
├─────────────────────────────────────────────────────────┤
│ 4. Players can dispute within 30 minutes                │
│    - Organizer reviews and can correct                  │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Event Page

### Tabs

| Tab | Content | Visibility |
|-----|---------|------------|
| **Info** | Event details, venue, schedule, rules | Based on event visibility |
| **Matches** | All matches from this event | Registered players (or public) |
| **Players** | Registered players with ratings | Registered players (or public) |
| **Rankings** | Event leaderboard (wins/losses/rating change) | Registered players (or public) |
| **Queue** | Live queue & courts (if enabled) | Registered players only |

### Event Matches List

Shows all matches recorded during the event:
- Match type (singles/doubles)
- Players involved
- Score
- Time played
- Status (pending/verified/disputed)
- Rating change (if ranked event)

Filter options:
- All / Pending / Verified / Disputed
- My matches only
- By player name

### Event Rankings/Leaderboard

For the duration of the event:
- Wins / Losses
- Win rate
- Rating change (start vs current)
- Matches played

---

## 8. Queue System (Optional)

### Organizer Settings

| Setting | Options |
|---------|---------|
| **Enable Queue** | Yes / No |
| **Courts Available** | 1-20 |
| **Queue Mode** | First come / Rating-based / Random |
| **Match Types** | Singles / Doubles / Both |
| **Auto-skip Timeout** | 1-5 minutes |

### Queue States

```
Player joins queue
     ↓
  WAITING (position in queue)
     ↓
  MATCHED (paired with opponent, assigned court)
     ↓
  PLAYING (on court)
     ↓
  COMPLETED (match recorded)
```

### Matching Logic

**First Come:**
- Take players in order they joined

**Rating-Based:**
- Pair players with closest ratings
- Threshold: within 0.5 rating points preferred

**Random:**
- Random pairing from available players

### Doubles Queue

- Join solo (system finds partner)
- Join as team (with specific partner)
- System pairs: 2 teams, or 4 solos into 2 teams

---

## 9. Database Schema

### Events Table (Enhanced)

```sql
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Host
  club_id uuid REFERENCES clubs(id),
  organizer_id uuid REFERENCES users(id) NOT NULL,
  
  -- Details
  name text NOT NULL,
  description text,
  
  -- Type
  event_type text NOT NULL CHECK (event_type IN (
    'open_casual',
    'open_ranked',
    'club_casual',
    'club_ranked',
    'tournament'
  )),
  
  -- Visibility
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN (
    'public',           -- Everyone can see event and matches
    'registered_only',  -- Event visible, matches only for registered
    'private'           -- Only invited/members can see
  )),
  
  -- Schedule
  event_date date NOT NULL,
  start_time time,
  end_time time,
  
  -- Venue
  venue_name text,
  venue_address text,
  
  -- Capacity & Fee
  max_participants int,
  fee_amount decimal,
  fee_currency text DEFAULT 'PHP',
  
  -- Queue settings (optional)
  queue_enabled boolean DEFAULT false,
  queue_courts int DEFAULT 1,
  queue_mode text DEFAULT 'first_come' CHECK (queue_mode IN (
    'first_come',
    'rating_based',
    'random'
  )),
  queue_match_types text[] DEFAULT ARRAY['singles', 'doubles'],
  queue_skip_timeout_seconds int DEFAULT 120,
  
  -- Status
  status text DEFAULT 'draft' CHECK (status IN (
    'draft',
    'published',
    'active',
    'completed',
    'cancelled'
  )),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Event Registrations

```sql
CREATE TABLE event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) NOT NULL,
  player_id uuid REFERENCES player_profiles(id) NOT NULL,
  
  -- Status
  status text DEFAULT 'registered' CHECK (status IN (
    'registered',
    'checked_in',
    'withdrawn'
  )),
  
  -- Timestamps
  registered_at timestamptz DEFAULT now(),
  checked_in_at timestamptz,
  withdrawn_at timestamptz,
  
  UNIQUE(event_id, player_id)
);
```

### Matches Table (Enhanced)

```sql
-- Add event linkage to matches
ALTER TABLE matches ADD COLUMN event_id uuid REFERENCES events(id) NOT NULL;
ALTER TABLE matches ADD COLUMN affects_rating boolean NOT NULL DEFAULT true;

-- Remove old context column if exists, event_type determines rating impact
-- affects_rating = false for casual events, true for ranked/tournament
```

### Event Queue

```sql
CREATE TABLE event_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) NOT NULL,
  player_id uuid REFERENCES player_profiles(id) NOT NULL,
  
  -- Queue type
  match_type text NOT NULL CHECK (match_type IN ('singles', 'doubles')),
  partner_id uuid REFERENCES player_profiles(id), -- For doubles
  
  -- Timing
  joined_at timestamptz DEFAULT now(),
  
  -- Status
  status text DEFAULT 'waiting' CHECK (status IN (
    'waiting',
    'matched',
    'playing',
    'completed',
    'skipped',
    'left'
  )),
  
  -- When matched
  matched_at timestamptz,
  court_number int,
  match_id uuid REFERENCES matches(id),
  
  -- Pairing info
  opponent_queue_id uuid REFERENCES event_queue(id)
);

-- Index for finding waiting players
CREATE INDEX idx_event_queue_waiting 
  ON event_queue(event_id, match_type, status, joined_at)
  WHERE status = 'waiting';
```

### Event Courts

```sql
CREATE TABLE event_courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) NOT NULL,
  court_number int NOT NULL,
  court_name text, -- Optional: "Court A", "Main Court"
  
  status text DEFAULT 'available' CHECK (status IN (
    'available',
    'playing',
    'reserved',
    'maintenance'
  )),
  
  current_match_id uuid REFERENCES matches(id),
  match_started_at timestamptz,
  
  UNIQUE(event_id, court_number)
);
```

---

## 10. API Endpoints

### Event Management

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/events` | Create event | Organizer |
| GET | `/api/v1/events` | List events (filtered) | Public |
| GET | `/api/v1/events/{id}` | Get event details | Visibility rules |
| PATCH | `/api/v1/events/{id}` | Update event | Organizer |
| POST | `/api/v1/events/{id}/publish` | Publish event | Organizer |
| POST | `/api/v1/events/{id}/activate` | Start event | Organizer |
| POST | `/api/v1/events/{id}/complete` | End event | Organizer |
| POST | `/api/v1/events/{id}/cancel` | Cancel event | Organizer |

### Registration

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/events/{id}/register` | Register to event | Player |
| POST | `/api/v1/events/{id}/check-in` | Check in | Player |
| POST | `/api/v1/events/{id}/withdraw` | Withdraw | Player |
| GET | `/api/v1/events/{id}/registrations` | List registrations | Visibility rules |

### Event Content

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/events/{id}/matches` | List event matches | Visibility rules |
| GET | `/api/v1/events/{id}/rankings` | Event leaderboard | Visibility rules |
| GET | `/api/v1/events/{id}/players` | Registered players | Visibility rules |

### Match Submission

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/events/{id}/matches` | Submit match | Registered player |
| POST | `/api/v1/matches/{id}/agree` | Agree to score | Opponent |
| POST | `/api/v1/matches/{id}/dispute` | Dispute score | Participant |
| POST | `/api/v1/matches/{id}/counter` | Counter-propose score | Opponent |

### Queue (Optional)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/events/{id}/queue` | Get queue status | Registered player |
| POST | `/api/v1/events/{id}/queue/join` | Join queue | Registered player |
| POST | `/api/v1/events/{id}/queue/leave` | Leave queue | Player in queue |
| POST | `/api/v1/events/{id}/queue/accept` | Accept match | Matched player |
| POST | `/api/v1/events/{id}/queue/skip` | Skip match | Matched player |
| GET | `/api/v1/events/{id}/courts` | Get courts status | Registered player |

---

## 11. RLS Policies

### Event Visibility

```sql
-- Public events: everyone can see
-- Registered-only: see event, but matches/rankings require registration
-- Private: only registered players or club members

CREATE POLICY events_select ON events FOR SELECT USING (
  visibility = 'public'
  OR auth.uid() IN (
    SELECT user_id FROM event_registrations er
    JOIN player_profiles pp ON er.player_id = pp.id
    WHERE er.event_id = events.id
  )
  OR (club_id IS NOT NULL AND auth.uid() IN (
    SELECT user_id FROM club_memberships cm
    JOIN player_profiles pp ON cm.player_id = pp.id
    WHERE cm.club_id = events.club_id AND cm.status = 'active'
  ))
);

-- Event matches: visibility based on event
CREATE POLICY event_matches_select ON matches FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = matches.event_id
    AND (
      e.visibility = 'public'
      OR auth.uid() IN (
        SELECT user_id FROM event_registrations er
        JOIN player_profiles pp ON er.player_id = pp.id
        WHERE er.event_id = e.id
      )
    )
  )
);
```

---

## 12. UI Pages

| Page | Description |
|------|-------------|
| `/events` | Event discovery/listing |
| `/events/[id]` | Event detail with tabs (Info, Matches, Players, Rankings, Queue) |
| `/events/[id]/matches` | Full matches list for event |
| `/events/[id]/rankings` | Event leaderboard |
| `/events/[id]/queue` | Live queue view (if enabled) |
| `/create-event` | Create new event |
| `/events/[id]/manage` | Organizer management |

---

## 13. Notifications

| Trigger | Recipients | Message |
|---------|------------|---------|
| Match submitted | Opponent(s) | "You have a match to verify" |
| Match agreed | Submitter | "Match verified" |
| Match disputed | Both parties + organizer | "Match disputed" |
| Queue matched | Both players | "Your match is ready - Court X" |
| Queue timeout | Player | "Match skipped due to timeout" |
| Event starting | All registered | "Event is now active" |
| Event ending | All registered | "Event completed" |

---

## 14. Implementation Checklist

### Database
- [ ] `017-event-system.changelog.xml` — Enhanced events, registrations, queue, courts
- [ ] Migrate existing events to new schema
- [ ] RLS policies for visibility rules

### Domain
- [ ] Update `apps/web/server/domains/event/` with new models
- [ ] Add queue service
- [ ] Add court management service

### API
- [ ] Registration endpoints
- [ ] Event content endpoints (matches, rankings, players)
- [ ] Queue endpoints
- [ ] Match agreement flow endpoints

### UI
- [ ] Event page tabs (Matches, Players, Rankings, Queue)
- [ ] Queue interface
- [ ] Match agreement flow
- [ ] Score counter-proposal UI

### Notifications
- [ ] Match agreement notifications
- [ ] Queue notifications
- [ ] Event status notifications
