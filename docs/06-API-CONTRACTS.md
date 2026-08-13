# API Contracts

## API Principles

- API is versionable.
- DTOs are explicit.
- Database models are never exposed directly.
- Errors use a consistent structure.
- Pagination is standardized.
- Mobile clients receive complete contract-friendly responses.

## Suggested Base Path

`/api/v1`

## Response Principles

Use resource DTOs instead of returning raw database rows.

## Common DTOs

### ApiErrorResponse
- code
- message
- details
- trace_id

### PageResponse<T>
- items
- page
- page_size
- total
- has_next

### MutationResponse<T>
- data
- message
- request_id

---

## MVP Endpoint Groups

### Authentication
Authentication is primarily delegated to the configured auth provider. The API still needs authenticated session handling and profile provisioning.

### Players
- GET `/api/v1/players/{playerId}`
- GET `/api/v1/players`
- PATCH `/api/v1/players/me`

### Clubs
- POST `/api/v1/clubs`
- GET `/api/v1/clubs/{clubId}`
- GET `/api/v1/clubs`
- POST `/api/v1/clubs/{clubId}/membership-requests`
- PATCH `/api/v1/clubs/{clubId}/members/{playerId}`

### Matches
- POST `/api/v1/matches`
- GET `/api/v1/matches/{matchId}`
- POST `/api/v1/matches/{matchId}/verification`
- POST `/api/v1/matches/{matchId}/verification/decision`

### Rankings
- GET `/api/v1/rankings`
- GET `/api/v1/players/{playerId}/rating-history`

Exact request/response schemas must be finalized in the relevant feature specification before implementation.

---

## Controller Rules

Controllers:
- authenticate,
- authorize,
- validate request shape,
- call services,
- map service result to response DTO,
- return correct HTTP status.

Controllers must not calculate ratings, modify multiple repositories directly, or contain ranking logic.

---

## Pagination

For mobile-friendly APIs, every list endpoint that can grow substantially must support pagination.

Prefer stable ordering.

---

## Errors

Errors should include machine-readable codes, for example:

- AUTH_REQUIRED
- FORBIDDEN
- VALIDATION_ERROR
- NOT_FOUND
- CONFLICT
- INVALID_MATCH_STATE
- VERIFICATION_REQUIRED
- RATE_CALCULATION_UNAVAILABLE

Do not expose stack traces or database error text to clients.
