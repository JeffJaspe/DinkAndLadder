# Event Specification

## Purpose

Events are organized competitions hosted by clubs. An event can contain one or more tournaments (brackets), each with its own format, registration, and match progression.

## Core Concepts

### Event
A scheduled competition with:
- hosting club
- name and description
- location (venue, province, city)
- date range (start_date, end_date)
- registration period (registration_opens, registration_closes)
- status lifecycle
- visibility (public/private)

### Event Status Lifecycle
- `draft` — event created but not published
- `published` — visible, registration open (if within registration period)
- `registration_closed` — registration period ended, event not yet started
- `in_progress` — event actively running
- `completed` — all tournaments finished
- `cancelled` — event cancelled

### Tournament (Bracket)
A single competition within an event:
- event_id (parent)
- name (e.g., "Men's Singles", "Mixed Doubles Open")
- format: the DEFAULT its categories inherit. Five values (ADR-004, Liquibase
  031-tournament-format):
  - `round_robin` — everyone plays everyone
  - `single_elimination` — one loss and you're out
  - `double_elimination` — two losses and you're out
  - `round_robin_single_elimination` — group stage then knockout
  - `round_robin_double_elimination` — group stage then double-elim playoffs

  `pool_play` was renamed to `round_robin_single_elimination`; it is no longer
  a valid value and the CHECK constraint refuses it.
- match_type: `singles` or `doubles`
- skill_level: optional rating range restrictions
- max_participants
- registration_fee (future, nullable for now)
- status lifecycle mirrors event but is independent

### Tournament Category
What players actually enter. A tournament holds one or more, and each carries its
own shape — the tournament's values are only the defaults a category inherits at
the moment it is created:
- name and rating band (from a template, or custom)
- `match_type` — `singles` or `doubles`, nullable meaning "inherit" (030)
- `format` — one of the five above, nullable meaning "inherit" (031)
- `max_participants` — capacity is a CATEGORY's business. The 3.5s and the Open
  draw fill independently, so the event-level count is not shown for a tournament.

Resolution goes through `resolveMatchType` / `resolveFormat` everywhere, so the
generator, the draw view and the settings form cannot disagree.

An organiser may edit a published category's name, capacity, rating band and
format. `match_type` locks (`MATCH_TYPE_LOCKED`) once anyone has entered, because
every doubles entry carries a partner a switch to singles would orphan.

### Registration
- player_id or team (for doubles)
- tournament_id
- status: `pending`, `confirmed`, `waitlisted`, `withdrawn`, `rejected`
- registered_at, confirmed_at

## Data Model

### events
- id (uuid, PK)
- club_id (FK to clubs)
- name (text, required)
- description (text, nullable)
- venue (text, nullable)
- province (text, nullable)
- city (text, nullable)
- start_date (date)
- end_date (date)
- registration_opens (timestamptz)
- registration_closes (timestamptz)
- status (event lifecycle)
- visibility ('public' | 'private')
- created_by_player_id (FK to player_profiles)
- created_at, updated_at

### tournaments
- id (uuid, PK)
- event_id (FK to events)
- name (text, required)
- format (tournament format enum)
- match_type ('singles' | 'doubles')
- min_rating (numeric, nullable)
- max_rating (numeric, nullable)
- max_participants (int, nullable)
- status (tournament lifecycle)
- created_at, updated_at

### tournament_registrations
- id (uuid, PK)
- tournament_id (FK to tournaments)
- player_id (FK to player_profiles) — for singles
- partner_player_id (FK, nullable) — for doubles
- status (registration status enum)
- registered_at (timestamptz)
- confirmed_at (timestamptz, nullable)
- created_at

### bracket_matches
- id (uuid, PK)
- tournament_id (FK to tournaments)
- round (int) — 1, 2, 3... or negative for losers bracket
- position (int) — position within round
- match_id (FK to matches, nullable) — linked once played
- participant1_registration_id (FK, nullable)
- participant2_registration_id (FK, nullable)
- winner_registration_id (FK, nullable)
- status: `pending`, `ready`, `in_progress`, `completed`, `bye`
- scheduled_at (timestamptz, nullable)
- created_at

## Authorization

### Event Management
- Club OWNER/ADMIN can create events for their club
- Event creator can edit/cancel their own events
- Club OWNER/ADMIN can edit/cancel any club event

### Registration
- Any player with a public profile can register for public events
- Registration validation: rating range, max participants, registration period
- Players can withdraw their own registration
- Event organizers can confirm/reject/waitlist registrations

### Bracket Management
- Event organizers can seed brackets, record results
- Match results should link to the Match domain for rating calculation

## API Endpoints

### Events
- `POST /api/v1/events` — create event (club admin)
- `GET /api/v1/events` — list public events (paginated, filterable)
- `GET /api/v1/events/{eventId}` — get event details
- `PATCH /api/v1/events/{eventId}` — update event (organizer)
- `POST /api/v1/events/{eventId}/publish` — publish draft event
- `POST /api/v1/events/{eventId}/cancel` — cancel event

### Tournaments
- `POST /api/v1/events/{eventId}/tournaments` — create tournament
- `GET /api/v1/events/{eventId}/tournaments` — list event tournaments
- `PATCH /api/v1/events/{eventId}/tournaments/{tournamentId}` — update
- `POST /api/v1/events/{eventId}/tournaments/{tournamentId}/generate-bracket` — generate bracket

### Registrations
- `POST /api/v1/tournaments/{tournamentId}/register` — register self
- `GET /api/v1/tournaments/{tournamentId}/registrations` — list registrations
- `PATCH /api/v1/tournaments/{tournamentId}/registrations/{registrationId}` — update status
- `DELETE /api/v1/tournaments/{tournamentId}/registrations/{registrationId}` — withdraw

### Brackets
- `GET /api/v1/tournaments/{tournamentId}/bracket` — get bracket state
- `PATCH /api/v1/bracket-matches/{bracketMatchId}` — update bracket match (link result)

## Phase 2 Scope

For the initial Phase 2 implementation:
1. Events — create, list, view, basic lifecycle
2. Tournaments — single format (single_elimination) initially
3. Registrations — basic registration flow
4. Brackets — manual seeding, basic progression

Defer to later:
- ~~Multiple bracket formats~~ — DONE. All five, chosen per category.
- Automatic seeding based on ratings
- Registration fees/payments
- Waitlist automation
- Check-in workflow

## Security

- RLS: events visible based on visibility + club membership
- RLS: registrations visible to participants and organizers
- Service-role for bracket progression (cross-player writes)
- Audit: event creation, cancellation, registration changes

## Testing

- Unit tests for bracket generation logic
- Unit tests for registration validation
- E2E tests for event creation and registration flow
