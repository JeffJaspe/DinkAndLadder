# MVP Scope

## Goal

Deliver a usable first version that lets players establish identity, join clubs, record verified matches, receive ratings, and view rankings.

## MVP Features

### MVP-001 Authentication
- Email/password authentication
- OAuth-ready architecture
- Session-aware API
- Device registration foundation

### MVP-002 Player Profiles
- Display name
- Basic personal profile
- Location
- Bio
- Profile photo
- Playing preferences
- Privacy settings foundation
- Club membership visibility

### MVP-003 Club Management
- Create club
- Club profile
- Membership
- Member roles
- Join/request flow
- Admin management

### MVP-004 Match Submission
- Singles
- Doubles
- Participants
- Team assignment
- Scores
- Played date/time
- Venue
- Submission lifecycle

### MVP-005 Match Verification
- Verification request
- Participant confirmation
- Approval/rejection
- Dispute state foundation
- Rating only after eligible verification

### MVP-006 Rating Engine
- Isolated rating service
- Rating history
- Rating transactions
- Confidence/provisional-state support
- Production algorithm must be finalized via ADR before shipping calculations

### MVP-007 Rankings
- Player ranking views
- Singles/doubles separation where supported
- Club/province filters where supported
- Eligibility rules documented before production ranking release

## Explicitly Out of MVP

- Payments
- Subscription billing
- Federation integration
- Public API
- National rankings
- Full social feed
- Enterprise multi-tenancy

These may exist in roadmap documents but are not implementation targets until promoted.
