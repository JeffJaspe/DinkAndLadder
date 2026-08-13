# Liquibase

Liquibase is the source of truth for database schema (`/docs/PLAN.md`, `/docs/05-DATABASE-BLUEPRINT.md`). The Supabase dashboard must never be used to make schema changes directly — every change is a changeset in this directory.

## Structure

```
database/liquibase/
├── liquibase.properties        # shared config (no credentials)
├── db.changelog-master.xml     # includes every domain changelog, in order
├── 001-core/                   # users, oauth_accounts, user_devices
├── 002-player/                 # player_profiles
├── 003-club/                   # clubs, club_memberships
├── 004-match/                  # matches, match_participants, match_scores, match_verifications
├── 005-rating/                 # player_ratings, rating_transactions, ranking_snapshots
├── 006-event/                  # events, registrations, brackets (Phase 2, not yet in scope)
├── 007-notification/           # notifications, notification_deliveries (Phase 2, not yet in scope)
└── 008-security/               # RLS policies and audit_logs added alongside each feature
```

Each domain folder currently holds an empty changelog. Changesets are added when that domain's backlog item begins — do not pre-create tables for future MVP steps.

## Local Development Connection Strategy

Liquibase reads the connection URL, username, and password from environment variables (`LIQUIBASE_COMMAND_URL`, `LIQUIBASE_COMMAND_USERNAME`, `LIQUIBASE_COMMAND_PASSWORD`) rather than from `liquibase.properties`, so credentials are never committed.

1. Copy `database/.env.example` to `database/.env` and fill in your local Postgres or Supabase connection details.
2. Load those variables into your shell before running Liquibase, e.g.:
   ```
   set -a; source database/.env; set +a
   ```
   (PowerShell: `Get-Content database/.env | ForEach-Object { if ($_ -match '^(.*?)=(.*)$') { Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2] } }`)
3. Run Liquibase from `database/liquibase/`, for example:
   ```
   liquibase update
   liquibase status
   liquibase rollback-count 1
   ```

## Installing the Liquibase CLI

The CLI is not bundled with this repo (it's a Java tool, not an npm package). Install it locally via one of:

- Direct download: https://www.liquibase.com/download
- Homebrew (macOS/Linux): `brew install liquibase`
- Scoop (Windows): `scoop install liquibase`

A Java 17+ runtime is required (Java 26 is already available in this environment).

## CI / Production

Per `/docs/09-DEVOPS-ARCHITECTURE.md`, migrations run as a controlled step in CI/CD, never applied manually against production. This gets wired up in P0-004 CI Skeleton.

## Portability

Changesets must stick to PostgreSQL-standard capabilities so the schema remains portable to AWS RDS/Aurora, per `/docs/PLAN.md` and `/docs/09-DEVOPS-ARCHITECTURE.md`.
