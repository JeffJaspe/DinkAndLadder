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

Per `/docs/09-DEVOPS-ARCHITECTURE.md`, migrations run as a controlled step in CI/CD, never applied manually against production.

Two workflows are involved, and they do different jobs:

| Workflow | Trigger | Database | Purpose |
|---|---|---|---|
| `.github/workflows/ci.yml` (`database` job) | every push and PR | ephemeral `postgres:16` service container, discarded after the run | proves the changelog applies cleanly from zero |
| `.github/workflows/db-migrate.yml` | push to `main` touching `database/liquibase/**`; or manual dispatch | a real Supabase project | actually applies the changelog |

`db-migrate.yml` runs against **db-development** automatically on merge. **db-production** is manual dispatch only, behind a GitHub Environment approval gate. Its `command` input lets you dry-run first: `status` lists pending changesets, `update-sql` prints the SQL without executing it, `update` applies it.

Credentials live as environment-scoped GitHub Secrets (`LIQUIBASE_COMMAND_URL`, `LIQUIBASE_COMMAND_USERNAME`, `LIQUIBASE_COMMAND_PASSWORD`) in the `db-development` and `db-production` environments — the header comment in `db-migrate.yml` documents the exact values. The `db-` prefix keeps them clear of the `Production` / `Preview` / `Development` environments that Vercel's GitHub integration creates for its own deployment records; adding a required reviewer to Vercel's `Production` can leave its deployments waiting on an approval nobody expects.

There is one repository and one `main` branch; dev and prod are distinguished **only** by which environment's secrets the job resolves. To keep a mislabeled secret from pointing `db-development` at production, each environment also declares a plain variable `SUPABASE_PROJECT_REF`, which the workflow checks against the connection username before running anything and echoes unmasked so each run records which database it touched. Restrict the `db-production` environment's deployment branches to `main` as well.

Migrations are deliberately **not** part of the Vercel build. Vercel builds run concurrently per preview branch, and two Liquibase runs would contend for `DATABASECHANGELOGLOCK`; a build also has no approval gate, and would apply schema changes at deploy time rather than before it.

**Apply the migration before deploying the code that depends on it.** `028-event-time` shipped the other way round and every event screen failed with `42703 column events.start_time does not exist`.

That ordering is enforced structurally rather than by memory: `apps/web/vercel.json` sets `git.deploymentEnabled.main = false` so a merge never deploys on its own, and `db-migrate.yml`'s final step POSTs Vercel's deploy hook only after a successful `update`. Set the environment secret `VERCEL_DEPLOY_HOOK_URL` to enable it; leave it unset and deploys stay manual.

## Portability

Changesets must stick to PostgreSQL-standard capabilities so the schema remains portable to AWS RDS/Aurora, per `/docs/PLAN.md` and `/docs/09-DEVOPS-ARCHITECTURE.md`.
