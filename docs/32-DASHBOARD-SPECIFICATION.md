# Dashboard Specification

## Principle

**Player Dashboard** = All about YOU (the player)
**Club Dashboard** = All about THE CLUB

No cross-contamination. Player dashboard doesn't show other players' rankings podium. Club dashboard shows club-specific content.

---

## 1. Player Dashboard (`/dashboard`)

### Content (All Player-Related)

| Section | Data Source | Description |
|---------|-------------|-------------|
| **Welcome Header** | `/api/v1/auth/me`, `/api/v1/players/me` | Name, greeting |
| **My Rating** | `/api/v1/players/me/ratings` | Singles/doubles toggle, rating value, tier |
| **My Rank** | `/api/v1/rankings` + find self | Position, location, percentile |
| **Rating Progress** | `/api/v1/players/me/rating-history` | Chart of rating over time |
| **My Recent Matches** | `/api/v1/matches?player=me&limit=5` | Last 5 matches with results |
| **Pending Actions** | Multiple APIs | Matches to verify, club invites, etc. |
| **My Upcoming Events** | `/api/v1/events?registered=me` | Events I'm registered for |
| **My Clubs** | `/api/v1/clubs/mine` | Quick links to my clubs |
| **Quick Actions** | Static links | Submit match, find events, etc. |

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ Welcome back, [Name]! 👋                                │
│ Let's climb the ladder today.                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────┐  ┌────────────────────────────┐ │
│ │ MY RATING           │  │ MY RANK                    │ │
│ │ [Singles] [Doubles] │  │ #12 in Cebu City           │ │
│ │                     │  │ Top 5% of players          │ │
│ │ 3.85  Intermediate  │  │                            │ │
│ │ ▲ +0.12 this month  │  │ ▲ +3 positions this week   │ │
│ └─────────────────────┘  └────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ MY RATING PROGRESS                      [1W][1M][ALL]│ │
│ │ ████████████████████████████████████████████████████ │ │
│ │ 3.2 ─────────────────────────────────────────── 3.85 │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ PENDING ACTIONS (3)                                 │ │
│ │ ⚠️ 2 matches waiting for your verification          │ │
│ │ 📩 1 club invitation pending                        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ MY RECENT MATCHES                       [View All →]│ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ 🏆 Won vs Maria Santos  11-9, 11-7   Yesterday  │ │ │
│ │ │ ❌ Lost vs Juan Cruz    8-11, 11-9, 9-11  2d ago│ │ │
│ │ │ 🏆 Won vs Pedro Reyes   11-5, 11-6   3d ago     │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ MY UPCOMING EVENTS                      [View All →]│ │
│ │ 📅 Saturday Open Play - Metro Courts - Aug 20      │ │
│ │ 📅 Club Ladder Night - Cebu Picklers - Aug 22      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ MY CLUBS                                [View All →]│ │
│ │ 🏸 Cebu Picklers (Member)                          │ │
│ │ 🏸 Metro Pickleball (Admin)                        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────┬─────────┬─────────┬─────────┐             │
│ │ Find    │ Find    │ My      │ My      │             │
│ │ Events  │ Players │ Stats   │ Profile │             │
│ └─────────┴─────────┴─────────┴─────────┘             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### NOT on Player Dashboard
- ❌ Other players' rankings/podium
- ❌ Global leaderboard (that's `/rankings`)
- ❌ Club-specific stats
- ❌ Club announcements (that's on club page)

---

## 2. Club Dashboard (`/clubs/[clubId]`)

### Content (All Club-Related)

| Section | Data Source | Description |
|---------|-------------|-------------|
| **Club Header** | `/api/v1/clubs/{id}` | Name, logo, description, member count |
| **Club Stats** | `/api/v1/clubs/{id}/stats` | Total members, matches, events |
| **Top Members Podium** | `/api/v1/clubs/{id}/rankings` | Top 3 rated club members |
| **Club Rankings** | `/api/v1/clubs/{id}/rankings` | Full member leaderboard |
| **Recent Club Matches** | `/api/v1/clubs/{id}/matches` | Matches between club members |
| **Previous Events** | `/api/v1/clubs/{id}/events?status=completed` | Past club events |
| **Upcoming Events** | `/api/v1/clubs/{id}/events?status=published,active` | Future events |
| **Announcements** | `/api/v1/clubs/{id}/announcements` | Club news (staff can post) |
| **Members** | `/api/v1/clubs/{id}/members` | Member list |

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ 🏸 CEBU PICKLERS                                        │
│ The premier pickleball community in Cebu                │
│ 48 members • Cebu City • Public                         │
│                                                         │
│ [Join Club]  [Share]                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ CLUB STATS                                          │ │
│ │ 👥 48 Members  🎾 324 Matches  📅 12 Events        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ TOP MEMBERS                             [Rankings →]│ │
│ │                                                     │ │
│ │      🥈            👑🥇           🥉               │ │
│ │    Kevin         Miguel        James               │ │
│ │    5.12          5.34          4.98                │ │
│ │   ┌────┐       ┌──────┐      ┌────┐               │ │
│ │   │ 2  │       │  1   │      │ 3  │               │ │
│ │   └────┘       └──────┘      └────┘               │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ANNOUNCEMENTS                           [View All →]│ │
│ │ 📢 Tournament next Saturday! Register now.  2h ago │ │
│ │ 📢 Welcome new members from BGC chapter!    1d ago │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ UPCOMING EVENTS                         [View All →]│ │
│ │ 📅 Saturday Open Play - Aug 20, 2PM - 24 slots     │ │
│ │ 📅 Monthly Tournament - Aug 27, 9AM - 16 slots     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ PREVIOUS EVENTS                         [View All →]│ │
│ │ 📅 Friday Night Ladder - Aug 15 - 18 players       │ │
│ │ 📅 Beginner Clinic - Aug 10 - 12 players           │ │
│ │ 📅 July Tournament - Jul 27 - 24 players           │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ RECENT CLUB MATCHES                     [View All →]│ │
│ │ Maria def. Juan  11-8, 11-6  • Open Play  Today    │ │
│ │ Kevin def. Pedro  11-9, 9-11, 11-7  • Ladder  Yday │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ MEMBERS (48)                            [View All →]│ │
│ │ 👤 Miguel Santos (Owner) 5.34                      │ │
│ │ 👤 Kevin Reyes (Admin) 5.12                        │ │
│ │ 👤 Maria Cruz (Member) 4.85                        │ │
│ │ ... +45 more                                        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Club Admin View (Additional Sections)

If user is OWNER/ADMIN:

```
┌─────────────────────────────────────────────────────────┐
│ ADMIN PANEL                                             │
├─────────────────────────────────────────────────────────┤
│ 📋 Pending Requests (3)                                 │
│ 📊 Club Analytics                                       │
│ ⚙️ Club Settings                                        │
│ 📢 Create Announcement                                  │
│ 📅 Create Event                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 3. API Endpoints Needed

### For Player Dashboard

| Endpoint | Status | Description |
|----------|--------|-------------|
| `GET /api/v1/auth/me` | ✅ Exists | Current user |
| `GET /api/v1/players/me` | ✅ Exists | Player profile |
| `GET /api/v1/players/me/ratings` | ✅ Exists | Ratings |
| `GET /api/v1/players/me/rating-history` | ✅ Exists | Rating over time |
| `GET /api/v1/rankings` | ✅ Exists | Find self in rankings |
| `GET /api/v1/matches?participant=me` | ❌ Needs filter | My matches |
| `GET /api/v1/events?registered=me` | ❌ Needs filter | My registered events |
| `GET /api/v1/clubs/mine` | ✅ Exists | My clubs |
| `GET /api/v1/notifications/unread-count` | ✅ Exists | Pending actions count |

### For Club Dashboard

| Endpoint | Status | Description |
|----------|--------|-------------|
| `GET /api/v1/clubs/{id}` | ✅ Exists | Club details |
| `GET /api/v1/clubs/{id}/members` | ✅ Exists | Member list |
| `GET /api/v1/clubs/{id}/stats` | ✅ Exists | Club statistics |
| `GET /api/v1/clubs/{id}/rankings` | ❌ Needs new | Club member rankings |
| `GET /api/v1/clubs/{id}/matches` | ❌ Needs new | Matches in club events |
| `GET /api/v1/clubs/{id}/events` | ❌ Needs new | Club events (with status filter) |
| `GET /api/v1/clubs/{id}/announcements` | ✅ Exists | Club announcements |

---

## 4. Data Requirements

### Player Rank Calculation

```typescript
// Find player's rank in their region
const rankings = await fetch('/api/v1/rankings?rating_type=singles&province=Cebu')
const myRank = rankings.findIndex(r => r.player_id === myPlayerId) + 1
const totalPlayers = rankings.length
const percentile = Math.round((1 - myRank / totalPlayers) * 100)
```

### Rating Trend

```typescript
// Calculate rating change over period
const history = await fetch('/api/v1/players/me/rating-history?days=30')
const oldest = history[0]?.rating_value ?? currentRating
const change = currentRating - oldest
const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
```

---

## 5. Remove from Current Dashboard

The following should be **removed** from player dashboard:

1. **Top Players Podium** (lines 138-178 in current code)
   - Move to club page only

2. **Hardcoded `topPlayers` array** (lines 41-45)
   - Delete entirely

3. **Hardcoded `recentActivity` array** (lines 35-39)
   - Replace with real feed data

---

## 6. Implementation Checklist

### Player Dashboard
- [ ] Remove podium section
- [ ] Connect rating to real API (already done)
- [ ] Connect rank position to rankings API
- [ ] Calculate rank percentile
- [ ] Connect rating chart to rating-history API
- [ ] Add "My Recent Matches" section
- [ ] Add "Pending Actions" section
- [ ] Add "My Upcoming Events" section
- [ ] Add "My Clubs" quick links

### Club Dashboard
- [ ] Add club stats summary
- [ ] Add top members podium
- [ ] Add club rankings section
- [ ] Add recent club matches
- [ ] Add previous events section
- [ ] Add upcoming events section
- [ ] Ensure announcements show
- [ ] Add admin panel for staff

### New Endpoints
- [ ] `GET /api/v1/clubs/{id}/rankings` — club member leaderboard
- [ ] `GET /api/v1/clubs/{id}/matches` — matches from club events
- [ ] `GET /api/v1/clubs/{id}/events` — club events with status filter
- [ ] `GET /api/v1/matches?participant={playerId}` — player's matches filter
- [ ] `GET /api/v1/events?registered={playerId}` — player's registered events
