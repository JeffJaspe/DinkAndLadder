# Club Announcements Specification

## Purpose

Enable club administrators to communicate with members through announcements, keeping the community informed about events, news, and updates.

## Core Concepts

### Announcement Types
- `general` — general club news
- `event` — event-related announcements (linked to an event)
- `maintenance` — facility/schedule changes
- `urgent` — time-sensitive information

### Announcement Visibility
- `all_members` — visible to all club members
- `active_members` — visible only to active (not pending) members
- `admins_only` — visible only to admins and owners

### Announcement Status
- `draft` — not yet published
- `published` — visible to target audience
- `archived` — hidden from default views but retained

## Data Model

### club_announcements
- id (uuid, PK)
- club_id (FK to clubs)
- author_player_id (FK to player_profiles)
- title (text, required)
- body (text, required)
- announcement_type (enum)
- visibility (enum)
- status (enum)
- event_id (FK to events, nullable — for event-linked announcements)
- pinned (boolean, default false)
- published_at (timestamptz, nullable)
- archived_at (timestamptz, nullable)
- created_at
- updated_at

### club_announcement_reads
Track which members have read announcements:
- id (uuid, PK)
- announcement_id (FK to club_announcements)
- player_id (FK to player_profiles)
- read_at (timestamptz)

Constraint: unique on (announcement_id, player_id)

## Authorization

### Creating/Editing Announcements
- OWNER: full access
- ADMIN: can create and edit own announcements
- MODERATOR: can create announcements (not edit others')
- MEMBER: no announcement permissions

### Viewing Announcements
- Based on announcement visibility setting
- Respects member status (pending vs active)
- Archived announcements visible only to admins

## API Endpoints

### Announcements
- `POST /api/v1/clubs/{clubId}/announcements` — create announcement
- `GET /api/v1/clubs/{clubId}/announcements` — list announcements (filtered by visibility)
- `GET /api/v1/clubs/{clubId}/announcements/{announcementId}` — get announcement
- `PATCH /api/v1/clubs/{clubId}/announcements/{announcementId}` — update announcement
- `POST /api/v1/clubs/{clubId}/announcements/{announcementId}/publish` — publish draft
- `POST /api/v1/clubs/{clubId}/announcements/{announcementId}/archive` — archive
- `POST /api/v1/clubs/{clubId}/announcements/{announcementId}/pin` — pin/unpin
- `POST /api/v1/clubs/{clubId}/announcements/{announcementId}/read` — mark as read

### Aggregated
- `GET /api/v1/announcements/unread` — get unread announcements across all clubs

## Query Parameters

- `status` — filter by status (published, draft, archived)
- `type` — filter by announcement type
- `pinned` — filter pinned only
- `limit`, `offset` — pagination

## Notifications

- `club.announcement_published` — when a new announcement is published
  - Sent to all members matching the visibility setting
  - Can be batched (daily digest) per user preference

## UI Features

- Announcement list on club page
- Pinned announcements at top
- Unread indicator
- Rich text body (Markdown support)
- Quick actions (archive, pin)

## Phase 3 Scope

Initial implementation:
1. Announcements table and repository
2. Basic CRUD endpoints
3. Publish/archive lifecycle
4. Read tracking
5. Club page integration
6. Notifications on publish

Defer to later:
- Rich text editor
- Scheduled publishing
- Announcement reactions
- Comments on announcements
- Email notifications
- Push notifications
