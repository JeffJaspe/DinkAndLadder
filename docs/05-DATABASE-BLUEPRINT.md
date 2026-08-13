# Database Blueprint

## Database

PostgreSQL.

## Migration Source of Truth

Liquibase.

## General Conventions

- UUID primary keys.
- `created_at timestamptz not null`.
- `updated_at timestamptz not null`.
- `deleted_at timestamptz null` only where soft delete is appropriate.
- Explicit foreign keys.
- Index foreign keys and high-frequency filter columns.
- Unique constraints for business identities.
- Avoid exposing authentication secrets through application tables.

---

## Core Tables

### users
Purpose: application-level user identity reference.

Key columns:
- id UUID PK
- email
- phone_number
- status
- email_verified_at
- last_login_at
- created_at
- updated_at

Notes:
Authentication credentials should remain with the selected auth provider. Do not copy passwords into application tables.

### oauth_accounts
- id UUID PK
- user_id FK users.id
- provider
- provider_user_id
- created_at
- updated_at

Unique: `(provider, provider_user_id)`.

### user_devices
- id UUID PK
- user_id FK
- platform
- push_token
- app_version
- last_seen_at
- created_at
- updated_at

### player_profiles
- id UUID PK
- user_id FK unique
- display_name
- first_name
- last_name
- birth_date (only if product policy requires)
- province_id nullable
- city_id nullable
- bio
- avatar_media_id nullable
- dominant_hand nullable
- preferred_position nullable
- privacy configuration/reference
- created_at
- updated_at
- deleted_at

### clubs
- id UUID PK
- name
- slug unique
- description
- province_id
- city_id
- logo_media_id nullable
- visibility
- status
- created_by_user_id
- created_at
- updated_at
- deleted_at

### club_memberships
- id UUID PK
- club_id FK
- player_id FK
- role
- status
- joined_at
- left_at nullable
- created_at
- updated_at

Unique active-membership rule should prevent duplicate active membership.

### matches
- id UUID PK
- match_type
- status
- submitted_by_player_id
- event_id nullable
- venue_id nullable
- played_at
- submitted_at
- verified_at nullable
- created_at
- updated_at

### match_participants
- id UUID PK
- match_id FK
- player_id FK
- team_number
- result_status
- created_at

Constraints must enforce valid team assignments for the selected match type.

### match_scores
- id UUID PK
- match_id FK
- set_number
- team1_score
- team2_score
- created_at

Unique `(match_id, set_number)`.

### match_verifications
- id UUID PK
- match_id FK
- verifier_player_id FK
- status
- response_note
- responded_at
- created_at
- updated_at

### player_ratings
One current-rating record per player/rating category.

Suggested shape:
- id UUID PK
- player_id FK
- rating_type
- rating_value
- confidence_score
- matches_played
- provisional boolean
- calculated_at
- created_at
- updated_at

Unique `(player_id, rating_type)`.

### rating_transactions
Historical rating changes.
- id UUID PK
- player_id FK
- rating_type
- match_id FK nullable
- old_rating
- new_rating
- rating_delta
- confidence_before
- confidence_after
- calculation_version
- created_at

Do not overwrite historical transactions.

### ranking_snapshots
For future stable ranking history.
- id UUID PK
- ranking_type
- scope_type
- scope_id nullable
- snapshot_date
- rank
- player_id
- rating_value
- eligibility_state
- created_at

---

## Supporting Tables

These may be introduced during implementation as their domain requires them:

- provinces
- cities
- venues
- media_files
- notifications
- notification_deliveries
- events
- event_registrations
- brackets
- bracket_matches
- audit_logs

They should be modeled only when the relevant feature enters the backlog.

---

## Indexing Baseline

Examples:
- users(email)
- oauth_accounts(user_id)
- user_devices(user_id)
- player_profiles(user_id)
- player_profiles(province_id, city_id)
- club_memberships(club_id, status)
- club_memberships(player_id, status)
- matches(played_at)
- matches(status)
- match_participants(match_id)
- match_participants(player_id)
- match_scores(match_id, set_number)
- match_verifications(match_id, status)
- rating_transactions(player_id, created_at)
- ranking_snapshots(ranking_type, snapshot_date, rank)

Only create indexes justified by query patterns and referential access.

---

## Liquibase Module Structure

```text
database/liquibase/
├── db.changelog-master.xml
├── 001-core/
├── 002-player/
├── 003-club/
├── 004-match/
├── 005-rating/
├── 006-event/
├── 007-notification/
└── 008-security/
```

Liquibase changesets should be small, attributable, and ordered.

---

## RLS Direction

RLS is required for client-facing data access.

Examples:
- Player can read/update permitted parts of own profile.
- Player can read public player fields.
- Club members can read permitted club information.
- Club admins can manage club members according to role.
- Match participants can access eligible match data.
- Sensitive audit/admin tables are restricted.

Exact policies must be created with each feature rather than one giant generic policy.

---

## Audit

Sensitive business actions should generate audit events, including:
- role changes,
- membership approval/removal,
- match verification decision,
- administrative profile changes,
- rating corrections.
