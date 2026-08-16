# Notification Specification

## Purpose

Notifications inform users about events relevant to them across the platform. The notification system abstracts delivery channels (in-app, push, email) behind a unified interface.

## Core Concepts

### Notification
A record of something the user should be informed about:
- recipient (user_id)
- type (what happened)
- title and body (display content)
- reference (what entity it relates to)
- read status
- delivery status per channel

### Notification Types

**Club Domain**
- `club.membership_approved` — your request was approved
- `club.membership_rejected` — your request was rejected
- `club.membership_request` — someone requested to join your club (to admins)
- `club.role_changed` — your role was changed

**Match Domain**
- `match.verification_requested` — a match needs your verification
- `match.verified` — a match you participated in was verified
- `match.rejected` — a match was rejected
- `match.disputed` — a match was disputed

**Rating Domain**
- `rating.updated` — your rating changed after a verified match

**Event Domain (Phase 2)**
- `event.registration_confirmed` — your registration was confirmed
- `event.registration_waitlisted` — you were put on waitlist
- `event.match_scheduled` — your bracket match is scheduled
- `event.reminder` — upcoming event/match reminder

### Delivery Channels
- `in_app` — shown in notification center, always delivered
- `push` — mobile/web push notification (requires device registration)
- `email` — email notification (for important events)

### Delivery Preferences
Users can configure per-type preferences:
- which channels to use
- quiet hours
- email digest vs immediate

## Data Model

### notifications
- id (uuid, PK)
- user_id (FK to users)
- type (notification type enum)
- title (text)
- body (text)
- reference_type (text, nullable) — 'club_membership', 'match', 'event', etc.
- reference_id (uuid, nullable)
- read_at (timestamptz, nullable)
- created_at

### notification_deliveries
- id (uuid, PK)
- notification_id (FK to notifications)
- channel ('in_app' | 'push' | 'email')
- status ('pending' | 'sent' | 'delivered' | 'failed')
- sent_at (timestamptz, nullable)
- delivered_at (timestamptz, nullable)
- error_message (text, nullable)
- created_at

### notification_preferences
- id (uuid, PK)
- user_id (FK to users, unique)
- preferences (jsonb) — per-type channel settings
- quiet_hours_start (time, nullable)
- quiet_hours_end (time, nullable)
- email_digest ('immediate' | 'daily' | 'weekly' | 'none')
- created_at, updated_at

## API Endpoints

### Notifications
- `GET /api/v1/notifications` — list own notifications (paginated)
- `GET /api/v1/notifications/unread-count` — get unread count
- `PATCH /api/v1/notifications/{notificationId}/read` — mark as read
- `POST /api/v1/notifications/mark-all-read` — mark all as read

### Preferences
- `GET /api/v1/notifications/preferences` — get own preferences
- `PATCH /api/v1/notifications/preferences` — update preferences

## Internal Service Interface

The notification service provides an internal interface for other domains:

```typescript
interface NotificationService {
  notify(input: {
    user_id: string
    type: NotificationType
    title: string
    body: string
    reference_type?: string
    reference_id?: string
  }): Promise<void>

  notifyMany(inputs: NotificationInput[]): Promise<void>
}
```

Domains call this service when events occur. The service:
1. Creates the notification record
2. Checks user preferences
3. Queues deliveries for enabled channels
4. Handles push/email delivery asynchronously

## Phase 2 Scope

For the initial Phase 2 implementation:
1. Notification records and in-app display
2. Basic notification listing and mark-as-read
3. Unread count badge
4. Integration with club membership events
5. Integration with match verification events

Defer to later:
- Push notification delivery (requires device registration flow)
- Email delivery (requires email service integration)
- User preferences UI
- Quiet hours
- Email digest

## Security

- RLS: users can only see their own notifications
- RLS: users can only update their own preferences
- Service-role for creating notifications from other domains

## Testing

- Unit tests for notification creation
- Unit tests for preference filtering
- E2E tests for notification listing
