# Club Management Specification

## Club

A club is a first-class organization in DinkAndLadder.

Core properties:
- name
- slug
- description
- location
- logo
- visibility
- status

## Membership

A player can belong to multiple clubs.

Membership has:
- club
- player
- role
- status
- join date
- optional leave date

## Roles

Initial roles:
- OWNER
- ADMIN
- MODERATOR
- MEMBER

Exact permission matrix must be implemented explicitly.

## Club Creation

Authenticated player creates a club.

The creator becomes owner unless future governance rules override this.

## Join Flow

Initial design supports a request/invite/approval model.

Do not assume every club is automatically open to everyone.

## Admin

Club admins can manage club-scoped operations they are authorized for.

They must not receive system-wide permissions.

## Deletion

Club deletion should use a safe lifecycle rather than destructive cascading whenever historical match records would be impacted.
