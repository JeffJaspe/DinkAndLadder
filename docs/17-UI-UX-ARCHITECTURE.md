# UI/UX Architecture

## Web

Nuxt 3 / Vue 3 / TypeScript / Tailwind CSS.

## Mobile

Flutter.

## Shared Product Principles

- mobile-first interaction patterns for court workflows,
- clear rating presentation,
- clear match state,
- clear verification actions,
- accessible forms,
- loading/empty/error/success states,
- predictable navigation.

## MVP Screens

### Public
- Landing
- Login
- Register
- Player search
- Club discovery

### Authenticated
- Dashboard
- Player Profile
- Edit Profile
- Settings
- Notifications
- My Clubs
- Club Details
- Match Submission
- Match Details
- Verification
- Rankings

## Components

Build reusable domain components:
- PlayerCard
- RatingCard
- ClubCard
- MatchScoreEntry
- VerificationStatus
- RankingList

Avoid exposing backend DTO names directly as UI concerns when a view model is more suitable.
