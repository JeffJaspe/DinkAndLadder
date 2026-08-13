# Rankings Specification

## Status

Ranking rules are partially defined and require product lock before release.

## Required Capabilities

- player rankings
- rating-based ordering
- filter by rating type
- filter by province/city where supported
- future club/event/national scopes

## National Rankings

National rankings are future roadmap scope, not MVP.

## Eligibility

Before publishing rankings, define:
- minimum matches,
- provisional treatment,
- inactive player handling,
- verification requirement,
- dispute handling,
- time window if used,
- rating category.

Do not invent these rules.

## Ranking Stability

Current rankings should be queryable efficiently.

Historical rankings should use snapshots where official historical reporting is required.
