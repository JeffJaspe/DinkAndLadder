# Regional Rankings Specification

## Overview

Expand the rankings system to support provincial, regional, and national leaderboards. Players are ranked within their registered location and aggregated up to regional and national levels.

## Philippine Regions

The Philippines is divided into 17 administrative regions:
- NCR (National Capital Region)
- CAR (Cordillera Administrative Region)
- Region I (Ilocos)
- Region II (Cagayan Valley)
- Region III (Central Luzon)
- Region IV-A (CALABARZON)
- Region IV-B (MIMAROPA)
- Region V (Bicol)
- Region VI (Western Visayas)
- Region VII (Central Visayas)
- Region VIII (Eastern Visayas)
- Region IX (Zamboanga Peninsula)
- Region X (Northern Mindanao)
- Region XI (Davao)
- Region XII (SOCCSKSARGEN)
- Region XIII (Caraga)
- BARMM (Bangsamoro)

## Implementation

### Database

Add a `regions` reference table that maps provinces to regions:

```sql
regions (
  id: uuid PK,
  code: varchar(10) UNIQUE,  -- 'NCR', 'CAR', 'I', 'II', etc.
  name: varchar(100),
  sort_order: integer
)

provinces (
  id: uuid PK,
  region_id: uuid FK → regions,
  name: varchar(100),
  sort_order: integer
)
```

Update `player_profiles` to use `province_id` reference (migration from text column).

### Ranking Scopes

1. **National** — All players across Philippines
2. **Regional** — Players within a specific region (NCR, Visayas, etc.)
3. **Provincial** — Players within a specific province
4. **City** — Players within a specific city (existing)

### API Endpoints

Extend existing rankings endpoint:
```
GET /api/v1/rankings?rating_type=singles&scope=national
GET /api/v1/rankings?rating_type=singles&scope=regional&region=ncr
GET /api/v1/rankings?rating_type=singles&scope=provincial&province=metro-manila
GET /api/v1/rankings?rating_type=singles&scope=city&city=makati
```

Add region listing:
```
GET /api/v1/regions — list all regions
GET /api/v1/regions/{regionCode}/provinces — list provinces in region
```

### Ranking Display

Each player's ranking entry shows:
- National rank
- Regional rank (within their region)
- Provincial rank (within their province)

### Eligibility

Same rules as current rankings, applied per scope:
- Must have a non-null rating
- Must have public profile visibility
- Regional/provincial ranks only count players in that location

## Out of Scope

- Cross-country rankings (Philippines only for now)
- Historical regional rankings
- Region-based tournaments (separate from rankings)

## Implementation Notes

1. **Backward compatible**: Existing `/rankings` endpoint continues to work
2. **Performance**: Regional aggregations computed on query (no materialized views initially)
3. **Location data**: Players must update their profile with province to appear in regional rankings
