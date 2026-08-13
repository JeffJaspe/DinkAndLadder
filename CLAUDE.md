# DinkAndLadder — Claude Code Project Instructions

## Mission

You are the implementation agent for DinkAndLadder.

Build the product strictly from the documentation in `/docs`. The documentation is the source of truth for architecture, scope, database direction, security, testing, and execution order.

Before changing code:

1. Read this file completely.
2. Read `/docs/PLAN.md`.
3. Read `/docs/PROJECT-STATUS.md`.
4. Read the relevant domain and feature specifications.
5. Check `/docs/IMPLEMENTATION-BACKLOG.md`.
6. Identify the first unfinished task in the required sequence.

Do not ask the user to restate project context that is already documented.

---

# 1. Non-Negotiable Architecture

DinkAndLadder uses this logical layering:

1. Database
2. DTOs
3. Repositories
4. Services
5. Controllers
6. UI
7. Testing
8. Security
9. DevOps

The planning documentation sometimes lists Controllers before Services. The implementation dependency order is intentionally:

Database → DTOs → Repositories → Services → Controllers → UI → Testing → Security review → DevOps

Controllers must remain thin. Services own business logic. Repositories own data access. DTOs define API contracts. Database schema is managed by Liquibase.

---

# 2. Technology Direction

## Web
- Nuxt 3
- Vue 3
- TypeScript
- Tailwind CSS

## Mobile
- Flutter is the planned mobile client.
- Mobile consumes the same backend/API contracts as the web application.

## Data Platform
- PostgreSQL
- Supabase initially
- Liquibase is the database migration source of truth

## Testing
- Vitest
- Vue Test Utils / Testing Library where appropriate
- Playwright for critical end-to-end flows

## Deployment Direction
- Vercel is acceptable for the Nuxt web application.
- Supabase is the initial PostgreSQL/platform provider.
- Architecture must remain portable to AWS RDS/Aurora PostgreSQL.

---

# 3. Database Rules

- Never treat the Supabase dashboard as the schema source of truth.
- Every schema change must be represented by Liquibase.
- Prefer PostgreSQL-standard capabilities.
- Use UUID identifiers.
- Add audit timestamps consistently.
- Add indexes intentionally, especially on foreign keys and common filters.
- Use soft deletion only where business semantics require it.
- Design RLS explicitly.
- Database changes must be reviewed before application code depends on them.
- Do not silently rename or remove columns used by existing application code.
- Avoid destructive migrations unless the change plan explicitly includes a safe migration path.

---

# 4. Domain Rules

Current domain boundaries:

- Identity
- Player
- Club
- Match
- Rating
- Event
- Notification

Keep domain responsibilities isolated.

A domain must not directly manipulate another domain's database tables when an application/domain service boundary is more appropriate.

Do not introduce microservices for the MVP. Use a modular monolith with extraction-ready boundaries.

---

# 5. Feature Implementation Rule

For every feature:

1. Define/verify database impact.
2. Create Liquibase changeset(s).
3. Define request/response DTOs.
4. Implement repository/data-access layer.
5. Implement service/business logic.
6. Implement controller/API layer.
7. Implement web UI.
8. Keep mobile compatibility in API design.
9. Add unit tests.
10. Add integration tests when persistence/workflows are involved.
11. Add Playwright coverage for critical user journeys.
12. Review security and RLS implications.
13. Update implementation status and backlog.

Do not skip layers merely because a framework makes a shortcut possible.

---

# 6. Scope Control

The MVP is:

1. Authentication
2. Player Profiles
3. Club Management
4. Match Submission
5. Match Verification
6. Rating Engine
7. Rankings

Do not implement payments, federation integration, public API, advanced social features, or enterprise multi-tenancy before the MVP unless the backlog explicitly moves them into scope.

---

# 7. Unresolved Business Decisions

Some product rules were intentionally not finalized during planning.

Most important:

- Final rating algorithm (ELO vs another model)
- Exact match verification policy
- Final ranking eligibility rules
- Tournament rule variations

Do not invent production business rules for these.

Instead:
- Preserve clear interfaces.
- Add configuration points where appropriate.
- Create ADRs for unresolved decisions.
- Implement only the behavior that is explicitly defined in the current specification.

For the rating engine, build an isolated domain service and test harness first. Do not hard-code an invented production rating formula.

---

# 8. Definition of Done

A task is complete only when:

- Code follows the documented architecture.
- Relevant Liquibase migration exists.
- DTOs are explicit.
- Repository/data access is isolated.
- Business logic is in services.
- Controllers are thin.
- UI handles loading, empty, success, and error states.
- Unit tests exist for business logic.
- Integration tests exist for persistence/workflows where relevant.
- Playwright covers critical user flows.
- Security/RLS is reviewed.
- Documentation/backlog status is updated.
- Existing tests still pass.
- Type checking and build pass.

---

# 9. How To Work

Work on one backlog item at a time.

Before implementing:
- summarize the task in a few lines internally,
- inspect existing code,
- identify dependencies,
- make the smallest coherent change.

After implementing:
- run the relevant tests,
- run type checking,
- run lint/build as appropriate,
- check migration integrity,
- update `/docs/PROJECT-STATUS.md`.

Do not rewrite unrelated code.

Do not introduce new libraries unless justified and documented.

---

# 10. Completion Reporting

At the end of each task, report:

- Task completed
- Files changed
- Database changes
- Tests added/updated
- Validation performed
- Remaining work
- Any newly discovered architectural decision

Then continue only to the next backlog item when the task is actually complete.
