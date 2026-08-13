# DevOps Architecture

## Environments

- Local
- Development
- Staging
- Production

## CI Pipeline

Minimum checks:
1. Install dependencies
2. Lint
3. Typecheck
4. Unit tests
5. Integration tests where configured
6. Playwright
7. Build

## Database Deployment

Liquibase migrations must be versioned and executed in CI/CD or a controlled deployment step.

Do not edit production schema manually.

## Secrets

Never commit:
- database passwords,
- Supabase service keys,
- API keys,
- OAuth secrets.

Use environment/secret management.

## Observability

Production should have:
- structured logs,
- application error tracking,
- database monitoring,
- audit visibility.

## Backups

Use provider-supported PostgreSQL backups and establish recovery expectations before production launch.

## Portability

Avoid coupling core application logic to:
- Vercel-only functionality,
- Supabase-only schema behavior,
- provider-specific database extensions unless explicitly justified.
