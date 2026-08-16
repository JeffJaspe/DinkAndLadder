# DinkAndLadder UI Functionality Map

## Product Overview
Philippine pickleball platform for player ratings, match tracking, clubs, tournaments, and rankings.

## User Roles
- **Guest**: Browse public content (players, clubs, rankings, events)
- **Player**: Authenticated user with profile, can join clubs, submit matches
- **Club Staff**: OWNER/ADMIN/MODERATOR of a club
- **System Admin**: Platform-wide moderation (future)

---

## Page Structure & Features

### 1. PUBLIC PAGES (No Login Required)

#### Landing Page `/`
- Hero section with tagline
- Feature highlights (ratings, clubs, rankings)
- Call-to-action: Register / Login
- Public stats preview (total players, matches, clubs)

#### Login `/login`
- Email/password form
- Google OAuth button
- "Forgot password" link
- Link to register

#### Register `/register`
- Email/password form
- Google OAuth button
- Terms acceptance checkbox
- Link to login

#### Password Reset `/reset-password`
- Email input
- Send reset link button

#### Player Search `/players`
- Search by name
- Filter by province/city
- Player cards with: avatar, name, rating, location
- Click → Player Profile

#### Player Profile `/players/[id]`
- Avatar, display name, bio
- Current ratings (singles/doubles)
- Achievement badges (top 5)
- Recent match history
- Follow/Unfollow button (if logged in)
- Stats summary: wins, losses, win rate

#### Club Discovery `/clubs`
- Search by name
- Filter by province/city
- Club cards with: logo, name, member count, location
- Click → Club Details

#### Club Details `/clubs/[id]`
- Club banner/logo, name, description
- Location, website, contact
- Member roster (public members)
- Upcoming events
- Join Request button (if logged in)
- **Staff View**: Announcements panel, member management

#### Rankings `/rankings`
- Toggle: Singles / Doubles
- Filter by region/province/city
- Sortable table: Rank, Player, Rating, Matches, Trend
- Pagination

#### Events `/events`
- Filter by status (upcoming, ongoing, past)
- Filter by region
- Event cards: name, dates, venue, registration status
- Click → Event Details

#### Event Details `/events/[id]`
- Event info: name, description, venue, dates
- Tournament list with brackets
- Registration button (if logged in)
- Organizer info

---

### 2. AUTHENTICATED PAGES (Login Required)

#### Dashboard `/dashboard`
- Welcome message with user name
- Quick stats: rating, rank, matches this month
- Recent activity feed
- Pending actions: verification requests, club invites
- Quick links: Submit Match, My Clubs, Rankings

#### My Profile `/profile`
- View own profile (same as public but editable)
- Edit button → Edit Profile

#### Edit Profile `/profile/edit`
- Avatar upload
- Display name
- Bio/about
- Location (province/city)
- Skill level self-assessment
- Privacy settings (public/private)
- Save/Cancel buttons

#### Settings `/settings`
- Navigation to sub-settings:
  - Profile settings
  - API Keys
  - Webhooks
  - Notification preferences (future)

#### API Keys `/settings/api-keys`
- List of API keys with: name, prefix, last used, created date
- Create new key button → modal
- Revoke button per key
- Copy key on creation (shown once)

#### Webhooks `/settings/webhooks`
- List of webhook subscriptions
- URL, events subscribed, status
- Add webhook → modal with URL + event checkboxes
- Delete button
- View delivery history

#### Notifications `/notifications`
- List of notifications grouped by date
- Mark as read / Mark all read
- Notification types: match verification, club invite, achievement unlocked
- Click → relevant page

#### Activity Feed `/feed`
- Posts from followed players
- Activity types: match played, rating changed, achievement earned
- Like/comment (future)

#### Following `/following`
- Tabs: Following / Followers
- Player cards with unfollow/follow button
- Search within lists

#### Achievements `/achievements`
- All achievements with unlock status
- Categories: Matches, Wins, Rating, Social, Club, Tournament
- Progress bars for in-progress achievements
- Total points display

---

### 3. MATCH FLOW

#### Submit Match `/matches/submit`
- Match type toggle: Singles / Doubles
- Player selection (search + autocomplete)
- Score entry per game (best of 3/5)
- Date/time picker
- Optional: venue, notes
- Submit button → pending verification

#### My Matches `/matches`
- Tabs: All / Pending / Verified / Disputed
- Match cards: date, opponent(s), score, status
- Click → Match Details

#### Match Details `/matches/[id]`
- Full match info: players, scores, date, venue
- Verification status with timeline
- Actions (if pending): Confirm / Reject / Dispute
- Rating impact preview

---

### 4. CLUB FLOW

#### My Clubs `/my-clubs`
- List of clubs user belongs to
- Role badge per club (Owner/Admin/Mod/Member)
- Quick actions: View, Leave
- Create Club button

#### Create Club `/create-club`
- Club name (required)
- Description
- Logo upload
- Location (province/city)
- Website, contact info
- Visibility: public/private
- Create button

#### Club Management `/clubs/[id]/manage` (Staff Only)
- Tabs: Members, Requests, Settings, Announcements
- **Members**: role management, remove members
- **Requests**: approve/reject join requests
- **Settings**: edit club info, transfer ownership
- **Announcements**: create/edit/publish/archive

#### Club Announcements `/clubs/[id]/announcements`
- List of announcements (pinned first)
- Create announcement (staff)
- Edit/Archive/Pin toggles
- Visibility: all members / admins only

---

### 5. EVENT/TOURNAMENT FLOW

#### Create Event `/create-event` (Club Staff)
- Event name, description
- Venue, dates
- Registration window
- Visibility: public/private
- Create button

#### Event Management `/events/[id]/manage`
- Edit event details
- Create tournaments within event
- Manage registrations
- Generate brackets
- Publish/Cancel event

#### Tournament Details `/tournaments/[id]`
- Tournament info: format, category, status
- Bracket visualization
- Registration list
- Register/Withdraw button
- Match results entry (organizer)

---

### 6. ANALYTICS

#### My Stats `/stats`
- Personal statistics dashboard
- Rating history chart (line graph)
- Win/loss breakdown (pie chart)
- Performance by opponent rating
- Monthly activity heatmap

#### Player Stats `/players/[id]/stats` (Public)
- Same as My Stats but for any public player

#### Club Stats `/clubs/[id]/stats` (Admin Only)
- Total members, growth chart
- Match activity within club
- Top players leaderboard
- Event participation

---

### 7. PAYMENT/SUBSCRIPTION (Future Live Integration)

#### Subscription Plans `/subscribe`
- Plan comparison cards: Free, Pro, Club
- Feature breakdown table
- Select plan → checkout

#### My Subscription `/subscription`
- Current plan display
- Billing history
- Upgrade/Downgrade buttons
- Cancel subscription

#### Checkout `/checkout`
- Order summary
- Payment method: Card (Stripe) / GCash / PayMongo
- Billing address
- Confirm payment

---

## UI Components Needed

### Navigation
- Top navbar: logo, search, notifications bell, user menu
- Mobile: hamburger menu with slide-out drawer
- Breadcrumbs for deep pages

### Cards
- PlayerCard: avatar, name, rating, location, follow button
- ClubCard: logo, name, members, location, join button
- MatchCard: date, players, score, status badge
- EventCard: name, dates, venue, registration status
- AchievementCard: icon, name, description, unlock status
- NotificationCard: icon, message, timestamp, read status

### Forms
- Input fields with validation states
- Search with autocomplete
- Date/time pickers
- File upload (avatar, logo)
- Multi-select (player search for doubles)
- Toggle switches
- Radio button groups

### Data Display
- Rating badge (color-coded by level)
- Rank badge (#1, #2, etc.)
- Status badges (pending, verified, disputed)
- Progress bars (achievements)
- Trend indicators (up/down arrows)
- Charts: line, bar, pie
- Tables with sorting/pagination
- Bracket visualization (single elimination)

### Feedback
- Toast notifications (success, error, info)
- Loading spinners/skeletons
- Empty states with illustrations
- Error states with retry
- Confirmation modals
- Success animations

### Layout
- Responsive grid (mobile-first)
- Sticky headers
- Infinite scroll / pagination
- Tabs
- Accordions
- Modals/dialogs
- Side panels

---

## Color Semantics (Suggested)

| Element | Color Intent |
|---------|--------------|
| Primary action | Blue (#3B82F6) |
| Success/verified | Green (#10B981) |
| Warning/pending | Yellow (#F59E0B) |
| Error/rejected | Red (#EF4444) |
| Rating high | Gold (#F59E0B) |
| Rating mid | Silver (#9CA3AF) |
| Rating low | Bronze (#B45309) |

---

## User Flows

### New User Onboarding
1. Landing → Register
2. Email confirmation
3. Create profile (name, avatar, location)
4. Skill assessment questionnaire
5. Dashboard with guided tour

### Submit & Verify Match
1. Dashboard → Submit Match
2. Select opponent(s), enter scores
3. Submit → Pending
4. Opponent receives notification
5. Opponent confirms/rejects
6. Both see rating update

### Join Club
1. Club Discovery → Find club
2. Club Details → Request to Join
3. Wait for approval
4. Notification: Approved
5. My Clubs shows new club

### Organize Tournament
1. My Clubs → Club page
2. Create Event
3. Add Tournament
4. Open Registration
5. Close Registration → Generate Bracket
6. Record match results
7. Declare winner

---

## Mobile Considerations

- Bottom navigation: Home, Search, Submit, Clubs, Profile
- Pull-to-refresh on lists
- Swipe actions (mark read, quick verify)
- Large tap targets (44px minimum)
- Score entry optimized for thumbs
- QR code scanning for quick player lookup

---

## Accessibility

- ARIA labels on interactive elements
- Keyboard navigation support
- Color contrast AA compliance
- Screen reader friendly
- Focus indicators
- Error messages linked to inputs

---

## API Endpoints Reference

### Auth
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/callback (OAuth)

### Players
- GET /api/v1/players/search
- GET /api/v1/players/me
- PATCH /api/v1/players/me
- GET /api/v1/players/:id
- GET /api/v1/players/:id/stats
- GET /api/v1/players/:id/achievements
- POST /api/v1/players/:id/follow
- DELETE /api/v1/players/:id/follow

### Clubs
- GET /api/v1/clubs/search
- POST /api/v1/clubs
- GET /api/v1/clubs/:id
- PATCH /api/v1/clubs/:id
- GET /api/v1/clubs/:id/members
- POST /api/v1/clubs/:id/join
- POST /api/v1/clubs/:id/leave

### Matches
- POST /api/v1/matches
- GET /api/v1/matches
- GET /api/v1/matches/:id
- POST /api/v1/matches/:id/verification/decision

### Rankings
- GET /api/v1/rankings

### Events
- GET /api/v1/events
- POST /api/v1/events
- GET /api/v1/events/:id
- GET /api/v1/tournaments/:id
- POST /api/v1/tournaments/:id/registrations

### Notifications
- GET /api/v1/notifications
- PATCH /api/v1/notifications/:id/read

### Settings
- GET /api/v1/api-keys
- POST /api/v1/api-keys
- DELETE /api/v1/api-keys/:id
- GET /api/v1/webhooks
- POST /api/v1/webhooks

---

*Use this document to brief a UI/UX designer or AI tool (ChatGPT, Figma AI) on the full application scope.*
