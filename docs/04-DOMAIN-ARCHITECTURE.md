# Domain Architecture

## Identity Domain

Responsibilities:
- account identity
- authentication linkage
- OAuth linkage
- user devices
- account lifecycle

Does not own player business behavior.

## Player Domain

Responsibilities:
- player profile
- player preferences
- privacy
- player-visible statistics and rating summary
- club membership references

## Club Domain

Responsibilities:
- club identity
- club profile
- club membership
- club roles
- club invitations

## Match Domain

Responsibilities:
- match lifecycle
- participants
- teams
- scores
- verification
- dispute state

## Rating Domain

Responsibilities:
- rating calculation
- rating transactions
- rating history
- ranking eligibility input
- ranking snapshots

## Event Domain

Responsibilities:
- events
- registrations
- brackets
- competition scheduling

## Notification Domain

Responsibilities:
- notification records
- delivery status
- push/in-app notification abstraction

## Domain Interaction

Match
→ Verification
→ Rating

Club
→ Membership
→ Player relationship

Event
→ Registration
→ Match

Notification
← events from other domains

Avoid direct coupling between unrelated domains.
